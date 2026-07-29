"use client";

import { CheckCircle2, Info, Save, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { saveWhatsappMessageTemplateAction } from "@/lib/config/message-actions";
import { DEFAULT_WHATSAPP_MESSAGE_TEMPLATE, getUnknownWhatsappTemplateVariables, WHATSAPP_TEMPLATE_VARIABLE_LABELS, WHATSAPP_TEMPLATE_VARIABLES, type WhatsappTemplateVariable } from "@/lib/config/message-template-shared";

const sampleValues: Record<WhatsappTemplateVariable, string> = {
  nombre: "Jordan",
  numero: "0984790449",
  carro: "Toyota Corolla Cross",
  nombre_vendedor: "Alexis Borja",
  correo_vendedor: "alexisborja@changanecuador.com",
  empresa_vendedor: "Changan Ecuador",
  numero_vendedor: "+593 99 546 2964",
};

function renderHighlightedTemplate(template: string) {
  const parts = template.split(/({{\s*[a-zA-Z0-9_]+\s*}})/g);
  return parts.map((part, index) => {
    const match = part.match(/^{{\s*([a-zA-Z0-9_]+)\s*}}$/);
    if (!match) return <span key={part + "-" + index}>{part}</span>;
    const variable = match[1]?.toLowerCase();
    const recognized = WHATSAPP_TEMPLATE_VARIABLES.includes(variable as (typeof WHATSAPP_TEMPLATE_VARIABLES)[number]);
    return <mark key={part + "-" + index} className={recognized ? "rounded bg-[#dff7e7] text-[#11743d]" : "rounded bg-[#fff0ee] text-[#b33a2c]"}>{part}</mark>;
  });
}

function renderPreview(template: string): string {
  return template.replace(/{{\s*(nombre|numero|carro|nombre_vendedor|correo_vendedor|empresa_vendedor|numero_vendedor)\s*}}/gi, (_, variable: WhatsappTemplateVariable) => sampleValues[variable.toLowerCase() as WhatsappTemplateVariable]);
}

export function MessageTemplateEditor({ initialTemplate }: { initialTemplate: string }) {
  const [template, setTemplate] = useState(initialTemplate || DEFAULT_WHATSAPP_MESSAGE_TEMPLATE);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const unknownVariable = useMemo(() => getUnknownWhatsappTemplateVariables(template)[0] ?? null, [template]);

  async function saveTemplate() {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    const response = await saveWhatsappMessageTemplateAction(template);
    if (response.success && response.data) {
      setTemplate(response.data.template);
      setMessage("Mensaje automático guardado.");
    } else {
      setError(response.error || "No pudimos guardar el mensaje.");
    }
    setIsSaving(false);
  }

  return (
    <section className="mt-5 rounded-[24px] border border-black/[0.06] bg-white p-4 shadow-[0_12px_36px_rgba(16,24,40,0.05)] sm:p-5">
      <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef5ff] text-[#3c5f9b]"><WandSparkles size={17} /></span><div><p className="eyebrow">Mensaje automático</p><h2 className="mt-1 text-lg font-black">Personaliza el primer contacto</h2><p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted)]">Este texto se usa cuando presionas Enviar en un lead.</p></div></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <label className="text-xs font-black">Plantilla del mensaje
            <div className="relative mt-1.5 min-h-36 overflow-hidden rounded-2xl border border-black/10 bg-[#faf9f6] focus-within:border-[var(--ink)]">
              <div aria-hidden className="template-editor-layer pointer-events-none absolute inset-0 whitespace-pre-wrap break-words p-3 text-sm leading-6 text-[var(--ink)]">{renderHighlightedTemplate(template)}{!template ? <span className="text-[#9a9b9b]">Escribe tu mensaje...</span> : null}</div>
              <textarea aria-label="Plantilla del mensaje automático" value={template} onChange={(event) => { setTemplate(event.target.value); setMessage(null); setError(null); }} className="template-editor-layer relative z-10 min-h-36 w-full resize-y bg-transparent p-3 text-sm leading-6 text-transparent caret-[var(--ink)] outline-none selection:bg-[#b7d6ff] selection:text-transparent" />
            </div>
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">{WHATSAPP_TEMPLATE_VARIABLES.map((variable) => <button type="button" key={variable} title={WHATSAPP_TEMPLATE_VARIABLE_LABELS[variable]} onClick={() => setTemplate((current) => current + (current && !current.endsWith(" ") ? " " : "") + "{{" + variable + "}}")} className={`rounded-full px-2.5 py-1 text-[11px] font-black ${variable.includes("vendedor") ? "bg-[#eef5ff] text-[#3c5f9b]" : "bg-[#dff7e7] text-[#11743d]"}`}>{"{{"}{variable}{"}}"}</button>)}</div>
          <div className="mt-3 rounded-xl bg-[#f6f3ed] px-3 py-2.5 text-xs leading-5 text-[var(--muted)]"><button type="button" onClick={() => setShowHelp((current) => !current)} className="flex items-center gap-1.5 font-black text-[var(--ink)]"><Info size={14} />Cómo usar las variables <span aria-hidden>{showHelp ? "−" : "+"}</span></button>{showHelp ? <p className="mt-1.5">Escribe las variables exactamente entre dobles llaves. Las variables del cliente son <strong>{"{{nombre}}"}</strong>, <strong>{"{{numero}}"}</strong> y <strong>{"{{carro}}"}</strong>. Para tus datos usa <strong>{"{{nombre_vendedor}}"}</strong>, <strong>{"{{correo_vendedor}}"}</strong>, <strong>{"{{empresa_vendedor}}"}</strong> y <strong>{"{{numero_vendedor}}"}</strong>. Las reconocidas aparecen en verde o azul; una variable escrita por error aparece en rojo.</p> : null}</div>
        </div>
        <div className="rounded-2xl border border-[#dff7e7] bg-[#f5fff7] p-3.5"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#11743d]">Vista previa</p><div className="mt-3 rounded-2xl rounded-tl-md bg-white px-3.5 py-3 text-sm leading-6 text-[var(--ink)] shadow-sm">{renderPreview(template)}</div><p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">Ejemplo con datos del cliente y del vendedor. Se actualiza al escribir.</p></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={saveTemplate} disabled={isSaving || Boolean(unknownVariable)} className="button-primary"><Save size={16} />{isSaving ? "Guardando" : "Guardar mensaje"}</button>{message ? <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={15} />{message}</p> : null}{error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}</div>
    </section>
  );
}
