import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth.ts';
import { AuthForm } from '@/components/forms/AuthForm.tsx';
import { providerList } from '@/lib/oauth.ts';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create account | Avara' };
export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (await currentUser()) redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/app');
  return <main id="main" className="px-5 pb-20 pt-12 sm:pt-16"><AuthForm mode="signup" next={next} error={error} providers={providerList()} /></main>;
}
