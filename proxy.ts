import { NextResponse, type NextRequest } from "next/server";
import { prepareBrowserDiary } from "@/lib/browser-diary";

export function proxy(request: NextRequest) {
  return prepareBrowserDiary(request, NextResponse.next());
}

export const config = {
  matcher: ['/'],
};
