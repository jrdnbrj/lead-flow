import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database";
import { fetchWithJwtClockSkewRetry, isJwtIssuedAtFutureError } from "@/lib/supabase/fetch-with-jwt-clock-skew-retry";
import { AUTHENTICATED_RPC_POLICIES, type AuthenticatedRpcName } from "@/lib/supabase/authenticated-rpc-policy";

type AuthenticatedRpcClient = Pick<SupabaseClient<Database>, "auth">;
export type AuthenticatedRpcResult = {
  data: Record<string, unknown> | null;
  error: { code?: string; message?: string } | null;
};

function errorFromResponse(body: unknown, status: number): { code?: string; message?: string } {
  const error = body && typeof body === "object" ? body as { code?: unknown; message?: unknown } : null;
  return {
    code: typeof error?.code === "string" ? error.code : undefined,
    message: typeof error?.message === "string" ? error.message : `RPC_HTTP_${status}`,
  };
}

async function invokeRpcWithToken(
  supabaseUrl: string,
  apiKey: string,
  accessToken: string,
  functionName: AuthenticatedRpcName,
  args: Record<string, unknown>,
): Promise<AuthenticatedRpcResult> {
  const response = await fetchWithJwtClockSkewRetry(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });

  const bodyText = await response.text();
  let body: unknown = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = null;
  }

  if (!response.ok) return { data: null, error: errorFromResponse(body, response.status) };
  return { data: body && typeof body === "object" ? body as Record<string, unknown> : null, error: null };
}

function shouldRetryWithUserToken(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message ?? "";
  return /permission denied|function .* does not exist|PGRST202/i.test(message);
}

/**
 * Calls an authenticated RPC with one bounded recovery policy.
 *
 * The browser/session token remains the first choice. A service-role retry is
 * available only for an explicit registry entry whose SQL function is
 * ownership-safe and has a matching forward migration grant. Every other
 * function can only refresh the advisor session once.
 */
export async function invokeAuthenticatedRpc(
  client: AuthenticatedRpcClient,
  functionName: AuthenticatedRpcName,
  args: Record<string, unknown>,
): Promise<AuthenticatedRpcResult> {
  const { data: claimsData, error: claimsError } = await client.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return { data: null, error: { message: "AUTH_REQUIRED" } };

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (sessionError || !accessToken || !supabaseUrl || !publishableKey) {
    console.error("[leadflow][rpc] authenticated session unavailable", { functionName });
    return { data: null, error: { message: "AUTH_REQUIRED" } };
  }

  const invokeWithToken = (token: string) => invokeRpcWithToken(supabaseUrl, publishableKey, token, functionName, args);
  const policy = AUTHENTICATED_RPC_POLICIES[functionName];
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const canUseServerFallback = policy === "SERVER_FALLBACK" && Boolean(serviceRoleKey);

  let result = await invokeWithToken(accessToken);
  if (isJwtIssuedAtFutureError(result.error) && canUseServerFallback && serviceRoleKey) {
    console.error("[leadflow][rpc] using server-authenticated fallback", { functionName });
    result = await invokeRpcWithToken(supabaseUrl, serviceRoleKey, serviceRoleKey, functionName, args);
    // This keeps environments that have not received the forward grant
    // backwards-compatible: try the normal user token before returning the
    // original provider timing failure.
    if (result.error && shouldRetryWithUserToken(result.error)) {
      result = await invokeWithToken(accessToken);
    }
  }

  if (isJwtIssuedAtFutureError(result.error)) {
    const { data: refreshedSession, error: refreshError } = await client.auth.refreshSession();
    const refreshedToken = refreshedSession.session?.access_token;
    if (!refreshError && refreshedToken) {
      console.error("[leadflow][rpc] JWT timing rejected; retrying refreshed session", { functionName });
      result = await invokeWithToken(refreshedToken);
    } else {
      console.error("[leadflow][rpc] session refresh failed", { functionName });
    }
  }

  if (result.error) console.error("[leadflow][rpc] call failed", { functionName, message: result.error.message ?? "UNKNOWN" });
  return result;
}
