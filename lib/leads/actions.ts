"use server";

import type { ActionResponse, CreateLeadInput, Lead } from "@/lib/domain/lead";
import { leadSchema } from "@/lib/leads/validation";
import { createLead } from "@/lib/leads/repository";

export async function createLeadAction(input: CreateLeadInput): Promise<ActionResponse<Lead>> {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Revisa los datos del prospecto antes de guardar." };
  }

  try {
    const result = await createLead(parsed.data);
    return { success: true, data: result.lead, warning: result.warning };
  } catch {
    return { success: false, error: "No pudimos guardar el lead. Intenta nuevamente." };
  }
}
