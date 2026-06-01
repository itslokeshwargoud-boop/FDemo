import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Auth removed — all routes are publicly accessible.
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [], // No routes need protection
};
