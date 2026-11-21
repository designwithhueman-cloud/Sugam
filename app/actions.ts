'use server';
// Server actions. Next.js checks the Origin of every server-action request, and each action
// re-checks the session and the caller's role, so forms cannot be replayed cross-site.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/index.ts';
import { createSession, destroySession, currentUser, hashPassword, verifyPassword, DUMMY_HASH, tooManyAttempts } from '@/lib/auth.ts';
import { orgForSlug, projectAccess, canManage, slugify } from '@/lib/access.ts';
import { checkUrl, BlockedUrlError } from '@/lib/net/guard.ts';
import { isStandard } from '@/lib/standards.ts';
import { enqueueScan } from '@/lib/queue.ts';
import { claimForUser } from '@/lib/claims.ts';
import { clientIp } from '@/lib/ip.ts';
import { hasFeature, LIMITS, type PlanId } from '@/lib/plans.ts';
async function orgPlan(orgId: string): Promise<PlanId> { const db = await getDb(); const [o] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, orgId)); return o?.plan ?? 'free'; }

export type FormState = { error?: string; ok?: string } | undefined;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const safeNext = (n: unknown) => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&%.]*$/.test(n) ? n : '/app');
const ip = async () => clientIp(await headers());

async function uniqueSlug(base: string) {
  const db = await getDb(); let slug = slugify(base); let n = 1;
  while ((await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, slug))).length) slug = `${slugify(base)}-${++n}`;
  return slug;
}

// ---------- accounts ----------
export async function signupAction(_: FormState, f: FormData): Promise<FormState> {
  const email = String(f.get('email') || '').trim().toLowerCase(); const password = String(f.get('password') || ''); const name = String(f.get('name') || '').trim().slice(0, 80);
  if (tooManyAttempts('signup:' + (await ip()), 20)) return { error: 'Too many attempts. Please wait a few minutes.' };
  if (!EMAIL.test(email)) return { error: 'Enter a valid email address.' };
  if (password.length < 10) return { error: 'Use a password of at least 10 characters.' };
  if (password.length > 200) return { error: 'That password is too long.' };
  const db = await getDb();
  if ((await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email))).length) return { error: 'An account with this email already exists. Sign in instead.' };
  const [u] = await db.insert(schema.users).values({ email, name: name || null, passwordHash: hashPassword(password) }).returning();
  const wsName = `${name || email.split('@')[0]}'s workspace`;
  const [o] = await db.insert(schema.organizations).values({ name: wsName, slug: await uniqueSlug(name || email.split('@')[0]) }).returning();
  await db.insert(schema.memberships).values({ organizationId: o.id, userId: u.id, role: 'owner' });
  await createSession(u.id);
  await claimForUser(u.id);
  redirect(safeNext(f.get('next')));
}

export async function loginAction(_: FormState, f: FormData): Promise<FormState> {
  const email = String(f.get('email') || '').trim().toLowerCase(); const password = String(f.get('password') || '');
  if (tooManyAttempts('login:' + email, 8) || tooManyAttempts('loginip:' + (await ip()), 40)) return { error: 'Too many sign-in attempts. Please wait a few minutes.' };
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const ok = verifyPassword(password, u ? u.passwordHash : DUMMY_HASH) && !!u;
  if (!ok) return { error: 'That email and password do not match an account.' };
  await createSession(u.id);
  await claimForUser(u.id);
  redirect(safeNext(f.get('next')));
}

export async function logoutAction() { await destroySession(); redirect('/'); }

// ---------- workspaces ----------
async function need() { const u = await currentUser(); if (!u) redirect('/login'); return u; }

export async function createOrgAction(_: FormState, f: FormData): Promise<FormState> {
  const u = await need(); const name = String(f.get('name') || '').trim().slice(0, 80);
  if (!name) return { error: 'Give the workspace a name.' };
  const db = await getDb();
  const [o] = await db.insert(schema.organizations).values({ name, slug: await uniqueSlug(name) }).returning();
  await db.insert(schema.memberships).values({ organizationId: o.id, userId: u.id, role: 'owner' });
  revalidatePath('/app', 'layout');
  redirect(`/app/${o.slug}`);
}

export async function createClientAction(_: FormState, f: FormData): Promise<FormState> {
  const u = await need(); const a = await orgForSlug(u, String(f.get('org') || ''));
  if (!a) return { error: 'Workspace not found.' };
  const name = String(f.get('name') || '').trim().slice(0, 80);
  if (!name) return { error: 'Give the client a name.' };
  const db = await getDb();
  if ((await db.select({ id: schema.clients.id }).from(schema.clients).where(eq(schema.clients.organizationId, a.org.id))).length >= LIMITS[a.org.plan].clients) return { error: 'Several client workspaces are part of the Agency Pro plan.' };
  await db.insert(schema.clients).values({ organizationId: a.org.id, name });
  redirect(`/app/${a.org.slug}/settings`);
}

