import { createHash } from "node:crypto";

import { getEffectiveWhatsappMessageTemplate } from "@/lib/config/message-template";
import { renderWhatsappMessageTemplate } from "@/lib/config/message-template-shared";
import { getEffectiveSellerProfile } from "@/lib/config/seller";
import { claimFirstContactEffect, beginFirstContactEffect, getCarModelContactAssets, recordFirstContactEffectResult, requestFirstContact, retryFirstContactEffect } from "@/lib/leads/repository";
import type { Lead } from "@/lib/domain/lead";
import { orderFirstContactItems } from "@/lib/first-contact/order";
import type { FirstContactItem, FirstContactOperationResult, FirstContactProvider, ProviderOutcome } from "@/lib/first-contact/types";
import { ensureEvolutionWebhook } from "@/lib/whatsapp/service";

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

type FirstContactLead = Pick<Lead, "id" | "fullName" | "phone" | "carModels">;
type PreparedFirstContactItem = { item: FirstContactItem; attemptNo: number; claimTokenDigest: string };

function messageBodyForResource(resource: FirstContactItem["resourceKind"], text: string): string {
  if (resource === "MESSAGE") return text;
  if (resource === "PHOTOS") return "Foto del vehículo enviada";
  return "Ficha técnica enviada";
}

async function prepareFirstContactItem(input: {
  item: FirstContactItem;
  idempotencyKey: string;
}): Promise<PreparedFirstContactItem | null> {
  const { item, idempotencyKey } = input;
  if (item.availability !== "AVAILABLE" || !item.effectId || item.result === "ACCEPTED") return null;

  const claimTokenDigest = digest(`${idempotencyKey}:${item.id}:${crypto.randomUUID()}`);
  const claim = await claimFirstContactEffect(item.effectId, claimTokenDigest);
  if (!claim || claim.status !== "CLAIMED") return null;
  return { item, attemptNo: claim.attemptNo, claimTokenDigest };
}

async function beginPreparedFirstContactItem(input: {
  prepared: PreparedFirstContactItem;
  request: Awaited<ReturnType<typeof buildFirstContactRequest>>;
}): Promise<boolean> {
  const { prepared, request } = input;
  const payloadDigest = digest(JSON.stringify({ resource: prepared.item.resourceKind, version: prepared.item.resourceVersion, text: prepared.item.resourceKind === "MESSAGE" ? request.text : null, imageUrl: prepared.item.resourceKind === "PHOTOS" ? request.imageUrl : null, technicalSheetUrl: prepared.item.resourceKind === "TECHNICAL_SHEET" ? request.technicalSheetUrl : null }));
  return beginFirstContactEffect(prepared.item.effectId as string, prepared.attemptNo, prepared.claimTokenDigest, payloadDigest);
}

async function recordPreparedFirstContactItem(input: {
  prepared: PreparedFirstContactItem;
  request: Awaited<ReturnType<typeof buildFirstContactRequest>>;
  outcome: ProviderOutcome;
}): Promise<void> {
  const { prepared, request, outcome } = input;
  await recordFirstContactEffectResult(prepared.item.effectId as string, prepared.attemptNo, prepared.claimTokenDigest, { ...outcome, messageBody: outcome.result === "ACCEPTED" ? messageBodyForResource(prepared.item.resourceKind, request.text) : null });
}

async function executeFirstContactItem(input: {
  item: FirstContactItem;
  lead: FirstContactLead;
  request: Awaited<ReturnType<typeof buildFirstContactRequest>>;
  idempotencyKey: string;
  provider: FirstContactProvider;
}): Promise<{ attempted: boolean; outcome: ProviderOutcome | null }> {
  const { item, lead, request, idempotencyKey, provider } = input;
  const prepared = await prepareFirstContactItem({ item, idempotencyKey });
  if (!prepared || !(await beginPreparedFirstContactItem({ prepared, request }))) return { attempted: false, outcome: null };

  const outcome = await sendFirstContactItem(item, lead, request, provider).catch((): ProviderOutcome => ({ result: "UNKNOWN", providerMessageId: null, providerStatus: null }));

  await recordPreparedFirstContactItem({ prepared, request, outcome });
  return { attempted: true, outcome };
}

