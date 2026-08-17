import type { Metadata } from "next";

import { loginAction } from "@/app/login/actions";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Ingresar" };

const errors: Record<string, string> = {
  auth: "No pudimos validar ese email y contraseña.",
  config: "No pudimos preparar el inicio de sesión. Intenta de nuevo y avísame si continúa.",
  missing: "Ingresa email y contraseña para continuar.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") ? params.next : "/dashboard";
  const error = params.error ? errors[params.error] : null;

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center">
      <LoginForm action={loginAction} next={next} error={error} />
    </div>
  );
}
