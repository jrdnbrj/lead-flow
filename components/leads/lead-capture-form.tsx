"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check, ExternalLink, LoaderCircle, MessageCircle, QrCode, RefreshCw, UserRound } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { createLeadAction, findExistingLeadByPhoneAction } from "@/lib/leads/actions";
import { carModels, getStatusLabel, leadTimeframes, paymentMethods, type ExistingLeadSummary, type FollowUpAction } from "@/lib/domain/lead";
import { leadSchema, type LeadFormValues } from "@/lib/leads/validation";
import { FollowUpActions } from "@/components/leads/follow-up-actions";
import { FirstContactSummary } from "@/components/leads/first-contact-summary";
import { LeadContactActions } from "@/components/leads/lead-contact-actions";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs font-semibold text-red-600">{message}</p> : null;
}

function ChoiceCard({ selected, label, helper, onClick }: { selected: boolean; label: string; helper?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`relative min-h-16 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.98] ${selected ? "border-[var(--ink)] bg-[var(--ink)] text-white shadow-[0_8px_18px_rgba(16,24,40,0.16)]" : "border-black/[0.09] bg-white text-[var(--ink)] hover:border-black/25"}`}>
      {selected ? <span className="absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full bg-[var(--lime)] text-[var(--ink)]"><Check size={13} strokeWidth={3} /></span> : null}
      <span className="block pr-5 text-sm font-extrabold leading-tight">{label}</span>
      {helper ? <span className={`mt-1 block text-[11px] ${selected ? "text-white/65" : "text-[var(--muted)]"}`}>{helper}</span> : null}
    </button>
  );
}

