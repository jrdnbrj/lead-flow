import { createHash } from "node:crypto";

import { getEffectiveWhatsappMessageTemplate } from "@/lib/config/message-template";
import { renderWhatsappMessageTemplate } from "@/lib/config/message-template-shared";
import { getEffectiveSellerProfile } from "@/lib/config/seller";
import { claimFirstContactEffect, beginFirstContactEffect, recordFirstContactEffectResult, requestFirstContact, retryFirstContactEffect } from "@/lib/leads/repository";
import type { Lead } from "@/lib/domain/lead";
import type { FirstContactOperationResult, FirstContactProvider, FirstContactResource } from "@/lib/first-contact/types";

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

type FirstContactLead = Pick<Lead, "id" | "fullName" | "phone" | "carModels">;

export async function buildFirstContactRequest(lead: FirstContactLead) {
  const template = await getEffectiveWhatsappMessageTemplate();
  const seller = await getEffectiveSellerProfile();
  const text = renderWhatsappMessageTemplate(template, { nombre: lead.fullName.trim().split(/\s+/)[0] || "cliente", numero: lead.phone, carro: lead.carModels.join(", "), nombre_vendedor: seller.name, correo_vendedor: seller.email, empresa_vendedor: seller.company, numero_vendedor: seller.phone });
  const imageUrl = lead.carModels[0] ? await (await import("@/lib/leads/repository")).getCarModelImageUrl(lead.carModels[0]) : null;
  return {
    text,
    imageUrl,
    configurationDigest: digest(JSON.stringify({ template, seller, models: lead.carModels, imageUrl })),
    items: [
      { resourceKind: "MESSAGE" as const, itemKey: "TEXT", resourceVersion: digest(text), availability: "AVAILABLE" as const },
      { resourceKind: "PHOTOS" as const, itemKey: imageUrl ? `PHOTO:${digest(imageUrl).slice(0, 24)}` : "PHOTO:UNAVAILABLE", resourceVersion: imageUrl ? digest(imageUrl) : "unavailable-v1", availability: imageUrl ? "AVAILABLE" as const : "NOT_AVAILABLE" as const },
      { resourceKind: "TECHNICAL_SHEET" as const, itemKey: "TECHNICAL_SHEET:UNAVAILABLE", resourceVersion: "unavailable-v1", availability: "NOT_AVAILABLE" as const },
    ],
  };
}

export async function executeFirstContact(lead: FirstContactLead, provider: FirstContactProvider, idempotencyKey: string): Promise<FirstContactOperationResult | null> {
  const request = await buildFirstContactRequest(lead);
  const initial = await requestFirstContact({ leadId: lead.id, configurationDigest: request.configurationDigest, items: request.items, idempotencyKey });
  if (!initial) return null;
  for (const item of initial.items) {
    if (item.availability !== "AVAILABLE" || !item.effectId || item.result === "ACCEPTED") continue;
    const claimTokenDigest = digest(`${idempotencyKey}:${item.id}:${crypto.randomUUID()}`);
    const claim = await claimFirstContactEffect(item.effectId, claimTokenDigest);
    if (!claim || claim.status !== "CLAIMED") continue;
    if (!(await beginFirstContactEffect(item.effectId, claim.attemptNo, claimTokenDigest))) continue;
    const outcome = item.resourceKind === "MESSAGE"
      ? await provider.sendMessage({ phone: lead.phone, text: request.text })
      : await provider.sendPhoto({ phone: lead.phone, imageUrl: request.imageUrl ?? "", caption: `Información de ${lead.carModels[0] ?? "tu vehículo"}`, fileName: `leadflow-${(lead.carModels[0] ?? "vehiculo").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg` });
    await recordFirstContactEffectResult(item.effectId, claim.attemptNo, claimTokenDigest, { ...outcome, messageBody: item.resourceKind === "MESSAGE" ? request.text : null });
  }
  return requestFirstContact({ leadId: lead.id, configurationDigest: request.configurationDigest, items: request.items, idempotencyKey });
}

export function retryableFirstContactResult(result: string | null): boolean { return result === "FAILED"; }
export function firstContactResourceLabel(resource: FirstContactResource): string { return { MESSAGE: "Mensaje", PHOTOS: "Fotos", TECHNICAL_SHEET: "Ficha técnica" }[resource]; }

export async function retryFirstContact(lead: FirstContactLead, effectId: string, expectedEffectVersion: number | undefined, idempotencyKey: string, provider: FirstContactProvider): Promise<FirstContactOperationResult | null> {
  const request = await buildFirstContactRequest(lead);
  const claim = await retryFirstContactEffect(effectId, expectedEffectVersion, idempotencyKey);
  if (!claim || claim.status !== "CLAIMED" || typeof claim.attempt_no !== "number" || typeof claim.claim_token_digest !== "string" || typeof claim.resource_kind !== "string") {
    return requestFirstContact({ leadId: lead.id, configurationDigest: request.configurationDigest, items: request.items, idempotencyKey });
  }
  const item = request.items.find((candidate) => candidate.resourceKind === claim.resource_kind);
  if (!item || item.availability !== "AVAILABLE") return null;
  if (!(await beginFirstContactEffect(effectId, claim.attempt_no, claim.claim_token_digest))) return null;
  const outcome = item.resourceKind === "MESSAGE"
    ? await provider.sendMessage({ phone: lead.phone, text: request.text })
    : await provider.sendPhoto({ phone: lead.phone, imageUrl: request.imageUrl ?? "", caption: `Información de ${lead.carModels[0] ?? "tu vehículo"}`, fileName: `leadflow-${(lead.carModels[0] ?? "vehiculo").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg` });
  await recordFirstContactEffectResult(effectId, claim.attempt_no, claim.claim_token_digest, { ...outcome, messageBody: item.resourceKind === "MESSAGE" ? request.text : null });
  return requestFirstContact({ leadId: lead.id, configurationDigest: request.configurationDigest, items: request.items, idempotencyKey });
}
