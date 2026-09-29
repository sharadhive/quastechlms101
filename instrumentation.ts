/** Runs once when the server starts. Node-only code is imported conditionally (Next.js pattern). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./src/lib/jobs/in-app-runner');
  }
}
