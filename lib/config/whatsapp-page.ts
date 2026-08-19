import { getPersistentSettings } from "@/lib/config/persistent-settings";
import { getSellerProfile } from "@/lib/config/seller";
import { getWhatsappMessageTemplate } from "@/lib/config/message-template";
import type { SellerProfile } from "@/lib/domain/lead";

export type WhatsappPageSettings = {
  sellerProfile: SellerProfile;
  messageTemplate: string;
};

export async function getWhatsappPageSettings(): Promise<WhatsappPageSettings> {
  const persistent = await getPersistentSettings();
  if (!persistent.available) {
    return { sellerProfile: getSellerProfile(), messageTemplate: getWhatsappMessageTemplate() };
  }

  const settings = persistent.settings;
  return {
    sellerProfile: getSellerProfile({
      name: settings.sellerName ?? undefined,
      phone: settings.sellerPhone ?? undefined,
      email: settings.sellerEmail ?? undefined,
      company: settings.sellerCompany ?? undefined,
    }),
    messageTemplate: settings.whatsappMessageTemplate?.trim() || getWhatsappMessageTemplate(),
  };
}
