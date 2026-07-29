import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PersistentSettings = {
  whatsappMessageTemplate: string | null;
  sellerName: string | null;
  sellerPhone: string | null;
  sellerEmail: string | null;
  sellerCompany: string | null;
};

const settingsSelect = "whatsapp_message_template,seller_name,seller_phone,seller_email,seller_company";

const emptySettings: PersistentSettings = {
  whatsappMessageTemplate: null,
  sellerName: null,
  sellerPhone: null,
  sellerEmail: null,
  sellerCompany: null,
};

function toPersistentSettings(row: Partial<Record<string, string | null>> | null): PersistentSettings {
  return {
    whatsappMessageTemplate: row?.whatsapp_message_template ?? null,
    sellerName: row?.seller_name ?? null,
    sellerPhone: row?.seller_phone ?? null,
    sellerEmail: row?.seller_email ?? null,
    sellerCompany: row?.seller_company ?? null,
  };
}

export async function getPersistentSettings(): Promise<{ available: boolean; settings: PersistentSettings }> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return { available: false, settings: emptySettings };

  const { data, error } = await supabase.from("leadflow_settings").select(settingsSelect).eq("id", "default").maybeSingle();
  if (error) return { available: false, settings: emptySettings };
  return { available: true, settings: toPersistentSettings(data) };
}

export async function savePersistentSettings(patch: Partial<PersistentSettings>): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  const payload = {
    id: "default",
    ...(patch.whatsappMessageTemplate !== undefined ? { whatsapp_message_template: patch.whatsappMessageTemplate } : {}),
    ...(patch.sellerName !== undefined ? { seller_name: patch.sellerName } : {}),
    ...(patch.sellerPhone !== undefined ? { seller_phone: patch.sellerPhone } : {}),
    ...(patch.sellerEmail !== undefined ? { seller_email: patch.sellerEmail } : {}),
    ...(patch.sellerCompany !== undefined ? { seller_company: patch.sellerCompany } : {}),
  };
  const { error } = await supabase.from("leadflow_settings").upsert(payload, { onConflict: "id" });
  return !error;
}
