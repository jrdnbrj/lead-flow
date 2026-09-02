import { createHash } from "node:crypto";

import { getEffectiveWhatsappMessageTemplate } from "@/lib/config/message-template";
import { renderWhatsappMessageTemplate } from "@/lib/config/message-template-shared";
import { getEffectiveSellerProfile } from "@/lib/config/seller";
import { claimFirstContactEffect, beginFirstContactEffect, getCarModelContactAssetsForModels, hydrateFirstContactResource, recordFirstContactEffectResult, requestFirstContact, retryFirstContactEffect } from "@/lib/leads/repository";
import type { Lead } from "@/lib/domain/lead";
import { orderFirstContactItems } from "@/lib/first-contact/order";
import { getResourcesForItem, modelSlug, planFirstContactResourceItems, type FirstContactModelResources, type FirstContactRequestItem } from "@/lib/first-contact/resource-plan";
import type { FirstContactItem, FirstContactOperationResult, FirstContactProvider, ProviderOutcome, FirstContactResource } from "@/lib/first-contact/types";
import { ensureEvolutionWebhook } from "@/lib/whatsapp/service";

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

type FirstContactLead = Pick<Lead, "id" | "fullName" | "phone" | "carModels">;
type PreparedFirstContactItem = { item: FirstContactItem; attemptNo: number; claimTokenDigest: string };
type FirstContactRequest = {
  text: string;
  configurationDigest: string;
  items: FirstContactRequestItem[];
  modelResources: FirstContactModelResources[];
  resourcesByItemKey: Record<string, FirstContactModelResources>;
};

function resourcesForRequestItem(item: Pick<FirstContactItem, "resourceKind" | "itemKey">, request: FirstContactRequest): FirstContactModelResources | null {
  return getResourcesForItem(item, request.modelResources, request.resourcesByItemKey);
}

function messageBodyForResource(resource: FirstContactItem["resourceKind"], text: string, modelName?: string): string {
  if (resource === "MESSAGE") return text;
  if (resource === "PHOTOS") return modelName ? `Foto de ${modelName} enviada` : "Foto del vehículo enviada";
  return modelName ? `Ficha técnica de ${modelName} enviada` : "Ficha técnica enviada";
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
  request: FirstContactRequest;
}): Promise<boolean> {
  const { prepared, request } = input;
  const resources = resourcesForRequestItem(prepared.item, request);
  const payloadDigest = digest(JSON.stringify({ resource: prepared.item.resourceKind, itemKey: prepared.item.itemKey, version: prepared.item.resourceVersion, text: prepared.item.resourceKind === "MESSAGE" ? request.text : null, imageUrl: prepared.item.resourceKind === "PHOTOS" ? resources?.imageUrl : null, technicalSheetUrl: prepared.item.resourceKind === "TECHNICAL_SHEET" ? resources?.technicalSheetUrl : null }));
  return beginFirstContactEffect(prepared.item.effectId as string, prepared.attemptNo, prepared.claimTokenDigest, payloadDigest);
}

async function recordPreparedFirstContactItem(input: {
  prepared: PreparedFirstContactItem;
  request: FirstContactRequest;
  outcome: ProviderOutcome;
}): Promise<void> {
  const { prepared, request, outcome } = input;
  const resources = resourcesForRequestItem(prepared.item, request);
  await recordFirstContactEffectResult(prepared.item.effectId as string, prepared.attemptNo, prepared.claimTokenDigest, { ...outcome, messageBody: outcome.result === "ACCEPTED" ? messageBodyForResource(prepared.item.resourceKind, request.text, resources?.modelName) : null });
}

