import { exportHostedArchive, HostedBackupError } from '@/db/backup';
import { withBrowserDiary } from '@/lib/browser-diary';

// Read-only recovery endpoint for the diary owned by the existing browser cookie.
export async function GET(request: Request) {
  return withBrowserDiary(request, async ({ userId }) => {
    try {
      return Response.json(await exportHostedArchive(userId));
    } catch (error) {
      console.error('Hosted diary export failed:', error);
      return Response.json({ error: error instanceof HostedBackupError ? error.message
        : 'Your hosted diary could not be exported right now. No hosted data was changed.' }, { status: 503 });
    }
  });
}
