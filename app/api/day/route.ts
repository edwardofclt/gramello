import { withAuthenticatedUser } from "@/lib/auth";
import { getDay } from "@/db/store";
export async function GET(request: Request) { return withAuthenticatedUser(request, async ({ userId }) => { try { const u = new URL(request.url); const date = u.searchParams.get("date") ?? new Date().toISOString().slice(0, 10); return Response.json(await getDay(userId, date)); } catch (error) { console.error(error); return Response.json({ error: "Your diary could not be loaded right now." }, { status: 503 }); } }); }
