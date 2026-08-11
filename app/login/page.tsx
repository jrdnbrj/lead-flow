import type { Metadata } from "next";

import { loginAction } from "@/app/login/actions";

export const metadata: Metadata = { title: "Ingresar" };

const errors: Record<string, string> = {
  auth: "No pudimos validar ese email y contraseña.",
  config: "Supabase Auth no está configurado en el servidor.",
  missing: "Ingresa email y contraseña para continuar.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") ? params.next : "/dashboard";
  const error = params.error ? errors[params.error] : null;

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center">
      <form action={loginAction} className="w-full rounded-[30px] border border-black/[0.06] bg-white p-6 shadow-[0_16px_50px_rgba(16,24,40,0.06)] sm:p-8">
        <p className="eyebrow">LeadFlow · acceso privado</p>
        <h1 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.065em]">Ingresa como asesor.</h1>
        <p className="mt-4 text-sm font-semibold leading-6 text-[var(--muted)]">Usa el usuario provisionado. No existe registro público.</p>
        {error ? <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{error}</div> : null}
        <input type="hidden" name="next" value={next} />
        <label className="mt-6 block text-sm font-black" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="mt-2 w-full rounded-2xl border border-black/10 px-4 py-3 font-semibold outline-none focus:border-black" />
        <label className="mt-4 block text-sm font-black" htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded-2xl border border-black/10 px-4 py-3 font-semibold outline-none focus:border-black" />
        <button type="submit" className="button-primary mt-6 w-full justify-center">Ingresar</button>
      </form>
    </div>
  );
}
