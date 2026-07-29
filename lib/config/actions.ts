"use server";

import { cookies } from "next/headers";
import type { ActionResponse, SellerProfile } from "@/lib/domain/lead";
import { getEffectiveSellerProfile, getSellerProfile, sellerProfileCookieNames } from "@/lib/config/seller";
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

  if (await savePersistentSettings({
    sellerName: parsed.data.name || null,
    sellerPhone: parsed.data.phone || null,
    sellerEmail: parsed.data.email || null,
    sellerCompany: parsed.data.company || null,
  })) {
    return { success: true, data: await getEffectiveSellerProfile() };
  }

  const cookieStore = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 3650, path: "/" };
  const fields = Object.entries(parsed.data) as Array<[keyof SellerProfile, string]>;
  fields.forEach(([field, value]) => {
    const cookieName = sellerProfileCookieNames[field];
    if (value) cookieStore.set(cookieName, value, options);
    else cookieStore.delete(cookieName);
  });

  return { success: true, data: getSellerProfile(parsed.data), warning: "Supabase no está disponible; se guardó en este navegador." };
}
