import type { ConversationState, CreateLeadInput, ExistingLeadSummary, FollowUpAction, FollowUpActionStatus, Lead, LeadMessage, MessageDirection, NextActionType, WhatsappStatus } from "@/lib/domain/lead";
import { calculateLeadScore, formatPhoneForWhatsapp } from "@/lib/domain/lead";
import type { Database } from "@/lib/supabase/database";
import { getInstallationAdvisorUserId } from "@/lib/config/installation";
import { AUTH_REQUIRED_MESSAGE } from "@/lib/auth/auth-required";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveInboundLeadMatch, type InboundLeadMatch } from "@/lib/leads/inbound-matching";
import type { FirstContactItem, FirstContactOperation, FirstContactOperationResult, FirstContactResource, FirstContactResult, ProviderOutcome } from "@/lib/first-contact/types";

const leadSelect = "id,user_id,tenant_id,created_at,full_name,phone,car_model,car_models,timeframe,payment_method,trade_in_car,score,temperature,notes,whatsapp_status,conversation_state,next_action_at,next_action_type,last_activity_at,last_customer_message_at,last_agent_message_at,last_customer_message_preview,deleted_at,status";

type LeadRow = {
  id: string;
  user_id: string | null;
  tenant_id: string | null;
  created_at: string;
  full_name: string;
  phone: string;
  car_model: Lead["carModel"];
  car_models: string[];
  timeframe: Lead["timeframe"];
  payment_method: Lead["paymentMethod"];
  trade_in_car: boolean;
  score: number;
  temperature: Lead["temperature"];
  notes: string | null;
  whatsapp_status: Lead["whatsappStatus"];
  conversation_state: Lead["conversationState"];
  next_action_at: string | null;
  next_action_type: Lead["nextActionType"];
  last_activity_at: string | null;
  last_customer_message_at: string | null;
  last_agent_message_at: string | null;
  last_customer_message_preview: string | null;
  deleted_at: string | null;
  status: Lead["status"];
};

type FollowUpActionRow = Database["public"]["Tables"]["lead_follow_up_actions"]["Row"];
type LeadflowDbClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
type RpcResult = { data: Record<string, unknown> | null; error: { message?: string } | null };

async function invokeRpc(client: LeadflowDbClient, functionName: string, args: Record<string, unknown>): Promise<RpcResult> {
  return (client.rpc as unknown as (name: string, parameters: Record<string, unknown>) => Promise<RpcResult>)(functionName, args);
}

type ActionRpcPayload = {
  id: string;
  lead_id: string;
  action_type: NextActionType;
  scheduled_for: string;
  status: FollowUpActionStatus;
  action_version: number;
  origin: "MANUAL" | "SUGGESTED";
  source_message_id: string | null;
  note: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function toDomainAction(row: FollowUpActionRow): FollowUpAction {
  return {
    id: row.id,
    leadId: row.lead_id,
    actionType: row.action_type,
    scheduledFor: row.scheduled_for,
    status: row.status,
    note: row.note,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    actionVersion: row.action_version,
    origin: row.origin as FollowUpAction["origin"],
    sourceMessageId: row.source_message_id,
  };
}

function toDomainActionRpc(data: Record<string, unknown> | null): FollowUpAction | null {
  const raw = data?.action;
  if (!raw || typeof raw !== "object") return null;
  const action = raw as Partial<ActionRpcPayload>;
  if (!action.id || !action.lead_id || !action.action_type || !action.scheduled_for || !action.status || typeof action.action_version !== "number") return null;
  return toDomainAction(action as ActionRpcPayload);
}

function toDomainLead(row: LeadRow, followUpActions: FollowUpAction[] = []): Lead {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    createdAt: row.created_at,
    fullName: row.full_name,
    phone: row.phone,
    carModel: row.car_model,
    carModels: row.car_models?.length ? row.car_models : row.car_model.split(",").map((model) => model.trim()).filter(Boolean),
    timeframe: row.timeframe,
    paymentMethod: row.payment_method,
    tradeInCar: row.trade_in_car,
    score: row.score,
    temperature: row.temperature,
    notes: row.notes,
    whatsappStatus: row.whatsapp_status,
    conversationState: row.conversation_state,
    nextActionAt: row.next_action_at,
    nextActionType: row.next_action_type,
    lastActivityAt: row.last_activity_at,
    lastCustomerMessageAt: row.last_customer_message_at,
    lastAgentMessageAt: row.last_agent_message_at,
    lastCustomerMessagePreview: row.last_customer_message_preview,
    lastMessageDirection: null,
    lastMessagePreview: null,
    lastInboundMessageId: null,
    lastInboundMessageAt: null,
    lastInboundMessagePreview: null,
    inboundClassification: null,
    inboundManualDecision: null,
    purchaseDecisionAt: null,
    deletedAt: row.deleted_at,
    status: row.status,
    followUpActions,
    firstContact: null,
  };
}