async function executeFirstContactItem(input: {
  item: FirstContactItem;
  lead: FirstContactLead;
  request: FirstContactRequest;
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

export async function retryFirstContactResourceFromRecovery(
  lead: FirstContactLead,
  resourceKind: FirstContactResource,
  provider: FirstContactProvider,
  idempotencyKey: string,
  itemKey?: string,
): Promise<FirstContactOperationResult | null> {
  const request = await buildFirstContactRequest(lead);
  await ensureEvolutionWebhook().catch(() => false);

  const initial = await requestFirstContact({
    leadId: lead.id,
    configurationDigest: request.configurationDigest,
    items: request.items,
    idempotencyKey,
  });
  if (!initial) return null;

  const initialCandidates = initial.items.filter((candidate) => candidate.resourceKind === resourceKind && (!itemKey || candidate.itemKey === itemKey));
  for (const item of initialCandidates) {
    await hydrateMissingFirstContactResource(lead.id, item, request);
  }
  const refreshed = await requestFirstContact({
    leadId: lead.id,
    configurationDigest: request.configurationDigest,
    items: request.items,
    idempotencyKey,
  });
  const operation = refreshed ?? initial;
  for (const item of orderFirstContactItems(operation.items.filter((candidate) => candidate.resourceKind === resourceKind && (!itemKey || candidate.itemKey === itemKey)))) {
    await executeFirstContactItem({ item, lead, request, idempotencyKey, provider });
  }

  const final = await requestFirstContact({
    leadId: lead.id,
    configurationDigest: request.configurationDigest,
    items: request.items,
    idempotencyKey,
  });
  return final ? { ...final, replayed: initial.replayed } : null;
}

async function hydrateMissingFirstContactResource(leadId: string, item: FirstContactItem, request: FirstContactRequest): Promise<boolean> {
  if (item.resourceKind === "MESSAGE" || item.availability !== "NOT_AVAILABLE") return false;
  const resources = resourcesForRequestItem(item, request);
  const resourceUrl = item.resourceKind === "PHOTOS" ? resources?.imageUrl : resources?.technicalSheetUrl;
  if (!resourceUrl) return false;
  const result = await hydrateFirstContactResource({ leadId, resourceKind: item.resourceKind, itemKey: item.itemKey, resourceVersion: digest(resourceUrl) });
  return Boolean(result);
}

async function sendFirstContactItem(item: Pick<FirstContactItem, "resourceKind" | "itemKey">, lead: FirstContactLead, request: FirstContactRequest, provider: FirstContactProvider): Promise<ProviderOutcome> {
  if (item.resourceKind === "MESSAGE") return provider.sendMessage({ phone: lead.phone, text: request.text });
  const resources = resourcesForRequestItem(item, request);
  if (!resources) throw new Error("FIRST_CONTACT_RESOURCE_NOT_RESOLVED");
  if (item.resourceKind === "PHOTOS") {
    if (!resources.imageUrl) throw new Error("FIRST_CONTACT_PHOTO_NOT_AVAILABLE");
    return provider.sendPhoto({ phone: lead.phone, imageUrl: resources.imageUrl, caption: `Información de ${resources.modelName}`, fileName: resources.imageFileName ?? `leadflow-${modelSlug(resources.modelName)}.jpg` });
  }
  if (!resources.technicalSheetUrl) throw new Error("FIRST_CONTACT_SHEET_NOT_AVAILABLE");
  return provider.sendDocument({ phone: lead.phone, documentUrl: resources.technicalSheetUrl, caption: `Ficha técnica de ${resources.modelName}`, fileName: resources.technicalSheetFileName ?? `Ficha técnica - ${resources.modelName}.pdf` });
}

export async function buildFirstContactRequest(lead: FirstContactLead): Promise<FirstContactRequest> {
  const template = await getEffectiveWhatsappMessageTemplate();
  const seller = await getEffectiveSellerProfile();
  const text = renderWhatsappMessageTemplate(template, { nombre: lead.fullName.trim().split(/\s+/)[0] || "cliente", numero: lead.phone, carro: lead.carModels.join(", "), nombre_vendedor: seller.name, correo_vendedor: seller.email, empresa_vendedor: seller.company, numero_vendedor: seller.phone });
  const selectedModels = lead.carModels.slice(0, 3);
  const assetsByModel = await getCarModelContactAssetsForModels(selectedModels);
  const modelResources = selectedModels.map((modelName) => {
    const assets = assetsByModel.get(modelName) ?? { modelId: null, modelName, imageUrl: null, imageFileName: null, technicalSheetUrl: null, technicalSheetFileName: null };
    return { modelName, modelId: assets.modelId, imageUrl: assets.imageUrl, imageFileName: assets.imageFileName, technicalSheetUrl: assets.technicalSheetUrl, technicalSheetFileName: assets.technicalSheetFileName };
  });
  const resourcePlan = planFirstContactResourceItems(modelResources);
  const resourcesByItemKey = resourcePlan.resourcesByItemKey;
  const resourceItems = resourcePlan.items.map((item) => ({
    ...item,
    resourceVersion: item.availability === "AVAILABLE" ? digest(item.resourceVersion) : item.resourceVersion,
  }));
  const firstModel = modelResources[0];
  if (firstModel) {
    // These aliases preserve retries for operations created before the
    // model-scoped item keys existed. They are never sent to the database for
    // a new operation.
    if (firstModel.imageUrl) resourcesByItemKey[`PHOTO:${digest(firstModel.imageUrl).slice(0, 24)}`] = firstModel;
    if (firstModel.technicalSheetUrl) resourcesByItemKey[`TECHNICAL_SHEET:${digest(firstModel.technicalSheetUrl).slice(0, 24)}`] = firstModel;
  }
  return {
    text,
    configurationDigest: digest(JSON.stringify({ template, seller, models: lead.carModels, resources: modelResources })),
    items: [
      { resourceKind: "MESSAGE" as const, itemKey: "TEXT", resourceVersion: digest(text), availability: "AVAILABLE" as const },
      ...resourceItems,
    ],
    modelResources,
    resourcesByItemKey,
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
  for (const item of initial.items) await hydrateMissingFirstContactResource(lead.id, item, request);
  const refreshed = await requestFirstContact({ leadId: lead.id, configurationDigest: request.configurationDigest, items: request.items, idempotencyKey });
  const operation = refreshed ?? initial;
  const orderedItems = orderFirstContactItems(operation.items);
  const messageItem = orderedItems.find((item) => item.resourceKind === "MESSAGE");
  const messageExecution = messageItem
    ? await executeFirstContactItem({ item: messageItem, lead, request, idempotencyKey, provider })
    : { attempted: false, outcome: null };
  const messageAccepted = messageItem?.result === "ACCEPTED" || messageExecution.outcome?.result === "ACCEPTED";
  let providerAttempted = messageExecution.attempted;
  if (messageAccepted) {
    for (const item of orderedItems.filter((candidate) => candidate.resourceKind !== "MESSAGE")) {
      const execution = await executeFirstContactItem({ item, lead, request, idempotencyKey, provider });
      providerAttempted = providerAttempted || execution.attempted;
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
  const claimItemKey = typeof claim.item_key === "string" ? claim.item_key : null;
  const directItem = claimItemKey ? request.items.find((candidate) => candidate.itemKey === claimItemKey) : null;
  const legacyItem = claimItemKey && (claim.resource_kind === "PHOTOS" || claim.resource_kind === "TECHNICAL_SHEET")
    ? (() => {
      const resources = resourcesForRequestItem({ resourceKind: claim.resource_kind as FirstContactResource, itemKey: claimItemKey }, request);
      const url = claim.resource_kind === "PHOTOS" ? resources?.imageUrl : resources?.technicalSheetUrl;
      return url ? { resourceKind: claim.resource_kind as FirstContactResource, itemKey: claimItemKey, resourceVersion: digest(url), availability: "AVAILABLE" as const } : null;
    })()
    : null;
  const item = directItem ?? legacyItem
  if (!item || item.availability !== "AVAILABLE") return null;
  const resources = resourcesForRequestItem(item, request);
  const payloadDigest = digest(JSON.stringify({ resource: item.resourceKind, itemKey: item.itemKey, version: item.resourceVersion, text: item.resourceKind === "MESSAGE" ? request.text : null, imageUrl: item.resourceKind === "PHOTOS" ? resources?.imageUrl : null, technicalSheetUrl: item.resourceKind === "TECHNICAL_SHEET" ? resources?.technicalSheetUrl : null }));
  if (!(await beginFirstContactEffect(effectId, claim.attempt_no, claim.claim_token_digest, payloadDigest))) return null;
  const outcome = await sendFirstContactItem(item, lead, request, provider).catch((): ProviderOutcome => ({ result: "UNKNOWN", providerMessageId: null, providerStatus: null }));
  await recordFirstContactEffectResult(effectId, claim.attempt_no, claim.claim_token_digest, { ...outcome, messageBody: outcome.result === "ACCEPTED" ? messageBodyForResource(item.resourceKind as FirstContactItem["resourceKind"], request.text, resources?.modelName) : null });
  return requestFirstContact({ leadId: lead.id, configurationDigest: request.configurationDigest, items: request.items, idempotencyKey });
}
