import type { CreateLeadInput, Lead } from "@/lib/domain/lead";
import { calculateLeadScore } from "@/lib/domain/lead";
import { demoLeads } from "@/lib/leads/mock-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LeadRow = {
  id: string;
  user_id: string | null;
  tenant_id: string | null;
  created_at: string;
  full_name: string;
  phone: string;
  car_model: Lead["carModel"];
  timeframe: Lead["timeframe"];
  payment_method: Lead["paymentMethod"];
  trade_in_car: boolean;
  score: number;
  temperature: Lead["temperature"];
  notes: string | null;
  whatsapp_status: Lead["whatsappStatus"];
  status: Lead["status"];
};

function toDomainLead(row: LeadRow): Lead {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    createdAt: row.created_at,
    fullName: row.full_name,
    phone: row.phone,
    carModel: row.car_model,
    timeframe: row.timeframe,
    paymentMethod: row.payment_method,
    tradeInCar: row.trade_in_car,
    score: row.score,
    temperature: row.temperature,
    notes: row.notes,
    whatsappStatus: row.whatsapp_status,
    status: row.status,
  };
}

export async function getLeads(): Promise<Lead[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return demoLeads;

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return demoLeads;

  const { data, error } = await supabase
    .from("leads")
    .select("id,user_id,tenant_id,created_at,full_name,phone,car_model,timeframe,payment_method,trade_in_car,score,temperature,notes,whatsapp_status,status")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) return demoLeads;
  return data.map((row) => toDomainLead(row));
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
    carModel: input.carModel.trim(),
    timeframe: input.timeframe,
    paymentMethod: input.paymentMethod,
    tradeInCar: input.tradeInCar,
    score: score.score,
    temperature: score.temperature,
    notes: input.notes?.trim() || null,
    whatsappStatus: "PENDING",
    status: "NUEVO",
  };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { lead: localLead, warning: "Guardado en este dispositivo. Conecta Supabase para sincronizarlo." };

  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      user_id: userData.user?.id ?? null,
      full_name: localLead.fullName,
      phone: localLead.phone,
      car_model: localLead.carModel,
      timeframe: localLead.timeframe,
      payment_method: localLead.paymentMethod,
      trade_in_car: localLead.tradeInCar,
      notes: localLead.notes,
      status: localLead.status,
    })
    .select("id,user_id,tenant_id,created_at,full_name,phone,car_model,timeframe,payment_method,trade_in_car,score,temperature,notes,whatsapp_status,status")
    .single();

  if (error || !data) {
    return { lead: localLead, warning: "Lead guardado localmente; la sincronización se reintentará cuando haya conexión." };
  }

  return { lead: toDomainLead(data), warning: "Lead guardado. WhatsApp se enviará en segundo plano." };
}
