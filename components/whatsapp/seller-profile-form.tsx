"use client";

import { CheckCircle2, Save } from "lucide-react";
import { useState } from "react";

import type { SellerProfile } from "@/lib/domain/lead";
import { saveSellerProfileOverrideAction } from "@/lib/config/actions";

export function SellerProfileForm({ initialProfile }: { initialProfile: SellerProfile }) {
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
      setMessage("Datos guardados. Se usarán en el QR y en los mensajes nuevos.");
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
        <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted)]">Estos datos quedan guardados en Supabase y se usan en el QR y en los mensajes nuevos. Si dejas un campo vacío, se usará el valor del .env.</p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {([ ["name", "Nombre del vendedor"], ["phone", "Celular del vendedor"], ["email", "Correo"], ["company", "Empresa"] ] as const).map(([field, label]) => <label key={field} className="text-xs font-black text-[var(--ink)]">{label}<input value={profile[field]} onChange={(event) => setProfile((current) => ({ ...current, [field]: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-black/10 bg-[#faf9f6] px-3 text-sm font-semibold outline-none focus:border-[var(--ink)]" /></label>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={saveProfile} disabled={isSaving} className="button-primary"><Save size={16} />{isSaving ? "Guardando" : "Guardar datos"}</button>{message ? <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={15} />{message}</p> : null}{error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}</div>
    </section>
  );
}
