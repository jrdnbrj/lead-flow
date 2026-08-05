"use server";

import type { ActionResponse } from "@/lib/domain/lead";
import { getUnknownWhatsappTemplateVariables } from "@/lib/config/message-template-shared";
import { savePersistentSettings } from "@/lib/config/persistent-settings";

export async function saveWhatsappMessageTemplateAction(template: string): Promise<ActionResponse<{ template: string }>> {
  const cleanTemplate = template.trim();
  if (cleanTemplate.length < 10 || cleanTemplate.length > 1000) return { success: false, error: "El mensaje debe tener entre 10 y 1000 caracteres." };
  const unknownVariables = getUnknownWhatsappTemplateVariables(cleanTemplate);
  if (unknownVariables.length) return { success: false, error: "Variable no reconocida: {{" + unknownVariables[0] + "}}. Revisa la lista de variables disponibles." };

  if (await savePersistentSettings({ whatsappMessageTemplate: cleanTemplate })) {
    return { success: true, data: { template: cleanTemplate } };
  }

  return { success: false, error: "No se puede guardar todavía. Configura SUPABASE_SERVICE_ROLE_KEY en el servidor y reinicia LeadFlow para compartir esta plantilla entre tus dispositivos." };
}
