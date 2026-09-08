import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { Database } from "@/lib/supabase/database";
import { fetchWithJwtClockSkewRetry } from "@/lib/supabase/fetch-with-jwt-clock-skew-retry";

export function createSupabaseProxyClient(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return {
      response,
      supabase: {
        auth: {
          async getClaims() {
            return { data: { claims: null }, error: new Error("Supabase is not configured") };
          },
        },
      },
    };
  }

  const supabase = createServerClient<Database>(supabaseUrl, publishableKey, {
    global: { fetch: fetchWithJwtClockSkewRetry },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  return { response, supabase };
}
