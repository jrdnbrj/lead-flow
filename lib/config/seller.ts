import type { SellerProfile } from "@/lib/domain/lead";

export function getSellerProfile(): SellerProfile {
  return {
    name: process.env.NEXT_PUBLIC_SELLER_NAME || "Tu asesor LeadFlow",
    phone: process.env.NEXT_PUBLIC_SELLER_PHONE || "+57 300 000 0000",
    email: process.env.NEXT_PUBLIC_SELLER_EMAIL || "asesor@leadflow.co",
    company: process.env.NEXT_PUBLIC_SELLER_COMPANY || "LeadFlow Motors",
  };
}
