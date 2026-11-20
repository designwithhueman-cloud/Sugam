'use client';
// Sign in and create account, built to be quick: two one-click provider buttons first (only the ones that are set up), then email and
// password for everyone else. Plain words for every error, a show/hide for the password, and a line that says what an account is
// for. The provider buttons are real links, so they work without JavaScript.
import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { signupAction, loginAction } from '@/app/actions.ts';

type Prov = { id: 'google' | 'github'; label: string; enabled: boolean };
const ERRORS: Record<string, string> = {
  provider: 'That sign-in option is not available right now. Use your email instead.',
  cancelled: 'Sign-in was cancelled. You can try again or use your email.',
  expired: 'That sign-in took too long or did not match. Please try again.',
  noemail: 'We could not get a verified email from that account. Try another option or use your email.',
  password: 'This email already has a password account. Sign in with your email and password below.',
  rate: 'Too many attempts. Please wait a few minutes.',
};
const input = 'min-h-12 w-full rounded-xl border border-black/30 bg-white px-4 text-lg text-ink placeholder:text-neutral-500';

const Google = () => <svg aria-hidden viewBox="0 0 24 24" className="size-5"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81z" /><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76l4.01-3.1z" /><path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.28 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z" /></svg>;
const GitHub = () => <svg aria-hidden viewBox="0 0 24 24" className="size-5 fill-current"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>;

export function AuthForm({ mode, next, providers = [], error }: { mode: 'login' | 'signup'; next?: string; providers?: Prov[]; error?: string }) {
  const [state, action, pending] = React.useActionState(mode === 'signup' ? signupAction : loginAction, undefined);
  const [show, setShow] = React.useState(false);
  const err = React.useRef<HTMLParagraphElement>(null);
  const message = state?.error || (error ? ERRORS[error] : '') || '';
  React.useEffect(() => { if (message) err.current?.focus(); }, [message]);
  const signup = mode === 'signup';
  const q = next ? `?next=${encodeURIComponent(next)}` : '';
  const live = providers.filter((p) => p.enabled);
  return (
    <div className="mx-auto w-full max-w-md rounded-[2rem] border border-black/10 bg-white p-7 shadow-[0_18px_40px_-26px_rgba(0,0,0,0.3)] sm:p-9">
      <h1 className="text-3xl font-semibold tracking-[-0.025em] text-ink">{signup ? 'Create your free account' : 'Welcome back'}</h1>
      <p className="mt-2 text-lg leading-snug text-neutral-800">{signup ? 'Keep your scan history and see every issue type, not just the top few.' : 'Pick up where you left off.'}</p>

      <p id="auth-error" ref={err} tabIndex={-1} role="alert" className="mt-5 rounded-2xl bg-[#fde0dc] px-4 py-3 text-base font-medium text-[#7a1710]" hidden={!message}>{message}</p>

      {live.length > 0 && (
        <>
          <ul aria-label="Continue with" className="mt-6 grid gap-3">
            {live.map((p) => (
              <li key={p.id}><a href={`/api/auth/${p.id}${q}`} className="flex min-h-14 items-center justify-center gap-3 rounded-full border border-black/30 bg-white text-lg font-semibold text-ink hover:bg-black/5">{p.id === 'google' ? <Google /> : <GitHub />}Continue with {p.label}</a></li>
            ))}
          </ul>
          <p className="my-6 flex items-center gap-4 text-base text-neutral-700"><span aria-hidden className="h-px flex-1 bg-black/15" />or use your email<span aria-hidden className="h-px flex-1 bg-black/15" /></p>
        </>
      )}

      <form action={action} className={`${live.length ? '' : 'mt-6 '}space-y-5`} noValidate>
        <input type="hidden" name="next" value={next || '/app'} />
        {signup && <div><label htmlFor="name" className="block text-base font-semibold text-ink">Your name <span className="font-normal text-neutral-700">(optional)</span></label><input id="name" name="name" autoComplete="name" className={`${input} mt-2`} /></div>}
        <div><label htmlFor="email" className="block text-base font-semibold text-ink">Email</label><input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@company.com" aria-describedby="auth-error" className={`${input} mt-2`} /></div>
        <div>
          <label htmlFor="password" className="block text-base font-semibold text-ink">Password</label>
          <div className="relative mt-2">
            <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 10 : undefined} aria-describedby={`${signup ? 'pw-hint ' : ''}auth-error`} className={`${input} pr-14`} />
            <button type="button" onClick={() => setShow(!show)} aria-pressed={show} className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-lg text-ink hover:bg-black/5"><span className="sr-only">Show password</span>{show ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}</button>
          </div>
          {signup && <p id="pw-hint" className="mt-1.5 text-sm text-neutral-700">At least 10 characters.</p>}
        </div>
        <button type="submit" disabled={pending} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-lg font-semibold text-white hover:bg-neutral-800 disabled:opacity-60">{pending ? 'One moment…' : signup ? 'Create account' : 'Sign in'}{!pending && <ArrowRight aria-hidden className="size-5" />}</button>
      </form>

      <p className="mt-6 text-lg text-neutral-800">{signup ? 'Already have an account? ' : 'New to Sugam? '}<Link className="font-semibold text-ink underline underline-offset-4" href={`/${signup ? 'login' : 'signup'}${q}`}>{signup ? 'Sign in' : 'Create a free account'}</Link></p>
      {signup && <p className="mt-3 text-sm leading-snug text-neutral-700">By creating an account you agree to the <Link href="/terms" className="underline underline-offset-2">Terms</Link> and the <Link href="/privacy" className="underline underline-offset-2">Privacy page</Link>.</p>}
    </div>
  );
}