async function attachFirstContact(supabase: LeadflowDbClient, leads: Lead[]): Promise<Lead[]> {
  if (leads.length === 0) return leads;
  const results = await Promise.all(leads.map(async (lead) => {
    const { data } = await invokeRpc(supabase, "get_first_contact_v1", { p_lead_id: lead.id });
    return [lead.id, data && typeof data === "object" ? toFirstContactResult(data as Record<string, unknown>) : null] as const;
  }));
  const byLead = new Map(results);
  return leads.map((lead) => ({ ...lead, firstContact: byLead.get(lead.id) ?? null }));
}

async function attachFollowUpActions(supabase: LeadflowDbClient, leads: Lead[]): Promise<Lead[]> {
  if (leads.length === 0) return leads;
  const { data } = await supabase
    .from("lead_follow_up_actions")
    .select("id,lead_id,action_type,scheduled_for,status,action_version,origin,source_message_id,note,completed_at,created_at,updated_at")
    .in("lead_id", leads.map((lead) => lead.id))
    .order("scheduled_for", { ascending: true });
  if (!data) return leads;
  const actionsByLead = new Map<string, FollowUpAction[]>();
  data.forEach((row) => {
    const actions = actionsByLead.get(row.lead_id) ?? [];
    actions.push(toDomainAction(row));
    actionsByLead.set(row.lead_id, actions);
  });
  return leads.map((lead) => ({ ...lead, followUpActions: actionsByLead.get(lead.id) ?? [] }));
}

async function attachLatestMessages(supabase: LeadflowDbClient, leads: Lead[]): Promise<Lead[]> {
  if (leads.length === 0) return leads;
  const { data } = await supabase
    .from("lead_messages")
    .select("id,lead_id,direction,body,created_at,inbound_classification")
    .in("lead_id", leads.map((lead) => lead.id))
    .order("created_at", { ascending: false });
  if (!data) return leads;
  const latestByLead = new Map<string, { direction: MessageDirection; preview: string | null }>();
  const latestInboundByLead = new Map<string, { id: string; createdAt: string; preview: string | null; classification: Lead["inboundClassification"] }>();
  data.forEach((row) => {
    if (!latestByLead.has(row.lead_id)) latestByLead.set(row.lead_id, { direction: row.direction as MessageDirection, preview: row.body?.slice(0, 240) ?? null });
    if (row.direction === "INBOUND" && !latestInboundByLead.has(row.lead_id)) latestInboundByLead.set(row.lead_id, { id: row.id, createdAt: row.created_at, preview: row.body?.slice(0, 500) ?? null, classification: row.inbound_classification as Lead["inboundClassification"] });
  });
  return leads.map((lead) => {
    const latest = latestByLead.get(lead.id);
    const inbound = latestInboundByLead.get(lead.id);
    return { ...lead, ...(latest ? { lastMessageDirection: latest.direction, lastMessagePreview: latest.preview } : {}), ...(inbound ? { lastInboundMessageId: inbound.id, lastInboundMessageAt: inbound.createdAt, lastInboundMessagePreview: inbound.preview, inboundClassification: inbound.classification } : {}) };
  });
}

async function attachInboundManualDecisions(supabase: LeadflowDbClient, leads: Lead[]): Promise<Lead[]> {
  if (leads.length === 0) return leads;
  const { data } = await supabase.from("lead_inbound_manual_decisions").select("lead_id,decision,created_at").in("lead_id", leads.map((lead) => lead.id)).order("created_at", { ascending: false });
  if (!data) return leads;
  const latest = new Map<string, "REQUIRES_RESPONSE" | "NO_RESPONSE_REQUIRED">();
  data.forEach((row) => { if (!latest.has(row.lead_id)) latest.set(row.lead_id, row.decision as "REQUIRES_RESPONSE" | "NO_RESPONSE_REQUIRED"); });
  return leads.map((lead) => ({ ...lead, inboundManualDecision: latest.get(lead.id) ?? null }));
}

async function attachPurchaseMilestones(supabase: LeadflowDbClient, leads: Lead[]): Promise<Lead[]> {
  if (leads.length === 0) return leads;
  const { data } = await supabase.from("lead_milestones").select("lead_id,recorded_at").eq("milestone_type", "PURCHASE_DECISION").in("lead_id", leads.map((lead) => lead.id));
  if (!data) return leads;
  const dates = new Map<string, string>();
  data.forEach((row) => { if (!dates.has(row.lead_id)) dates.set(row.lead_id, row.recorded_at); });
  return leads.map((lead) => ({ ...lead, purchaseDecisionAt: dates.get(lead.id) ?? null }));
}

async function attachLeadRelations(supabase: LeadflowDbClient, leads: Lead[]): Promise<Lead[]> {
  return attachFirstContact(supabase, await attachPurchaseMilestones(supabase, await attachInboundManualDecisions(supabase, await attachLatestMessages(supabase, await attachFollowUpActions(supabase, leads)))));
}

