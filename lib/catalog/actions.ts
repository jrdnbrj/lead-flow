"use server";

import { z } from "zod";

import { authRequiredResult } from "@/lib/auth/auth-required";
import { requireAdvisor } from "@/lib/auth/advisor";
import { setCatalogModelDefaultColor } from "@/lib/catalog/repository";
import type { ActionResponse } from "@/lib/domain/lead";

const defaultColorSchema = z.object({
  modelId: z.string().trim().min(1).max(100),
  colorId: z.string().trim().min(1).max(100),
});

export async function setCatalogModelDefaultColorAction(input: { modelId: string; colorId: string }): Promise<ActionResponse<{ modelId: string; colorId: string }>> {
  const parsed = defaultColorSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "No pudimos guardar ese color." };
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return authRequiredResult();
  try {
    const saved = await setCatalogModelDefaultColor(parsed.data.modelId, parsed.data.colorId);
    return saved
      ? { success: true, data: parsed.data }
      : { success: false, error: "No pudimos guardar el color predeterminado." };
  } catch (error) {
    console.error("[leadflow][catalog] default color action failed", { modelId: parsed.data.modelId, colorId: parsed.data.colorId, message: error instanceof Error ? error.message : "UNKNOWN_ERROR" });
    return { success: false, error: "No pudimos guardar el color predeterminado." };
  }
}
