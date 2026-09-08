import assert from "node:assert/strict";
import fs from "node:fs";

import { calculateCardQuote } from "../lib/financial/card-quote.ts";
import { renderCardQuotePdf } from "../lib/quotes/pdf-renderer.ts";
import { createCardQuoteSnapshot, quoteSnapshotsEquivalent } from "../lib/quotes/snapshot.ts";

const baseQuote = calculateCardQuote({ modality: "NORMAL", term: 60, amount: 3000 });
assert.ok(baseQuote);
const baseSnapshot = createCardQuoteSnapshot({
  leadId: "11111111-1111-4111-8111-111111111111",
  clientName: "Cliente de prueba",
  clientPhone: "+593999999999",
  modelId: "v3",
  modelName: "Alsvin V3",
  quote: baseQuote,
  documentDate: "2026-09-03T12:00:00.000Z",
});

assert.equal(baseSnapshot.factor, 0.461);
assert.equal(baseSnapshot.interest, 1383);
assert.equal(baseSnapshot.total, 4383);
assert.equal(Number(baseSnapshot.installment.toFixed(2)), 73.05);
assert.equal(quoteSnapshotsEquivalent(baseSnapshot, { ...baseSnapshot, documentDate: "2026-09-04T12:00:00.000Z" }), true, "document date is audit metadata, not a form input");

const changedAmount = calculateCardQuote({ modality: "NORMAL", term: 60, amount: 4000 });
assert.ok(changedAmount);
assert.equal(quoteSnapshotsEquivalent(baseSnapshot, createCardQuoteSnapshot({ ...baseSnapshot, quote: changedAmount })), false);

const changedModel = createCardQuoteSnapshot({ ...baseSnapshot, modelId: "cs75", modelName: "CS75 Plus", quote: baseQuote });
assert.equal(quoteSnapshotsEquivalent(baseSnapshot, changedModel), false);
const changedLead = createCardQuoteSnapshot({ ...baseSnapshot, leadId: "22222222-2222-4222-8222-222222222222", quote: baseQuote });
assert.equal(quoteSnapshotsEquivalent(baseSnapshot, changedLead), false);
assert.equal(quoteSnapshotsEquivalent(baseSnapshot, baseSnapshot), true);

const pdf = await renderCardQuotePdf(baseSnapshot);
assert.ok(pdf.length > 1000);
assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");

const migration = fs.readFileSync("supabase/migrations/068_quote_files.sql", "utf8");
assert.match(migration, /create table if not exists public\.quote_files/);
assert.match(migration, /enable row level security/);
assert.match(migration, /storage\.buckets/);
assert.match(migration, /values \('quotations', 'quotations', false/);
assert.match(migration, /quotations_select_own/);
assert.doesNotMatch(migration, /quote_file_sends/);

const action = fs.readFileSync("lib/quotes/actions.ts", "utf8");
const route = fs.readFileSync("app/api/quotes/files/[id]/route.ts", "utf8");
const workspace = fs.readFileSync("components/quotes/quote-workspace.tsx", "utf8");
assert.match(action, /requireAdvisor/);
assert.match(action, /getOwnedLeadForQuote/);
assert.match(action, /calculateCardQuote/);
assert.match(action, /uploadQuotePdf/);
assert.match(fs.readFileSync("lib/quotes/pdf.ts", "utf8"), /server-only/);
assert.match(route, /requireAdvisor/);
assert.match(route, /getQuoteFileForAdvisor/);
assert.match(route, /downloadQuotePdf/);
assert.match(workspace, /Buscar por nombre o número/);
assert.match(workspace, /Selecciona un modelo/);
assert.match(workspace, /catalogModels\.map/);
assert.match(workspace, /Generar PDF/);
assert.match(workspace, /Cotizaciones anteriores/);
assert.doesNotMatch(workspace, /sendWhatsapp/);
assert.match(action, /downloadVehiclePhoto/);
assert.match(action, /getEffectiveSellerProfile/);
assert.match(fs.readFileSync("lib/quotes/pdf-renderer.ts", "utf8"), /embedVehiclePhoto/);

console.log("Quote files contract checks: PASS");