export async function getLeads(): Promise<Lead[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data: userData } = await supabase.auth.getUser();
  const query = supabase.from("leads").select(leadSelect).is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  const { data, error } = userData.user
    ? await query.eq("user_id", userData.user.id)
    : await query.is("user_id", null);

  if (error || !data) return [];
  return attachLeadRelations(supabase, data.map((row) => toDomainLead(row as unknown as LeadRow)));
}

export async function createLead(input: CreateLeadInput): Promise<{ lead: Lead; warning?: string }> {
  const score = calculateLeadScore(input);
  const localLead: Lead = {
    id: crypto.randomUUID(),
    userId: null,
    tenantId: null,
    createdAt: new Date().toISOString(),
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    carModel: input.carModels.join(", "),
    carModels: input.carModels,
    timeframe: input.timeframe,
    paymentMethod: input.paymentMethod,
    tradeInCar: input.tradeInCar,
    score: score.score,
    temperature: score.temperature,
    notes: input.notes?.trim() || null,
    whatsappStatus: "PENDING",
    conversationState: "NEW",
    nextActionAt: null,
    nextActionType: null,
    lastActivityAt: null,
    lastCustomerMessageAt: null,
    lastAgentMessageAt: null,
    lastCustomerMessagePreview: null,
    lastMessageDirection: null,
    lastMessagePreview: null,
    lastInboundMessageId: null,
    lastInboundMessageAt: null,
    lastInboundMessagePreview: null,
    inboundClassification: null,
    inboundManualDecision: null,
    purchaseDecisionAt: null,
    deletedAt: null,
    status: "NUEVO",
    followUpActions: [],
  };

  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("No pudimos preparar el guardado del contacto. Intenta de nuevo y avísame si continúa.");

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    throw new Error("No fue posible verificar la sesión; el lead no fue guardado.");
  }
  let ownerId: string | null = null;
  if (userData.user) {
    ownerId = await getInstallationAdvisorUserId();
    if (!ownerId) throw new Error("La identidad de instalación no está configurada; el lead no fue guardado.");
    if (userData.user.id !== ownerId) throw new Error(AUTH_REQUIRED_MESSAGE);
  }
  const { data, error } = await supabase
    .from("leads")
    .insert({
      user_id: ownerId,
      full_name: localLead.fullName,
      phone: localLead.phone,
      car_model: localLead.carModel,
      car_models: localLead.carModels,
      timeframe: localLead.timeframe,
      payment_method: localLead.paymentMethod,
      trade_in_car: localLead.tradeInCar,
      notes: localLead.notes,
      status: localLead.status,
    })
    .select(leadSelect)
    .single();

  if (error || !data) {
    throw new Error("No pudimos guardar el contacto. Revisa tu conexión e inténtalo de nuevo.");
  }

  return { lead: toDomainLead(data as unknown as LeadRow), warning: "Lead guardado. Envíalo desde el dashboard cuando estés listo." };
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: userData } = await supabase.auth.getUser();
  const query = supabase.from("leads").select(leadSelect).eq("id", id).is("deleted_at", null);
  const { data, error } = userData.user
    ? await query.eq("user_id", userData.user.id).maybeSingle()
    : await query.is("user_id", null).maybeSingle();

  if (error || !data) return null;
  const [lead] = await attachLeadRelations(supabase, [toDomainLead(data as unknown as LeadRow)]);
  return lead ?? null;
}

export async function getCarModelImageUrl(modelName: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: model } = await supabase.from("car_models").select("id").eq("name", modelName).eq("active", true).maybeSingle();
  if (!model) return null;
  const { data: image } = await supabase.from("car_model_images").select("image_url").eq("car_model_id", model.id).order("sort_order", { ascending: true }).limit(1).maybeSingle();
  return image?.image_url ?? null;
}

export async function findLeadByPhone(phone: string, excludeLeadId?: string): Promise<ExistingLeadSummary | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: userData } = await supabase.auth.getUser();
  const query = supabase.from("leads").select(leadSelect).is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(500);
  const { data, error } = userData.user
    ? await query.eq("user_id", userData.user.id)
    : await query.is("user_id", null);

  if (error || !data) return null;
  const normalizedPhone = formatPhoneForWhatsapp(phone);
  const row = data.find((candidate) => candidate.id !== excludeLeadId && formatPhoneForWhatsapp(candidate.phone) === normalizedPhone);
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    carModels: row.car_models?.length ? row.car_models : [row.car_model],
    status: row.status,
    createdAt: row.created_at,
  };
}

async function getProviderContext(): Promise<{ supabase: LeadflowDbClient; advisorUserId: string } | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const advisorUserId = await getInstallationAdvisorUserId();
  if (!advisorUserId) return null;
  return { supabase: supabase as unknown as LeadflowDbClient, advisorUserId };
}

async function isProviderOwnedLead(context: { supabase: LeadflowDbClient; advisorUserId: string }, leadId: string): Promise<boolean> {
  const { data, error } = await context.supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("user_id", context.advisorUserId)
    .is("deleted_at", null)
    .maybeSingle();
  return !error && Boolean(data);
}

