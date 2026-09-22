import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Hidden admin console: any /nx/<key> that isn't the deployment's secret
// path gets a bare HTTP 404 — indistinguishable from a nonexistent route.
export function middleware(req: NextRequest) {
  const key = req.nextUrl.pathname.split("/")[2] ?? "";
  if (key !== (process.env.ADMIN_PANEL_KEY || "")) {
    return new NextResponse("404 Not Found", { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/nx/:path*" };