async function cleanUrl(v: FormDataEntryValue | null): Promise<string | null | { error: string }> {
  let s = String(v || '').trim(); if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try { return (await checkUrl(s)).toString(); } catch (e) { return { error: e instanceof BlockedUrlError ? e.message : 'Invalid address.' }; }
}

export async function createProjectAction(_: FormState, f: FormData): Promise<FormState> {
  const u = await need(); const a = await orgForSlug(u, String(f.get('org') || ''));
  if (!a) return { error: 'Workspace not found.' };
  const db = await getDb();
  const clientId = String(f.get('clientId') || '');
  let [c] = /^[0-9a-f-]{36}$/i.test(clientId) ? await db.select().from(schema.clients).where(and(eq(schema.clients.id, clientId), eq(schema.clients.organizationId, a.org.id))) : [];
  const newClient = String(f.get('clientName') || '').trim().slice(0, 80);
  const siteCount = (await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.organizationId, a.org.id))).length;
  if (siteCount >= LIMITS[a.org.plan].sites) return { error: a.org.plan === 'agency' ? 'This workspace has reached its 15 sites.' : 'This plan covers one site. The Agency Pro plan covers up to 15.' };
  if (!c && newClient && (await db.select({ id: schema.clients.id }).from(schema.clients).where(eq(schema.clients.organizationId, a.org.id))).length >= LIMITS[a.org.plan].clients) return { error: 'Several client workspaces are part of the Agency Pro plan. Pick your existing client.' };
  if (!c && newClient) [c] = await db.insert(schema.clients).values({ organizationId: a.org.id, name: newClient }).returning();
  if (!c) return { error: 'Choose a client or type a new client name.' };
  const name = String(f.get('name') || '').trim().slice(0, 80);
  if (!name) return { error: 'Give the project a name.' };
  const live = await cleanUrl(f.get('liveUrl')); const staging = await cleanUrl(f.get('stagingUrl'));
  if (live && typeof live === 'object') return { error: `Live URL: ${live.error}` };
  if (staging && typeof staging === 'object') return { error: `Staging URL: ${staging.error}` };
  if (!live && !staging) return { error: 'Add a live URL, a staging URL, or both.' };
  const std = String(f.get('standard') || 'wcag22aa');
  const [p] = await db.insert(schema.projects).values({ organizationId: a.org.id, clientId: c.id, name, liveUrl: live as string | null, stagingUrl: staging as string | null, defaultStandard: isStandard(std) ? std : 'wcag22aa' }).returning();
  revalidatePath('/app', 'layout');
  redirect(`/app/${a.org.slug}/projects/${p.id}`);
}

export async function updateBrandingAction(_: FormState, f: FormData): Promise<FormState> {
  const u = await need(); const a = await orgForSlug(u, String(f.get('org') || ''));
  if (!a) return { error: 'Workspace not found.' };
  if (!canManage(a.role)) return { error: 'Only workspace owners and admins can change branding.' };
  if (!hasFeature(a.org.plan, 'share_links') && (f.get('brandName') || f.get('brandPrimaryColor'))) {
    // Branding only appears on client links (Agency). The workspace name can still be changed.
    const db0 = await getDb(); await db0.update(schema.organizations).set({ name: String(f.get('name') || a.org.name).trim().slice(0, 80) || a.org.name }).where(eq(schema.organizations.id, a.org.id));
    revalidatePath('/app', 'layout'); return { ok: 'Workspace name saved. Report branding is part of the Agency Pro plan.' };
  }
  const color = (k: string) => { const v = String(f.get(k) || '').trim(); return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null; };
  const db = await getDb();
  await db.update(schema.organizations).set({ name: String(f.get('name') || a.org.name).trim().slice(0, 80) || a.org.name, brandName: String(f.get('brandName') || '').trim().slice(0, 80) || null, brandPrimaryColor: color('brandPrimaryColor'), brandAccentColor: color('brandAccentColor') }).where(eq(schema.organizations.id, a.org.id));
  revalidatePath('/app', 'layout');
  return { ok: 'Branding saved. Shared client reports now use it.' };
}

