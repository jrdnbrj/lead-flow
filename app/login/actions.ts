"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  if (!email || !password) redirect(`/login?error=missing&next=${encodeURIComponent(next)}`);

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(`/login?error=config&next=${encodeURIComponent(next)}`);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=auth&next=${encodeURIComponent(next)}`);

  redirect(next);
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect("/login");
}