async function findProviderOwnedMessageById(context: { supabase: LeadflowDbClient; advisorUserId: string }, messageId: string): Promise<LeadMessage | null> {
  const { data, error } = await context.supabase
    .from("lead_messages")
    .select("id,lead_id,provider_message_id,direction,status,body,phone,created_at,delivered_at,read_at,failed_at")
    .eq("id", messageId)
    .maybeSingle();
  if (error || !data) return null;
  const owned = await isProviderOwnedLead(context, data.lead_id);
  return owned ? toDomainMessage(data as unknown as LeadMessageRow) : null;
}

async function findProviderOwnedMessageByProviderId(context: { supabase: LeadflowDbClient; advisorUserId: string }, providerMessageId: string): Promise<LeadMessage | null> {
  const { data, error } = await context.supabase
    .from("lead_messages")
    .select("id,lead_id,provider_message_id,direction,status,body,phone,created_at,delivered_at,read_at,failed_at")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  if (error || !data) return null;
  const owned = await isProviderOwnedLead(context, data.lead_id);
  return owned ? toDomainMessage(data as unknown as LeadMessageRow) : null;
}

export async function findLeadByPhoneForProvider(phone: string): Promise<Lead | null> {
  const context = await getProviderContext();
  if (!context) return null;

  const { data, error } = await context.supabase
    .from("leads")
    .select(leadSelect)
    .eq("user_id", context.advisorUserId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return null;
  const normalizedPhone = formatPhoneForWhatsapp(phone);
  const row = data.find((candidate) => formatPhoneForWhatsapp(candidate.phone) === normalizedPhone);
  if (!row) return null;
  const [lead] = await attachLeadRelations(context.supabase, [toDomainLead(row as unknown as LeadRow)]);
  return lead ?? null;
}

export async function resolveInboundLeadMatchForProvider(phone: string): Promise<InboundLeadMatch> {
  const context = await getProviderContext();
  if (!context) return { status: "NO_MATCH" };
  const { data, error } = await context.supabase
    .from("leads")
    .select("id,phone,created_at,deleted_at")
    .eq("user_id", context.advisorUserId)
    .limit(500);
  if (error || !data) return { status: "NO_MATCH" };
  return resolveInboundLeadMatch(phone, data.map((candidate) => ({ id: candidate.id, phone: candidate.phone, createdAt: candidate.created_at, deletedAt: candidate.deleted_at })));
}

export async function persistInboundMessageForProvider(input: {
  leadId: string;
  evolutionInstance: string;
  providerMessageId: string;
  phone: string;
  body: string | null;
  createdAt: string;
  classification: "NO_SUGGESTION" | "PENDING" | "REVIEW";
  associationStatus: "MATCHED" | "AMBIGUOUS";
  matchAmbiguous?: boolean;
}): Promise<Record<string, unknown> | null> {
  const context = await getProviderContext();
  if (!context) return null;
  const { data, error } = await invokeRpc(context.supabase, "persist_inbound_message_v1", {
    p_lead_id: input.leadId,
    p_evolution_instance: input.evolutionInstance,
    p_provider_message_id: input.providerMessageId,
    p_phone: input.phone,
    p_body: input.body,
    p_created_at: input.createdAt,
    p_classification: input.classification,
    p_association_status: input.associationStatus,
    p_match_ambiguous: input.matchAmbiguous ?? false,
  });
  return error ? null : data;
}

export async function upsertInboundResponseActionForProvider(input: {
  leadId: string;
  sourceMessageId: string;
  classification: "PENDING" | "REVIEW";
  scheduledFor: string;
  idempotencyKey: string;
}): Promise<FollowUpAction | null> {
  const context = await getProviderContext();
  if (!context) return null;
  const { data, error } = await invokeRpc(context.supabase, "upsert_inbound_response_action_v1", {
    p_lead_id: input.leadId,
    p_source_message_id: input.sourceMessageId,
    p_classification: input.classification,
    p_scheduled_for: input.scheduledFor,
    p_idempotency_key: input.idempotencyKey,
  });
  return error ? null : toDomainActionRpc(data);
}

export async function correctInboundResponseForAdvisor(input: {
  leadId: string;
  decision: "REQUIRES_RESPONSE" | "NO_RESPONSE_REQUIRED";
  sourceMessageId?: string;
  actionId?: string;
  expectedActionVersion?: number;
  scheduledFor?: string;
  idempotencyKey: string;
}): Promise<{ action: FollowUpAction | null; status: string; manualDecision: string } | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await invokeRpc(supabase, "correct_inbound_response_v1", {
    p_lead_id: input.leadId,
    p_decision: input.decision,
    p_source_message_id: input.sourceMessageId ?? null,
    p_action_id: input.actionId ?? null,
    p_expected_action_version: input.expectedActionVersion ?? null,
    p_scheduled_for: input.scheduledFor ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error || !data || typeof data !== "object") return null;
  const result = data as Record<string, unknown>;
  return {
    action: toDomainActionRpc(result),
    status: typeof result.status === "string" ? result.status : "UNKNOWN",
    manualDecision: typeof result.manual_decision === "string" ? result.manual_decision : input.decision,
  };
}

export async function getInboundMessageCreatedAtForAdvisor(messageId: string, leadId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("lead_messages").select("created_at").eq("id", messageId).eq("lead_id", leadId).eq("direction", "INBOUND").maybeSingle();
  return error || !data ? null : data.created_at;
}

export type PurchaseDecisionMilestone = { id: string; leadId: string; milestoneType: "PURCHASE_DECISION"; recordedAt: string; origin: "MANUAL" };

function toPurchaseDecisionMilestone(value: unknown): PurchaseDecisionMilestone | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.lead_id !== "string" || row.milestone_type !== "PURCHASE_DECISION" || typeof row.recorded_at !== "string" || row.origin !== "MANUAL") return null;
  return { id: row.id, leadId: row.lead_id, milestoneType: "PURCHASE_DECISION", recordedAt: row.recorded_at, origin: "MANUAL" };
}