export async function addMemberAction(_: FormState, f: FormData): Promise<FormState> {
  const u = await need(); const a = await orgForSlug(u, String(f.get('org') || ''));
  if (!a) return { error: 'Workspace not found.' };
  if (!canManage(a.role)) return { error: 'Only workspace owners and admins can add members.' };
  if (!hasFeature(a.org.plan, 'team_members')) return { error: 'Team members are part of the Agency Pro plan.' };
  const email = String(f.get('email') || '').trim().toLowerCase();
  const role = f.get('role') === 'admin' ? 'admin' : 'member';
  const db = await getDb();
  const [target] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!target) return { error: 'No Avara account uses that email. Ask them to sign up first, then add them.' };
  const existing = await db.select().from(schema.memberships).where(and(eq(schema.memberships.organizationId, a.org.id), eq(schema.memberships.userId, target.id)));
  if (existing.length) return { error: 'That person is already a member.' };
  await db.insert(schema.memberships).values({ organizationId: a.org.id, userId: target.id, role });
  return { ok: `${email} added as ${role}.` };
}

export async function startProjectScanAction(_: FormState, f: FormData): Promise<FormState> {
  const u = await need(); const pa = await projectAccess(u, String(f.get('projectId') || ''));
  if (!pa) return { error: 'Project not found.' };
  const env = f.get('environment') === 'staging' ? 'staging' : 'live';
  const url = env === 'staging' ? pa.project.stagingUrl : pa.project.liveUrl;
  if (!url) return { error: `This project has no ${env} URL.` };
  try { await checkUrl(url); } catch (e) { return { error: e instanceof BlockedUrlError ? e.message : 'That address cannot be scanned.' }; }
  const std = String(f.get('standard') || pa.project.defaultStandard);
  const db = await getDb();
  const [s] = await db.insert(schema.scans).values({ url, projectId: pa.project.id, environment: env, standard: isStandard(std) ? std : pa.project.defaultStandard, createdBy: u.id }).returning({ id: schema.scans.id });
  await enqueueScan(s.id);
  redirect(`/scans/${s.id}`);
}

export async function decideIssueAction(_: FormState, f: FormData): Promise<FormState> {
  const u = await need(); const pa = await projectAccess(u, String(f.get('projectId') || ''));
  if (!pa) return { error: 'Project not found.' };
  if (!hasFeature(await orgPlan(pa.project.organizationId), 'full_report')) return { error: 'Reviewing findings is part of the paid plans.' };
  const issueId = String(f.get('issueId') || '');
  if (!/^[0-9a-f-]{36}$/i.test(issueId)) return { error: 'Issue not found.' };
  const db = await getDb();
  const [row] = await db.select({ key: schema.issues.componentKey, projectId: schema.scans.projectId }).from(schema.issues).innerJoin(schema.scans, eq(schema.scans.id, schema.issues.scanId)).where(eq(schema.issues.id, issueId));
  if (!row || row.projectId !== pa.project.id) return { error: 'Issue not found.' };
  const decision = String(f.get('decision') || '');
  if (decision === 'clear') { await db.delete(schema.reviewDecisions).where(and(eq(schema.reviewDecisions.projectId, pa.project.id), eq(schema.reviewDecisions.componentKey, row.key))); return { ok: 'Decision cleared.' }; }
  if (decision !== 'confirmed' && decision !== 'not_an_issue') return { error: 'Choose a decision.' };
  const note = String(f.get('note') || '').trim().slice(0, 1000) || null;
  if (decision === 'not_an_issue' && !note) return { error: 'Say why this is not an issue, so the decision can be checked later.' };
  await db.insert(schema.reviewDecisions).values({ projectId: pa.project.id, componentKey: row.key, decision, note, decidedBy: u.id })
    .onConflictDoUpdate({ target: [schema.reviewDecisions.projectId, schema.reviewDecisions.componentKey], set: { decision, note, decidedBy: u.id, decidedAt: new Date() } });
  return { ok: decision === 'confirmed' ? 'Marked as a confirmed issue.' : 'Marked as not an issue. It stays hidden from counts in later scans of this markup.' };
}

// Waiting list for plans that cannot be bought yet. Email only, one row per email and plan.
export async function joinWaitlistAction(_: FormState, f: FormData): Promise<FormState> {
  const email = String(f.get('email') || '').trim().toLowerCase();
  const plan = f.get('plan') === 'agency' ? 'agency' : 'site';
  if (tooManyAttempts('waitlist:' + (await ip()), 10)) return { error: 'Too many attempts. Please wait a few minutes.' };
  if (!EMAIL.test(email)) return { error: 'Enter a valid email address.' };
  const db = await getDb();
  await db.insert(schema.waitlist).values({ email, plan }).onConflictDoNothing();
  return { ok: `Thanks. We will email ${email} once when checkout opens, and nothing else.` };
}
