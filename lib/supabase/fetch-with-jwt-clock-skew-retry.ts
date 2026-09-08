type JwtClockSkewRetryOptions = {
  delaysMs?: readonly number[];
  sleep?: (delayMs: number) => Promise<void>;
};

export const JWT_CLOCK_SKEW_RETRY_DELAYS_MS = [350, 1000, 2500] as const;

const defaultSleep = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

function requestPath(input: RequestInfo | URL): string | null {
  try {
    const requestUrl = input instanceof Request ? input.url : input.toString();
    return new URL(requestUrl, typeof window === "undefined" ? "http://localhost" : window.location.origin).pathname;
  } catch {
    return null;
  }
}

export async function isJwtIssuedAtFutureResponse(response: Response, input: RequestInfo | URL): Promise<boolean> {
  if (response.status !== 401 || !requestPath(input)?.startsWith("/rest/v1/")) return false;

  try {
    const body = JSON.parse(await response.clone().text()) as { code?: unknown; message?: unknown };
    return body.code === "PGRST303" || (typeof body.message === "string" && /JWT issued at future/i.test(body.message));
  } catch {
    return false;
  }
}

export function isJwtIssuedAtFutureError(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  return error?.code === "PGRST303" || (typeof error?.message === "string" && /JWT issued at future/i.test(error.message));
}

export function createJwtClockSkewRetryFetch(options: JwtClockSkewRetryOptions = {}): typeof fetch {
  const delaysMs = options.delaysMs ?? JWT_CLOCK_SKEW_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? defaultSleep;

  return async (input, init) => {
    // Materialize the request once so POST/RPC bodies can be cloned for every
    // bounded retry without consuming a one-shot Request body.
    const request = new Request(input, init);
    let response = await globalThis.fetch(request.clone());

    for (const [index, delayMs] of delaysMs.entries()) {
      if (!(await isJwtIssuedAtFutureResponse(response, request))) return response;
      await sleep(delayMs);
      response = await globalThis.fetch(request.clone());
      if (index === delaysMs.length - 1) break;
    }

    if (await isJwtIssuedAtFutureResponse(response, request)) {
      console.warn("[leadflow][supabase] PGRST303 retry exhausted", {
        path: requestPath(request),
        attempts: delaysMs.length + 1,
      });
    }

    return response;
  };
}

export const fetchWithJwtClockSkewRetry = createJwtClockSkewRetryFetch();
