"use client";

import { CheckCircle2, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { SellerProfile } from "@/lib/domain/lead";
import { saveSellerProfileOverrideAction } from "@/lib/config/actions";

export function SellerProfileForm({ initialProfile, persistentSettingsAvailable }: { initialProfile: SellerProfile; persistentSettingsAvailable: boolean }) {
  const [profile, setProfile] = useState(initialProfile);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function saveProfile() {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    const response = await saveSellerProfileOverrideAction(profile);
    if (response.success && response.data) {
      setProfile(response.data);
      setMessage("Datos guardados permanentemente en Supabase.");
    } else {
      setError(response.error || "No pudimos guardar los datos del vendedor.");
    }
    setIsSaving(false);
  }

  return (
    <section className="mt-5 rounded-[30px] border border-black/[0.06] bg-white p-5 shadow-[0_16px_50px_rgba(16,24,40,0.06)] sm:p-7">
      <div>
        <p className="eyebrow">Perfil del vendedor</p>
        <h2 className="mt-2 text-xl font-black">Datos que verá el cliente</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted)]">Se usan en el QR y en los mensajes nuevos. Si dejas un campo vacío, se usará el valor correspondiente del .env.</p>
        <p className="mt-2 max-w-xl text-xs leading-5 text-[var(--muted)]">{persistentSettingsAvailable ? "La configuración está conectada a Supabase y se conservará para todos los dispositivos que usen este proyecto." : "La configuración global todavía está bloqueada: falta SUPABASE_SERVICE_ROLE_KEY en el servidor. No se guardará una copia temporal en este navegador."} El QR se actualiza al volver a abrir o recargar <Link href="/qr" className="font-black text-[var(--ink)] underline underline-offset-2">/qr</Link>.</p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {([ ["name", "Nombre del vendedor"], ["phone", "Celular del vendedor"], ["email", "Correo"], ["company", "Empresa"] ] as const).map(([field, label]) => <label key={field} className="text-xs font-black text-[var(--ink)]">{label}<input value={profile[field]} onChange={(event) => setProfile((current) => ({ ...current, [field]: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-black/10 bg-[#faf9f6] px-3 text-sm font-semibold outline-none focus:border-[var(--ink)]" /></label>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={saveProfile} disabled={isSaving} className="button-primary"><Save size={16} />{isSaving ? "Guardando" : "Guardar datos"}</button>{message ? <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={15} />{message}</p> : null}{error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}</div>
    </section>
  );
}