async function sendFirstContactItem(item: FirstContactItem, lead: FirstContactLead, request: Awaited<ReturnType<typeof buildFirstContactRequest>>, provider: FirstContactProvider): Promise<ProviderOutcome> {
  return item.resourceKind === "MESSAGE"
    ? provider.sendMessage({ phone: lead.phone, text: request.text })
    : item.resourceKind === "PHOTOS"
      ? provider.sendPhoto({ phone: lead.phone, imageUrl: request.imageUrl ?? "", caption: `Información de ${lead.carModels[0] ?? "tu vehículo"}`, fileName: request.imageFileName ?? `leadflow-${(lead.carModels[0] ?? "vehiculo").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg` })
      : provider.sendDocument({ phone: lead.phone, documentUrl: request.technicalSheetUrl ?? "", caption: `Ficha técnica de ${lead.carModels[0] ?? "tu vehículo"}`, fileName: request.technicalSheetFileName ?? `Ficha técnica - ${(lead.carModels[0] ?? "vehiculo")}.pdf` });
}

export async function buildFirstContactRequest(lead: FirstContactLead) {
  const template = await getEffectiveWhatsappMessageTemplate();
  const seller = await getEffectiveSellerProfile();
  const text = renderWhatsappMessageTemplate(template, { nombre: lead.fullName.trim().split(/\s+/)[0] || "cliente", numero: lead.phone, carro: lead.carModels.join(", "), nombre_vendedor: seller.name, correo_vendedor: seller.email, empresa_vendedor: seller.company, numero_vendedor: seller.phone });
  const assets = lead.carModels[0] ? await getCarModelContactAssets(lead.carModels[0]) : { imageUrl: null, imageFileName: null, technicalSheetUrl: null, technicalSheetFileName: null };
  const imageUrl = assets.imageUrl;
  const technicalSheetUrl = assets.technicalSheetUrl;
  return {
    text,
    imageUrl,
    configurationDigest: digest(JSON.stringify({ template, seller, models: lead.carModels, imageUrl, technicalSheetUrl })),
    items: [
      { resourceKind: "MESSAGE" as const, itemKey: "TEXT", resourceVersion: digest(text), availability: "AVAILABLE" as const },
      { resourceKind: "PHOTOS" as const, itemKey: imageUrl ? `PHOTO:${digest(imageUrl).slice(0, 24)}` : "PHOTO:UNAVAILABLE", resourceVersion: imageUrl ? digest(imageUrl) : "unavailable-v1", availability: imageUrl ? "AVAILABLE" as const : "NOT_AVAILABLE" as const },
      { resourceKind: "TECHNICAL_SHEET" as const, itemKey: technicalSheetUrl ? `TECHNICAL_SHEET:${digest(technicalSheetUrl).slice(0, 24)}` : "TECHNICAL_SHEET:UNAVAILABLE", resourceVersion: technicalSheetUrl ? digest(technicalSheetUrl) : "unavailable-v1", availability: technicalSheetUrl ? "AVAILABLE" as const : "NOT_AVAILABLE" as const },
  ],
    imageFileName: assets.imageFileName,
    technicalSheetUrl,
    technicalSheetFileName: assets.technicalSheetFileName,
  };
}