export async function recordPurchaseDecision(leadId: string, idempotencyKey: string): Promise<{ status: string; replayed: boolean; milestone: PurchaseDecisionMilestone } | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await invokeRpc(supabase, "record_purchase_decision_v1", { p_lead_id: leadId, p_idempotency_key: idempotencyKey, p_recorded_at: new Date().toISOString() });
  if (error || !data || typeof data !== "object") return null;
  const result = data as Record<string, unknown>;
  const milestone = toPurchaseDecisionMilestone(result.milestone);
  if (!milestone) return null;
  return { status: typeof result.status === "string" ? result.status : "UNKNOWN", replayed: result.replayed === true, milestone };
}

function toFirstContactResult(value: unknown): FirstContactOperationResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const op = raw.operation as Record<string, unknown> | undefined;
  if (!op || typeof op.id !== "string" || typeof op.lead_id !== "string" || op.operation_type !== "FIRST_CONTACT" || typeof op.operation_version !== "number" || typeof op.status !== "string") return null;
  const items = Array.isArray(raw.items) ? raw.items.map((item): FirstContactItem | null => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.resource_kind !== "string" || typeof row.item_key !== "string" || typeof row.resource_version !== "string" || (row.availability !== "AVAILABLE" && row.availability !== "NOT_AVAILABLE")) return null;
    return { id: row.id, resourceKind: row.resource_kind as FirstContactResource, itemKey: row.item_key, resourceVersion: row.resource_version, availability: row.availability, result: row.result as FirstContactResult | null, effectId: typeof row.effect_id === "string" ? row.effect_id : null, leadMessageId: typeof row.lead_message_id === "string" ? row.lead_message_id : null, providerMessageId: typeof row.provider_message_id === "string" ? row.provider_message_id : null };
  }) : [];
  if (items.some((item) => !item)) return null;
  return { status: typeof raw.status === "string" ? raw.status : "UNKNOWN", replayed: raw.replayed === true, operation: { id: op.id, leadId: op.lead_id, operationType: "FIRST_CONTACT", operationVersion: op.operation_version, status: op.status as FirstContactOperation["status"] }, items: items as FirstContactItem[] };
}

export async function requestFirstContact(input: { leadId: string; configurationDigest: string; items: Array<{ resourceKind: FirstContactResource; itemKey: string; resourceVersion: string; availability: "AVAILABLE" | "NOT_AVAILABLE" }>; idempotencyKey: string }): Promise<FirstContactOperationResult | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await invokeRpc(supabase, "request_first_contact_v1", { p_lead_id: input.leadId, p_configuration_digest: input.configurationDigest, p_items: input.items.map((item) => ({ resource_kind: item.resourceKind, item_key: item.itemKey, resource_version: item.resourceVersion, availability: item.availability })), p_idempotency_key: input.idempotencyKey });
  return error ? null : toFirstContactResult(data);
}

export async function claimFirstContactEffect(effectId: string, claimTokenDigest: string): Promise<{ status: string; effectId: string; attemptNo: number } | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await invokeRpc(supabase, "claim_first_contact_effect_v1", { p_effect_id: effectId, p_claim_token_digest: claimTokenDigest });
  if (error || !data || typeof data !== "object") return null;
  const result = data as Record<string, unknown>;
  return typeof result.status === "string" && typeof result.effect_id === "string" && typeof result.attempt_no === "number" ? { status: result.status, effectId: result.effect_id, attemptNo: result.attempt_no } : null;
}

export async function beginFirstContactEffect(effectId: string, attemptNo: number, claimTokenDigest: string, payloadDigest?: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;
  const { data, error } = await invokeRpc(supabase, "begin_first_contact_effect_io_v1", { p_effect_id: effectId, p_attempt_no: attemptNo, p_claim_token_digest: claimTokenDigest, p_payload_digest: payloadDigest ?? null });
  return !error && Boolean(data);
}