export function LeadCaptureForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [savedLeadId, setSavedLeadId] = useState<string | null>(null);
  const [existingLead, setExistingLead] = useState<ExistingLeadSummary | null>(null);
  const [savedActions, setSavedActions] = useState<FollowUpAction[]>([]);
  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    mode: "onChange",
    defaultValues: { fullName: "", phone: "", carModels: [], timeframe: "INMEDIATA", paymentMethod: "CREDITO", tradeInCar: false, notes: "" },
  });
  const { formState, register, setValue } = form;
  const values = useWatch({ control: form.control });

  async function onSubmit(input: LeadFormValues) {
    setSubmitError(null);
    setWarning(null);
    const response = await createLeadAction(input);
    if (!response.success || !response.data) {
      setSubmitError(response.message || response.error || "No pudimos guardar el lead.");
      return;
    }

    setWarning(response.warning || null);
    setSavedLeadId(response.data.id);
    setSavedActions([]);
    const duplicate = await findExistingLeadByPhoneAction(response.data.phone, response.data.id);
    if (duplicate.success) setExistingLead(duplicate.data ?? null);
  }

  if (savedLeadId) {
    return <section className="space-y-4 rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_16px_50px_rgba(16,24,40,0.06)] sm:p-7">
      <div className="rounded-2xl bg-[#eef6d7] px-4 py-4"><p className="eyebrow">Lead guardado</p><h2 className="mt-2 text-2xl font-black">Sin próxima acción</h2><p className="mt-1 text-sm font-semibold text-[var(--muted)]">El contacto quedó listo. Elige qué quieres hacer ahora.</p></div>
      {existingLead ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm"><p className="font-black">Este teléfono ya aparece en otro lead</p><p className="mt-1 text-[var(--muted)]">{existingLead.fullName} · {existingLead.carModels.join(", ")} · {getStatusLabel(existingLead.status)}</p><div className="mt-3 flex flex-wrap gap-2"><a className="button-secondary" href={`/dashboard?leadId=${encodeURIComponent(existingLead.id)}`}>Abrir lead existente</a><a className="button-primary" href={`/dashboard?leadId=${encodeURIComponent(savedLeadId)}`}>Crear nueva oportunidad</a></div></div> : null}
      <FollowUpActions leadId={savedLeadId} actions={savedActions} onActionsChange={setSavedActions} onConversationWaiting={() => undefined} onError={setSubmitError} onInfo={setWarning} />
      <LeadContactActions contact={{ name: values.fullName || "Cliente", phone: values.phone || "" }} />
      <FirstContactSummary lead={{ id: savedLeadId, fullName: values.fullName || "Cliente", phone: values.phone || "", carModels: values.carModels || [] }} />
      {submitError ? <p className="rounded-xl bg-[#fff0ee] px-3 py-2.5 text-xs font-semibold text-[#b33a2c]" role="alert">{submitError}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2"><a className="button-primary" href="/dashboard"><ExternalLink size={16} />Ir al dashboard</a><a className="button-secondary" href={`/qr?leadId=${encodeURIComponent(savedLeadId)}&name=${encodeURIComponent(values.fullName || "")}`}><QrCode size={16} />Compartir mi contacto/QR</a><a className="button-secondary" href={`/dashboard?leadId=${encodeURIComponent(savedLeadId)}`}>Programar acción</a><a className="button-secondary" href={`/dashboard?leadId=${encodeURIComponent(savedLeadId)}`}>Enviar primer contacto por WhatsApp</a></div>
      {warning ? <p className="text-xs text-[var(--muted)]">{warning}</p> : null}
    </section>;
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <section className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_16px_50px_rgba(16,24,40,0.06)] sm:p-7">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#eef6d7] text-[#4b6905]"><UserRound size={19} /></span>
          <div>
            <h2 className="text-lg font-black tracking-[-0.03em]">Datos esenciales</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Solo lo necesario para no perder el momento.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">Nombre completo *</span>
            <input {...register("fullName")} autoComplete="name" placeholder="Ej. Laura Gómez" className="field-input" autoFocus />
            <FieldError message={formState.errors.fullName?.message} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">Celular *</span>
            <input {...register("phone")} autoComplete="tel" inputMode="tel" placeholder="Ej. 0987654321" className="field-input" />
            <p className="mt-1.5 text-[11px] font-medium text-[var(--muted)]">Ecuador: 0984790449 · Otro país: escribe el código, por ejemplo +57 315 204 8890.</p>
            <FieldError message={formState.errors.phone?.message} />
          </label>
        </div>
      </section>

      <section className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_16px_50px_rgba(16,24,40,0.06)] sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">01 · Intención</p>
            <h2 className="mt-1 text-lg font-black tracking-[-0.03em]">¿Qué está buscando?</h2>
          </div>
          <span className="rounded-full bg-[#f5f1e9] px-3 py-1.5 text-xs font-bold text-[var(--muted)]">Toca una opción</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {carModels.map((model) => {
            const selected = values.carModels?.includes(model) ?? false;
            return <ChoiceCard key={model} selected={selected} label={model} onClick={() => {
              const current = values.carModels ?? [];
              const next = selected ? current.filter((value) => value !== model) : [...current, model];
              setValue("carModels", next, { shouldValidate: true, shouldDirty: true });
            }} />;
          })}
        </div>
        <p className="mt-2 text-[11px] font-medium text-[var(--muted)]">Puedes elegir uno o varios modelos. El mensaje los mostrará separados por comas y la imagen será la del primero.</p>
        <FieldError message={formState.errors.carModels?.message} />
      </section>

      <section className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_16px_50px_rgba(16,24,40,0.06)] sm:p-7">
        <div className="mb-5">
          <p className="eyebrow">02 · Momento de compra</p>
          <h2 className="mt-1 text-lg font-black tracking-[-0.03em]">¿Cuándo quiere avanzar?</h2>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {leadTimeframes.map((option) => <ChoiceCard key={option.value} selected={values.timeframe === option.value} label={option.label} helper={option.helper} onClick={() => setValue("timeframe", option.value, { shouldValidate: true, shouldDirty: true })} />)}
        </div>
      </section>

      <section className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_16px_50px_rgba(16,24,40,0.06)] sm:p-7">
        <div className="mb-5">
          <p className="eyebrow">03 · Forma de pago</p>
          <h2 className="mt-1 text-lg font-black tracking-[-0.03em]">¿Cómo lo imagina?</h2>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {paymentMethods.map((option) => <ChoiceCard key={option.value} selected={values.paymentMethod === option.value} label={option.label} onClick={() => setValue("paymentMethod", option.value, { shouldValidate: true, shouldDirty: true })} />)}
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-black/[0.08] px-4 py-3.5 transition hover:border-black/20">
          <input {...register("tradeInCar")} type="checkbox" className="size-5 accent-[var(--ink)]" />
          <span><span className="block text-sm font-extrabold">Tiene un vehículo para entregar como parte de pago</span><span className="block text-xs text-[var(--muted)]">Puede reducir el valor que necesita financiar y cambia la propuesta.</span></span>
        </label>
      </section>

      <section className="rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_16px_50px_rgba(16,24,40,0.06)] sm:p-7">
        <div className="mb-4 flex items-center gap-2"><MessageCircle size={17} className="text-[var(--muted)]" /><h2 className="text-sm font-black">Nota rápida <span className="font-medium text-[var(--muted)]">(opcional)</span></h2></div>
        <textarea {...register("notes")} rows={3} placeholder="Ej. Le gustó el color blanco y viene el sábado..." className="field-input min-h-24 resize-none" />
        <FieldError message={formState.errors.notes?.message} />
      </section>

      {submitError ? <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert"><RefreshCw size={17} className="mt-0.5 shrink-0" />{submitError}</div> : null}
      {warning ? <p className="text-xs text-[var(--muted)]">{warning}</p> : null}

      <div className="sticky bottom-[91px] z-20 -mx-1 rounded-3xl border border-black/[0.06] bg-[var(--surface)]/90 p-2 backdrop-blur-xl sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <button type="submit" disabled={formState.isSubmitting || !formState.isValid} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[var(--lime)] px-5 text-base font-black text-[var(--ink)] shadow-[0_10px_24px_rgba(171,205,70,0.3)] transition hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45">
          {formState.isSubmitting ? <><LoaderCircle size={19} className="animate-spin" />Guardando lead...</> : <>Guardar lead <ArrowRight size={19} /></>}
        </button>
      </div>
    </form>
  );
}
