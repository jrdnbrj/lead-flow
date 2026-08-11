import type { ConversationState, CreateLeadInput, FollowUpAction, FollowUpActionStatus, Lead, LeadMessage, MessageDirection, NextActionType, WhatsappStatus } from "@/lib/domain/lead";
import { calculateLeadScore, formatPhoneForWhatsapp } from "@/lib/domain/lead";
import type { Database } from "@/lib/supabase/database";
import { getInstallationAdvisorUserId } from "@/lib/config/installation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  };
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
    deletedAt: row.deleted_at,
    status: row.status,
    followUpActions,
  };
}

async function attachFollowUpActions(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, leads: Lead[]): Promise<Lead[]> {
  if (leads.length === 0) return leads;
  const { data } = await supabase
    .from("lead_follow_up_actions")
    .select("id,lead_id,action_type,scheduled_for,status,note,completed_at,created_at,updated_at")
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

async function attachLatestMessages(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, leads: Lead[]): Promise<Lead[]> {
  if (leads.length === 0) return leads;
  const { data } = await supabase
    .from("lead_messages")
    .select("lead_id,direction,body,created_at")
    .in("lead_id", leads.map((lead) => lead.id))
    .order("created_at", { ascending: false });
  if (!data) return leads;
  const latestByLead = new Map<string, { direction: MessageDirection; preview: string | null }>();
  data.forEach((row) => {
    if (!latestByLead.has(row.lead_id)) latestByLead.set(row.lead_id, { direction: row.direction, preview: row.body?.slice(0, 240) ?? null });
  });
  return leads.map((lead) => {
    const latest = latestByLead.get(lead.id);
    return latest ? { ...lead, lastMessageDirection: latest.direction, lastMessagePreview: latest.preview } : lead;
  });
}

async function attachLeadRelations(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, leads: Lead[]): Promise<Lead[]> {
  return attachLatestMessages(supabase, await attachFollowUpActions(supabase, leads));
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
  return attachLeadRelations(supabase, data.map((row) => toDomainLead(row)));
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
    deletedAt: null,
    status: "NUEVO",
    followUpActions: [],
  };

  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase no está configurado. Completa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY para guardar el contacto en la nube.");

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    throw new Error("No fue posible verificar la sesión; el lead no fue guardado.");
  }
  let ownerId: string | null = null;
  if (userData.user) {
    ownerId = await getInstallationAdvisorUserId();
    if (!ownerId) throw new Error("La identidad de instalación no está configurada; el lead no fue guardado.");
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
    throw new Error(error?.message || "Supabase no confirmó la persistencia del contacto.");
  }

  return { lead: toDomainLead(data), warning: "Lead guardado en Supabase. Envíalo desde el dashboard cuando estés listo." };
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
  const [lead] = await attachLeadRelations(supabase, [toDomainLead(data)]);
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

export async function findLeadByPhone(phone: string): Promise<Lead | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: userData } = await supabase.auth.getUser();
  const query = supabase.from("leads").select(leadSelect).is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
  const { data, error } = userData.user
    ? await query.eq("user_id", userData.user.id)
    : await query.is("user_id", null);

  if (error || !data) return null;
  const normalizedPhone = formatPhoneForWhatsapp(phone);
  const row = data.find((candidate) => formatPhoneForWhatsapp(candidate.phone) === normalizedPhone);
  if (!row) return null;
  const [lead] = await attachLeadRelations(supabase, [toDomainLead(row)]);
  return lead ?? null;
}

export async function updateLeadWhatsappStatus(id: string, status: WhatsappStatus, errorMessage?: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const update = status === "SENT"
    ? { whatsapp_status: status, whatsapp_last_error: null, whatsapp_sent_at: new Date().toISOString() }
    : { whatsapp_status: status, whatsapp_last_error: errorMessage ?? null };
  const { error } = await supabase.from("leads").update(update).eq("id", id).is("deleted_at", null);
  if (!error && status !== "FAILED") await supabase.from("leads").update({ status: "CONTACTADO" }).eq("id", id).eq("status", "NUEVO").is("deleted_at", null);
  return !error;
}