export async function recordFirstContactEffectResult(effectId: string, attemptNo: number, claimTokenDigest: string, outcome: ProviderOutcome & { messageBody?: string | null }): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;
  const { error } = await invokeRpc(supabase, "record_first_contact_effect_result_v1", { p_effect_id: effectId, p_attempt_no: attemptNo, p_claim_token_digest: claimTokenDigest, p_result_kind: outcome.result, p_provider_message_id: outcome.providerMessageId ?? null, p_provider_status: outcome.providerStatus ?? null, p_message_body: outcome.messageBody ?? null });
  return !error;
}

export async function retryFirstContactEffect(effectId: string, expectedEffectVersion: number | undefined, idempotencyKey: string): Promise<Record<string, unknown> | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await invokeRpc(supabase, "retry_first_contact_effect_v1", { p_effect_id: effectId, p_expected_effect_version: expectedEffectVersion ?? null, p_idempotency_key: idempotencyKey });
  return error || !data || typeof data !== "object" ? null : data as Record<string, unknown>;
}

export async function updateLeadWhatsappStatus(id: string, status: WhatsappStatus, errorMessage?: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;
  return updateLeadWhatsappStatusWithClient(supabase, id, status, errorMessage);
}

async function updateLeadWhatsappStatusWithClient(supabase: LeadflowDbClient, id: string, status: WhatsappStatus, errorMessage?: string): Promise<boolean> {
  const update = status === "SENT"
    ? { whatsapp_status: status, whatsapp_last_error: null, whatsapp_sent_at: new Date().toISOString() }
    : { whatsapp_status: status, whatsapp_last_error: errorMessage ?? null };
  const { error } = await supabase.from("leads").update(update).eq("id", id).is("deleted_at", null);
  if (!error && status !== "FAILED") await supabase.from("leads").update({ status: "CONTACTADO" }).eq("id", id).eq("status", "NUEVO").is("deleted_at", null);
  return !error;
}

export async function updateLeadWhatsappStatusForProvider(id: string, status: WhatsappStatus, errorMessage?: string): Promise<boolean> {
  const context = await getProviderContext();
  if (!context) return false;
  const owned = await isProviderOwnedLead(context, id);
  return owned ? updateLeadWhatsappStatusWithClient(context.supabase, id, status, errorMessage) : false;
}

export async function markLeadAfterOutboundMessage(id: string, status: WhatsappStatus, errorMessage?: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const now = new Date().toISOString();
  const update = status === "FAILED"
    ? { whatsapp_status: status, whatsapp_last_error: errorMessage ?? "No pudimos actualizar el estado del mensaje." }
    : {
        whatsapp_status: status,
        whatsapp_last_error: null,
        whatsapp_sent_at: now,
        conversation_state: "WAITING_CUSTOMER" as const,
        last_activity_at: now,
        last_agent_message_at: now,
      };
  const { error } = await supabase.from("leads").update(update).eq("id", id).is("deleted_at", null);
  if (!error && status !== "FAILED") await supabase.from("leads").update({ status: "CONTACTADO" }).eq("id", id).eq("status", "NUEVO").is("deleted_at", null);
  return !error;
}

export async function createFollowUpAction(id: string, actionType: NextActionType, scheduledFor: string, note?: string, idempotencyKey = crypto.randomUUID()): Promise<FollowUpAction | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await invokeRpc(supabase, "create_lead_follow_up_action_v1", {
    p_lead_id: id,
    p_action_type: actionType,
    p_scheduled_for: scheduledFor,
    p_note: note?.trim() || null,
    p_idempotency_key: idempotencyKey,
    p_action_id: null,
    p_expected_action_version: null,
  });
  return error ? null : toDomainActionRpc(data);
}

export async function updateFollowUpAction(actionId: string, status: FollowUpActionStatus, scheduledFor?: string, note?: string, expectedActionVersion?: number, idempotencyKey = crypto.randomUUID()): Promise<FollowUpAction | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  let version = expectedActionVersion;
  if (!version) {
    const { data } = await supabase.from("lead_follow_up_actions").select("action_version").eq("id", actionId).maybeSingle();
    version = data?.action_version;
  }
  if (!version) return null;

  const { data, error } = await invokeRpc(supabase, "transition_lead_follow_up_action_v1", {
    p_action_id: actionId,
    p_status: status,
    p_expected_action_version: version,
    p_scheduled_for: scheduledFor ?? null,
    p_note: note?.trim() || null,
    p_idempotency_key: idempotencyKey,
    p_cancel_reason: status === "CANCELED" ? "ADVISOR_COMMAND" : null,
  });
  return error ? null : toDomainActionRpc(data);
}

export async function scheduleLeadAction(id: string, actionType: NextActionType, nextActionAt: string, note?: string, idempotencyKey?: string): Promise<FollowUpAction | null> {
  return createFollowUpAction(id, actionType, nextActionAt, note, idempotencyKey);
}

