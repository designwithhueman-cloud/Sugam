// The Sunbeam frame for every public page: lime-to-mint outer frame, one warm-white card, the same
// header and footer.
import { currentUser } from '@/lib/auth.ts';
import { LandingHeader } from './Header.tsx';
import { LandingFooter } from './Sections.tsx';

export async function Shell({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <div className="sunbeam min-h-screen bg-gradient-to-br from-lemon via-[#c8f3b0] to-mint p-2 sm:p-4 lg:p-5">
      <div className="mx-auto max-w-[1536px] overflow-clip rounded-[1.75rem] bg-warm text-ink sm:rounded-[2.25rem]">
        <LandingHeader signedIn={!!user} />
        {children}
        <LandingFooter />
      </div>
    </div>
  );
}