export async function executeFirstContact(lead: FirstContactLead, provider: FirstContactProvider, idempotencyKey: string): Promise<FirstContactOperationResult | null> {
  const request = await buildFirstContactRequest(lead);
  // Evolution stores webhook configuration separately from the LeadFlow
  // process. Reassert it before a new outbound sequence so future replies can
  // reach the inbound boundary even after a provider restart.
  await ensureEvolutionWebhook().catch(() => false);
  const initial = await requestFirstContact({ leadId: lead.id, configurationDigest: request.configurationDigest, items: request.items, idempotencyKey });
  if (!initial) return null;
  const orderedItems = orderFirstContactItems(initial.items);
  const messageItem = orderedItems.find((item) => item.resourceKind === "MESSAGE");
  const messageExecution = messageItem
    ? await executeFirstContactItem({ item: messageItem, lead, request, idempotencyKey, provider })
    : { attempted: false, outcome: null };
  const messageAccepted = messageItem?.result === "ACCEPTED" || messageExecution.outcome?.result === "ACCEPTED";
  let providerAttempted = messageExecution.attempted;
  if (messageAccepted) {
    const preparedResources = await Promise.allSettled(orderedItems
      .filter((item) => item.resourceKind !== "MESSAGE")
      .map((item) => prepareFirstContactItem({ item, idempotencyKey })));
    const readyResources = preparedResources.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
    const begunResources = (await Promise.allSettled(readyResources.map(async (prepared) => ({ prepared, begun: await beginPreparedFirstContactItem({ prepared, request }) })))).flatMap((result) => result.status === "fulfilled" && result.value.begun ? [result.value.prepared] : []);
    const resourceSends = await Promise.all(begunResources.map(async (prepared) => ({ prepared, outcome: await sendFirstContactItem(prepared.item, lead, request, provider).catch((): ProviderOutcome => ({ result: "UNKNOWN", providerMessageId: null, providerStatus: null })) })));
    for (const resourceSend of resourceSends) {
      await recordPreparedFirstContactItem({ prepared: resourceSend.prepared, request, outcome: resourceSend.outcome });
      providerAttempted = true;
    }
  }
  const final = await requestFirstContact({ leadId: lead.id, configurationDigest: request.configurationDigest, items: request.items, idempotencyKey });
  return final ? { ...final, replayed: initial.replayed && !providerAttempted } : null;
}

export function retryableFirstContactResult(result: string | null): boolean { return result === null || result === "FAILED"; }

export async function retryFirstContact(lead: FirstContactLead, effectId: string, expectedEffectVersion: number | undefined, idempotencyKey: string, provider: FirstContactProvider): Promise<FirstContactOperationResult | null> {
  const request = await buildFirstContactRequest(lead);
  await ensureEvolutionWebhook().catch(() => false);
  const claim = await retryFirstContactEffect(effectId, expectedEffectVersion, idempotencyKey);
  if (!claim || claim.status !== "CLAIMED" || typeof claim.attempt_no !== "number" || typeof claim.claim_token_digest !== "string" || typeof claim.resource_kind !== "string") {
    return requestFirstContact({ leadId: lead.id, configurationDigest: request.configurationDigest, items: request.items, idempotencyKey });
  }
  const item = request.items.find((candidate) => candidate.resourceKind === claim.resource_kind);
  if (!item || item.availability !== "AVAILABLE") return null;
  const payloadDigest = digest(JSON.stringify({ resource: item.resourceKind, version: item.resourceVersion, text: item.resourceKind === "MESSAGE" ? request.text : null, imageUrl: item.resourceKind === "PHOTOS" ? request.imageUrl : null, technicalSheetUrl: item.resourceKind === "TECHNICAL_SHEET" ? request.technicalSheetUrl : null }));
  if (!(await beginFirstContactEffect(effectId, claim.attempt_no, claim.claim_token_digest, payloadDigest))) return null;
  const outcome = item.resourceKind === "MESSAGE"
    ? await provider.sendMessage({ phone: lead.phone, text: request.text })
    : item.resourceKind === "PHOTOS"
      ? await provider.sendPhoto({ phone: lead.phone, imageUrl: request.imageUrl ?? "", caption: `Información de ${lead.carModels[0] ?? "tu vehículo"}`, fileName: request.imageFileName ?? `leadflow-${(lead.carModels[0] ?? "vehiculo").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg` })
      : await provider.sendDocument({ phone: lead.phone, documentUrl: request.technicalSheetUrl ?? "", caption: `Ficha técnica de ${lead.carModels[0] ?? "tu vehículo"}`, fileName: request.technicalSheetFileName ?? `Ficha técnica - ${(lead.carModels[0] ?? "vehiculo")}.pdf` });
  await recordFirstContactEffectResult(effectId, claim.attempt_no, claim.claim_token_digest, { ...outcome, messageBody: outcome.result === "ACCEPTED" ? messageBodyForResource(item.resourceKind as FirstContactItem["resourceKind"], request.text) : null });
  return requestFirstContact({ leadId: lead.id, configurationDigest: request.configurationDigest, items: request.items, idempotencyKey });
}
