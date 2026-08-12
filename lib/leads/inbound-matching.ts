import { formatPhoneForWhatsapp } from "@/lib/domain/lead";

export type InboundLeadCandidate = { id: string; phone: string; createdAt: string; deletedAt: string | null };
export type InboundLeadMatch = { status: "NO_MATCH" } | { status: "MATCH" | "AMBIGUOUS"; leadId: string; candidateIds: string[] };

export function resolveInboundLeadMatch(phone: string, candidates: InboundLeadCandidate[]): InboundLeadMatch {
  const normalized = formatPhoneForWhatsapp(phone);
  const matches = candidates
    .filter((candidate) => !candidate.deletedAt && formatPhoneForWhatsapp(candidate.phone) === normalized)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  if (!matches.length) return { status: "NO_MATCH" };
  const candidateIds = matches.map((candidate) => candidate.id);
  return { status: matches.length > 1 ? "AMBIGUOUS" : "MATCH", leadId: matches[0].id, candidateIds };
}
