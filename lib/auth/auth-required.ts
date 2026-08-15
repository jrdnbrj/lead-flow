export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

export type AuthRequiredCode = typeof AUTH_REQUIRED;

export type AuthRequiredResult = {
  success: false;
  error: AuthRequiredCode;
  message: string;
};

export const AUTH_REQUIRED_MESSAGE = "Tu sesión venció. Ingresa nuevamente para continuar.";

export function isAuthRequiredEnabled(): boolean {
  // LeadFlow has no anonymous mode: missing or stale configuration must never
  // make private lead data public.
  return true;
}

export function authRequiredResult(): AuthRequiredResult {
  return {
    success: false,
    error: AUTH_REQUIRED,
    message: AUTH_REQUIRED_MESSAGE,
  };
}
