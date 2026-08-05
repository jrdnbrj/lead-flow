import type { SellerProfile } from "@/lib/domain/lead";
import { getPersistentSettings, type PersistentSettings } from "@/lib/config/persistent-settings";

export const sellerProfileCookieNames = {
  name: "leadflow_seller_name",
  phone: "leadflow_seller_phone",
  email: "leadflow_seller_email",
  company: "leadflow_seller_company",
} as const;

export function getSellerProfile(overrides: Partial<SellerProfile> = {}): SellerProfile {
  return {
    name: overrides.name?.trim() || process.env.NEXT_PUBLIC_SELLER_NAME || "Tu asesor LeadFlow",
    phone: overrides.phone?.trim() || process.env.NEXT_PUBLIC_SELLER_PHONE || "+593 99 000 0000",
    email: overrides.email?.trim() || process.env.NEXT_PUBLIC_SELLER_EMAIL || "asesor@leadflow.co",
    company: overrides.company?.trim() || process.env.NEXT_PUBLIC_SELLER_COMPANY || "LeadFlow Motors",
  };
}

export async function getEffectiveSellerProfile(): Promise<SellerProfile> {
  const persistent = await getPersistentSettings();
  if (persistent.available) return getSellerProfileFromPersistentSettings(persistent.settings);
  return getSellerProfile();
}

function getSellerProfileFromPersistentSettings(settings: PersistentSettings): SellerProfile {
  return getSellerProfile({
    name: settings.sellerName ?? undefined,
    phone: settings.sellerPhone ?? undefined,
    email: settings.sellerEmail ?? undefined,
    company: settings.sellerCompany ?? undefined,
  });
}
