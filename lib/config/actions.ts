"use server";

import type { ActionResponse, SellerProfile } from "@/lib/domain/lead";
import { authRequiredResult } from "@/lib/auth/auth-required";
import { requireAdvisor } from "@/lib/auth/advisor";
import { getEffectiveSellerProfile } from "@/lib/config/seller";
import { savePersistentSettings } from "@/lib/config/persistent-settings";
import { z } from "zod";

const sellerProfileSchema = z.object({
  name: z.string().trim().max(100),
  phone: z.string().trim().max(30),
  email: z.string().trim().max(150),
  company: z.string().trim().max(120),
});

export async function saveSellerProfileOverrideAction(input: SellerProfile): Promise<ActionResponse<SellerProfile>> {
  const parsed = sellerProfileSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Revisa los datos del vendedor e inténtalo nuevamente." };
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return authRequiredResult();

  if (await savePersistentSettings({
    sellerName: parsed.data.name || null,
    sellerPhone: parsed.data.phone || null,
    sellerEmail: parsed.data.email || null,
    sellerCompany: parsed.data.company || null,
  })) {
    return { success: true, data: await getEffectiveSellerProfile() };
  }

  return { success: false, error: "No pudimos guardar estos datos para todos tus dispositivos. Intenta de nuevo y avísame si continúa." };
}