export async function clearLeadAction(id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const { data: actions, error: readError } = await supabase.from("lead_follow_up_actions").select("id,action_version").eq("lead_id", id).in("status", ["PENDING", "POSTPONED"]);
  if (readError) return false;
  for (const action of actions ?? []) {
    const { data, error } = await invokeRpc(supabase, "transition_lead_follow_up_action_v1", {
      p_action_id: action.id,
      p_status: "IGNORED",
      p_expected_action_version: action.action_version,
      p_scheduled_for: null,
      p_note: "Pendiente ignorado por el vendedor.",
      p_idempotency_key: crypto.randomUUID(),
      p_cancel_reason: null,
    });
    if (error || !toDomainActionRpc(data)) return false;
  }
  return true;
}

export async function softDeleteLead(id: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  const { data, error } = await (supabase.rpc as unknown as (name: string, parameters: Record<string, unknown>) => Promise<RpcResult>)("soft_delete_lead", { p_lead_id: id });
  return !error && (data as unknown) === true;
}

export async function markLeadCustomerReply(id: string, preview: string | null, messageAt: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;
  return (await markLeadCustomerReplyWithClient(supabase, id, preview, messageAt)).ok;
}

type CustomerReplyProjection = { ok: boolean; stale: boolean };

async function markLeadCustomerReplyWithClient(supabase: LeadflowDbClient, id: string, preview: string | null, messageAt: string): Promise<CustomerReplyProjection> {
  const { data: lead, error: leadReadError } = await supabase
    .from("leads")
    .select("last_customer_message_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (leadReadError || !lead) return { ok: false, stale: false };
  const incomingAt = Date.parse(messageAt);
  const currentAt = lead.last_customer_message_at ? Date.parse(lead.last_customer_message_at) : Number.NaN;
  if (Number.isFinite(currentAt) && Number.isFinite(incomingAt) && incomingAt <= currentAt) return { ok: true, stale: true };
  const { error: actionsError } = await supabase.from("lead_follow_up_actions").update({
    status: "CANCELED",
    completed_at: messageAt,
    note: "Cancelada porque el cliente respondió y la conversación está activa.",
  }).eq("lead_id", id).in("status", ["PENDING", "POSTPONED"]);
  const { error } = await supabase.from("leads").update({
    conversation_state: "ACTIVE",
    next_action_at: null,
    next_action_type: null,
    last_activity_at: messageAt,
    last_customer_message_at: messageAt,
    last_customer_message_preview: preview?.slice(0, 180) ?? null,
  }).eq("id", id).is("deleted_at", null);
  if (!actionsError && !error) await supabase.from("leads").update({ status: "CONTACTADO" }).eq("id", id).eq("status", "NUEVO").is("deleted_at", null);
  return { ok: !actionsError && !error, stale: false };
}

export async function markLeadCustomerReplyForProvider(id: string, preview: string | null, messageAt: string): Promise<CustomerReplyProjection> {
  const context = await getProviderContext();
  if (!context) return { ok: false, stale: false };
  const owned = await isProviderOwnedLead(context, id);
  return owned ? markLeadCustomerReplyWithClient(context.supabase, id, preview, messageAt) : { ok: false, stale: false };
}

export async function markLeadConversationActiveForProvider(id: string): Promise<boolean> {
  const context = await getProviderContext();
  if (!context) return false;
  const owned = await isProviderOwnedLead(context, id);
  if (!owned) return false;
  const { error } = await context.supabase.from("leads").update({ conversation_state: "ACTIVE" }).eq("id", id).is("deleted_at", null);
  return !error;
}

export async function updateLeadConversationState(id: string, state: ConversationState): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const { error } = await supabase.from("leads").update({ conversation_state: state }).eq("id", id).is("deleted_at", null);
  return !error;
}

type LeadMessageInput = {
  leadId: string;
  evolutionInstance?: string | null;
  providerMessageId?: string | null;
  direction: MessageDirection;
  status: WhatsappStatus;
  body?: string | null;
  phone?: string | null;
  createdAt?: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  failedAt?: string | null;
  rawPayload?: Record<string, unknown> | null;
};

type LeadMessageRow = {
  id: string;
  lead_id: string;
  provider_message_id: string | null;
  direction: MessageDirection;
  status: WhatsappStatus;
  body: string | null;
  phone: string | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
};

function toDomainMessage(row: LeadMessageRow): LeadMessage {
  return {
    id: row.id,
    leadId: row.lead_id,
    providerMessageId: row.provider_message_id,
    direction: row.direction,
    status: row.status,
    body: row.body,
    phone: row.phone,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    failedAt: row.failed_at,
  };
}

export async function createLeadMessage(input: LeadMessageInput): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  return createLeadMessageWithClient(supabase, input);
}

