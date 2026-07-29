import { cookies } from "next/headers";

import { DEFAULT_WHATSAPP_MESSAGE_TEMPLATE, WHATSAPP_MESSAGE_TEMPLATE_COOKIE } from "@/lib/config/message-template-shared";
import { getPersistentSettings } from "@/lib/config/persistent-settings";

export { DEFAULT_WHATSAPP_MESSAGE_TEMPLATE, WHATSAPP_MESSAGE_TEMPLATE_COOKIE, WHATSAPP_TEMPLATE_VARIABLES, getUnknownWhatsappTemplateVariables, renderWhatsappMessageTemplate } from "@/lib/config/message-template-shared";

export function getWhatsappMessageTemplate(): string {
  return process.env.NEXT_PUBLIC_WHATSAPP_MESSAGE_TEMPLATE?.trim() || DEFAULT_WHATSAPP_MESSAGE_TEMPLATE;
}

export async function getEffectiveWhatsappMessageTemplate(): Promise<string> {
  const persistent = await getPersistentSettings();
  if (persistent.available) return persistent.settings.whatsappMessageTemplate?.trim() || getWhatsappMessageTemplate();

  const cookieStore = await cookies();
  return cookieStore.get(WHATSAPP_MESSAGE_TEMPLATE_COOKIE)?.value || getWhatsappMessageTemplate();
}
