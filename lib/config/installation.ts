import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getInstallationAdvisorUserId(): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("leadflow_installation")
    .select("advisor_user_id")
    .eq("singleton", true)
    .maybeSingle();

  if (error || !data?.advisor_user_id) return null;
  return data.advisor_user_id;
}
