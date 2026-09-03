"use client";

export default function PushDiagnosticsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-5 shadow-[0_12px_36px_rgba(16,24,40,0.05)] sm:p-7">
      <p className="eyebrow text-red-600">Diagnóstico no disponible</p>
      <h1 className="mt-2 text-2xl font-black tracking-[-0.04em]">No pudimos cargar los recordatorios.</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Ocurrió un problema al consultar las suscripciones Push. Intenta nuevamente.</p>
      <button type="button" onClick={() => reset()} className="button-primary mt-5">Reintentar</button>
    </div>
  );
}
