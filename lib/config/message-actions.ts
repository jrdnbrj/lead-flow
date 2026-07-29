"use server";

import { cookies } from "next/headers";

import type { ActionResponse } from "@/lib/domain/lead";
import { getEffectiveWhatsappMessageTemplate } from "@/lib/config/message-template";
import { getUnknownWhatsappTemplateVariables, WHATSAPP_MESSAGE_TEMPLATE_COOKIE } from "@/lib/config/message-template-shared";
import { savePersistentSettings } from "@/lib/config/persistent-settings";

export async function saveWhatsappMessageTemplateAction(template: string): Promise<ActionResponse<{ template: string }>> {
  const cleanTemplate = template.trim();
  if (cleanTemplate.length < 10 || cleanTemplate.length > 1000) return { success: false, error: "El mensaje debe tener entre 10 y 1000 caracteres." };
  const unknownVariables = getUnknownWhatsappTemplateVariables(cleanTemplate);
  if (unknownVariables.length) return { success: false, error: "Variable no reconocida: {{" + unknownVariables[0] + "}}. Revisa la lista de variables disponibles." };

  if (await savePersistentSettings({ whatsappMessageTemplate: cleanTemplate })) {
    return { success: true, data: { template: cleanTemplate } };
  }

  const cookieStore = await cookies();
  cookieStore.set(WHATSAPP_MESSAGE_TEMPLATE_COOKIE, cleanTemplate, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 3650,
    path: "/",
  });
  return { success: true, data: { template: await getEffectiveWhatsappMessageTemplate() }, warning: "Supabase no está disponible; se guardó en este navegador." };
}
