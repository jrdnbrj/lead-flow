import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseProxyClient } from "@/lib/supabase/server";
import { isAuthRequiredEnabled } from "@/lib/auth/auth-required";

const phaseAPrivatePaths = ["/whatsapp"];
const authRequiredPrivatePaths = ["/dashboard", "/nuevo", "/qr"];

function isProtectedPath(pathname: string): boolean {
  if (phaseAPrivatePaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return true;
  return isAuthRequiredEnabled() && authRequiredPrivatePaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
  const { response, supabase } = createSupabaseProxyClient(request);
  if (!isProtectedPath(request.nextUrl.pathname)) return response;

  const { data, error } = await supabase.auth.getClaims();
  if (!error && data?.claims?.sub) return response;

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