export async function markLeadAfterOutboundMessage(id: string, status: WhatsappStatus, errorMessage?: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const now = new Date().toISOString();
  const update = status === "FAILED"
    ? { whatsapp_status: status, whatsapp_last_error: errorMessage ?? "Evolution API error" }
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

const followUpActionSelect = "id,lead_id,action_type,scheduled_for,status,note,completed_at,created_at,updated_at";

export async function createFollowUpAction(id: string, actionType: NextActionType, scheduledFor: string, note?: string): Promise<FollowUpAction | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: activeLead } = await supabase.from("leads").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!activeLead) return null;

  const { data, error } = await supabase.from("lead_follow_up_actions").insert({
    lead_id: id,
    action_type: actionType,
    scheduled_for: scheduledFor,
    note: note?.trim() || null,
  }).select(followUpActionSelect).single();
  if (error || !data) return null;
  await supabase.from("leads").update({ conversation_state: "WAITING_CUSTOMER" }).eq("id", id).is("deleted_at", null);
  return toDomainAction(data);
}

export async function updateFollowUpAction(actionId: string, status: FollowUpActionStatus, scheduledFor?: string, note?: string): Promise<FollowUpAction | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const update: Database["public"]["Tables"]["lead_follow_up_actions"]["Update"] = {
    status,
    completed_at: status === "PENDING" || status === "POSTPONED" ? null : new Date().toISOString(),
  };
  if (scheduledFor) update.scheduled_for = scheduledFor;
  if (note !== undefined) update.note = note.trim() || null;
  const { data, error } = await supabase.from("lead_follow_up_actions").update(update).eq("id", actionId).select(followUpActionSelect).single();
  return error || !data ? null : toDomainAction(data);
}

export async function scheduleLeadAction(id: string, actionType: NextActionType, nextActionAt: string, note?: string): Promise<FollowUpAction | null> {
  return createFollowUpAction(id, actionType, nextActionAt, note);
}

export async function clearLeadAction(id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const now = new Date().toISOString();
  const { error: actionsError } = await supabase.from("lead_follow_up_actions").update({
    status: "IGNORED",
    completed_at: now,
    note: "Pendiente ignorado por el vendedor.",
  }).eq("lead_id", id).in("status", ["PENDING", "POSTPONED"]);
  const { error } = await supabase.from("leads").update({ next_action_at: null, next_action_type: null }).eq("id", id).is("deleted_at", null);
  return !actionsError && !error;
}

export async function softDeleteLead(id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const { data, error } = await supabase.rpc("soft_delete_lead", { p_lead_id: id });
  return !error && data === true;
}

export async function markLeadCustomerReply(id: string, preview: string | null, messageAt: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

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
  return !actionsError && !error;
}

export async function updateLeadConversationState(id: string, state: ConversationState): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const { error } = await supabase.from("leads").update({ conversation_state: state }).eq("id", id).is("deleted_at", null);
  return !error;
}

type LeadMessageInput = {
  leadId: string;
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

  const { data, error } = await supabase.from("lead_messages").insert({
    lead_id: input.leadId,
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
  }).select("id").single();
  return error || !data ? null : data.id;
}

export async function updateLeadMessage(id: string, input: Omit<Partial<LeadMessageInput>, "leadId" | "direction">): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  const update: Database["public"]["Tables"]["lead_messages"]["Update"] = {};
  if (input.providerMessageId !== undefined) update.provider_message_id = input.providerMessageId;
  if (input.status !== undefined) update.status = input.status;
  if (input.body !== undefined) update.body = input.body;
  if (input.phone !== undefined) update.phone = input.phone;
  if (input.deliveredAt !== undefined) update.delivered_at = input.deliveredAt;
  if (input.readAt !== undefined) update.read_at = input.readAt;
  if (input.failedAt !== undefined) update.failed_at = input.failedAt;
  if (input.rawPayload !== undefined) update.raw_payload = input.rawPayload;
  const { error } = await supabase.from("lead_messages").update(update).eq("id", id);
  return !error;
}

export async function findLeadMessageByProviderId(providerMessageId: string): Promise<LeadMessage | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from("lead_messages").select("id,lead_id,provider_message_id,direction,status,body,phone,created_at,delivered_at,read_at,failed_at").eq("provider_message_id", providerMessageId).maybeSingle();
  return error || !data ? null : toDomainMessage(data);
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
  if (input.rawPayload !== undefined) update.raw_payload = input.rawPayload;
  const { error } = await supabase.from("lead_messages").update(update).eq("provider_message_id", providerMessageId);
  return !error;
}
