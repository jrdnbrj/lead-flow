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
  retryOnClockSkew = true,
): Promise<AuthenticatedRpcResult> {
  const fetchRpc = retryOnClockSkew ? fetchWithJwtClockSkewRetry : fetch;
  const response = await fetchRpc(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
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
 * Ownership-safe internal RPCs use the server credential first. A server path
 * is available only for an explicit registry entry whose SQL function has a
 * matching forward migration grant. Session-bound functions keep the browser
 * token and its bounded clock-skew recovery instead.
 */
export async function invokeAuthenticatedRpc(
  client: AuthenticatedRpcClient,
  functionName: AuthenticatedRpcName,
  args: Record<string, unknown>,
): Promise<AuthenticatedRpcResult> {
  const { data: claimsData, error: claimsError } = await client.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return { data: null, error: { message: "AUTH_REQUIRED" } };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const policy = AUTHENTICATED_RPC_POLICIES[functionName];
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const canUseServerFallback = policy === "SERVER_FALLBACK" && Boolean(serviceRoleKey);
  if (!supabaseUrl || !publishableKey) {
    console.error("[leadflow][rpc] authenticated session unavailable", { functionName });
    return { data: null, error: { message: "AUTH_REQUIRED" } };
  }

  // Internal mutations have already passed requireAdvisor() in their server
  // action/route. Use the server-only credential first so a provider clock
  // skew cannot add the browser-token retry budget to the critical path.
  if (canUseServerFallback && serviceRoleKey) {
    console.error("[leadflow][rpc] using server-authenticated fast path", { functionName });
    const serverResult = await invokeRpcWithToken(supabaseUrl, serviceRoleKey, serviceRoleKey, functionName, args, false);
    if (!serverResult.error || (!shouldRetryWithUserToken(serverResult.error) && !isJwtIssuedAtFutureError(serverResult.error))) return serverResult;
  }

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    console.error("[leadflow][rpc] authenticated session unavailable", { functionName });
    return { data: null, error: { message: "AUTH_REQUIRED" } };
  }

  const invokeWithToken = (token: string) => invokeRpcWithToken(supabaseUrl, publishableKey, token, functionName, args);

  let result = await invokeWithToken(accessToken);

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
