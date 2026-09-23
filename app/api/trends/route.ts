import { withBrowserDiary } from "@/lib/browser-diary";
import { getTrends } from "@/db/store";
export async function GET(request: Request) { return withBrowserDiary(request, async ({ userId }) => { try { const days = Math.min(183, Math.max(7, Number(new URL(request.url).searchParams.get("days") ?? 7))); return Response.json({ days: await getTrends(userId, days) }); } catch (error) { console.error(error); return Response.json({ error: "Trends could not be loaded." }, { status: 503 }); } }); }
