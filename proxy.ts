import { NextResponse, type NextRequest } from "next/server";
import { getAuth0 } from "@/lib/auth0";

export async function proxy(request: NextRequest) {
  try {
    const response = await getAuth0().middleware(request);
    if (request.nextUrl.pathname === "/" || request.nextUrl.pathname.startsWith("/auth/") ||
        request.nextUrl.pathname.startsWith("/api/")) {
      response.headers.set("Cache-Control", "private, no-store");
    }
    return response;
  } catch {
    if (request.nextUrl.pathname.startsWith("/auth/")) {
      return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again later." },
        { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    // The page renders a setup message; each API also checks its own session.
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|favicon.ico|sitemap.xml|robots.txt).*)"],
};