async function createLeadMessageWithClient(supabase: LeadflowDbClient, input: LeadMessageInput): Promise<string | null> {
  const row = {
    lead_id: input.leadId,
    evolution_instance: input.evolutionInstance ?? null,
    provider_message_id: input.providerMessageId ?? null,
    direction: input.direction,
    status: input.status,
    body: input.body ?? null,
    phone: input.phone ?? null,
    created_at: input.createdAt ?? new Date().toISOString(),
    delivered_at: input.deliveredAt ?? null,
    read_at: input.readAt ?? null,
    failed_at: input.failedAt ?? null,
    raw_payload: input.rawPayload ?? null,
  } as Database["public"]["Tables"]["lead_messages"]["Insert"] & { evolution_instance?: string | null };
  const { data, error } = await supabase.from("lead_messages").insert(row as never).select("id").single();
  return error || !data ? null : data.id;
}

export async function createLeadMessageForProvider(input: LeadMessageInput): Promise<string | null> {
  const context = await getProviderContext();
  if (!context) return null;
  const owned = await isProviderOwnedLead(context, input.leadId);
  return owned ? createLeadMessageWithClient(context.supabase, input) : null;
}

export async function updateLeadMessage(id: string, input: Omit<Partial<LeadMessageInput>, "leadId" | "direction">): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;
  return updateLeadMessageWithClient(supabase, id, input);
}

async function updateLeadMessageWithClient(supabase: LeadflowDbClient, id: string, input: Omit<Partial<LeadMessageInput>, "leadId" | "direction">): Promise<boolean> {
  const update: Database["public"]["Tables"]["lead_messages"]["Update"] = {};
  if (input.providerMessageId !== undefined) update.provider_message_id = input.providerMessageId;
  if (input.status !== undefined) update.status = input.status;
  if (input.body !== undefined) update.body = input.body;
  if (input.phone !== undefined) update.phone = input.phone;
  if (input.deliveredAt !== undefined) update.delivered_at = input.deliveredAt;
  if (input.readAt !== undefined) update.read_at = input.readAt;
  if (input.failedAt !== undefined) update.failed_at = input.failedAt;
  if (input.rawPayload !== undefined) update.raw_payload = input.rawPayload as unknown as Database["public"]["Tables"]["lead_messages"]["Update"]["raw_payload"];
  const { error } = await supabase.from("lead_messages").update(update).eq("id", id);
  return !error;
}

export async function updateLeadMessageForProvider(id: string, input: Omit<Partial<LeadMessageInput>, "leadId" | "direction">): Promise<boolean> {
  const context = await getProviderContext();
  if (!context) return false;
  const message = await findProviderOwnedMessageById(context, id);
  return message ? updateLeadMessageWithClient(context.supabase, id, input) : false;
}

export async function findLeadMessageByProviderId(providerMessageId: string, evolutionInstance?: string): Promise<LeadMessage | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  return findLeadMessageByProviderIdWithClient(supabase, providerMessageId, evolutionInstance);
}

async function findLeadMessageByProviderIdWithClient(supabase: LeadflowDbClient, providerMessageId: string, evolutionInstance?: string): Promise<LeadMessage | null> {
  let query = supabase.from("lead_messages").select("id,lead_id,provider_message_id,direction,status,body,phone,created_at,delivered_at,read_at,failed_at").eq("provider_message_id", providerMessageId);
  if (evolutionInstance) query = query.filter("evolution_instance", "eq", evolutionInstance);
  const { data, error } = await query.maybeSingle();
  return error || !data ? null : toDomainMessage(data as unknown as LeadMessageRow);
}

export async function findLeadMessageByProviderIdForProvider(providerMessageId: string, evolutionInstance: string): Promise<LeadMessage | null> {
  const context = await getProviderContext();
  if (!context) return null;
  const { data, error } = await context.supabase.from("lead_messages").select("id,lead_id,provider_message_id,direction,status,body,phone,created_at,delivered_at,read_at,failed_at").eq("provider_message_id", providerMessageId).filter("evolution_instance", "eq", evolutionInstance).maybeSingle();
  if (error || !data) return null;
  return (await isProviderOwnedLead(context, data.lead_id)) ? toDomainMessage(data as unknown as LeadMessageRow) : null;
}

export async function updateLeadMessageByProviderId(providerMessageId: string, input: Omit<Partial<LeadMessageInput>, "leadId" | "direction">): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const update: Database["public"]["Tables"]["lead_messages"]["Update"] = {};
  if (input.status !== undefined) update.status = input.status;
  if (input.body !== undefined) update.body = input.body;
  if (input.phone !== undefined) update.phone = input.phone;
  if (input.deliveredAt !== undefined) update.delivered_at = input.deliveredAt;
  if (input.readAt !== undefined) update.read_at = input.readAt;
  if (input.failedAt !== undefined) update.failed_at = input.failedAt;
  if (input.rawPayload !== undefined) update.raw_payload = input.rawPayload as unknown as Database["public"]["Tables"]["lead_messages"]["Update"]["raw_payload"];
  const { error } = await supabase.from("lead_messages").update(update).eq("provider_message_id", providerMessageId);
  return !error;
}
