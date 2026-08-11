export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

export type AuthRequiredCode = typeof AUTH_REQUIRED;

export type AuthRequiredResult = {
  success: false;
  error: AuthRequiredCode;
  message: string;
};

export const AUTH_REQUIRED_MESSAGE = "Tu sesión venció. Ingresa nuevamente para continuar.";

export function isAuthRequiredEnabled(): boolean {
  return process.env.AUTH_REQUIRED === "true";
}

export function authRequiredResult(): AuthRequiredResult {
  return {
    success: false,
    error: AUTH_REQUIRED,
    message: AUTH_REQUIRED_MESSAGE,
  };
}
