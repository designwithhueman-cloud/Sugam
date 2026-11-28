// Runs once when the Next.js server starts (Node runtime only): recover unfinished scans and schedule data retention (lib/startup.ts).
// AVARA_BACKGROUND=off skips it, e.g. for a second web instance that shares a database with a primary one.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.AVARA_BACKGROUND === 'off') return;
  const { startBackgroundWork } = await import('./lib/startup.ts');
  startBackgroundWork();
}
