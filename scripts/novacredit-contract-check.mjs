import assert from "node:assert/strict";
import fs from "node:fs";

import { calculateNovaCreditQuote, getNovaCreditTerms, novaCreditRules, validateNovaCreditQuote } from "../lib/financial/novacredit.ts";
import { renderNovaCreditPdf } from "../lib/quotes/pdf-renderer.ts";
import { createNovaCreditSnapshot, quoteSnapshotsEquivalent } from "../lib/quotes/snapshot.ts";
import { sendNovaCreditDocumentMock } from "../lib/quotes/mock-provider.ts";

function closeTo(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

const n1 = calculateNovaCreditQuote({ vehicleValue: 23000, accessories: 0, downPayment: 15000, term: 48, device: 575 });
assert.ok(n1);
assert.equal(n1.minimumDownPayment, 5750);
closeTo(n1.legalExpenses, 567.6, 0.000001);
closeTo(n1.vehicleInsurance, 3901.255036, 0.000001);
closeTo(n1.lifeInsurance, 99.008, 0.000001);
closeTo(n1.financedValue, 9241.608, 0.000001);
closeTo(n1.internalLifeCalculationBalance, 9394.4, 0.000001);
assert.equal(n1.monthlyInstallment, 254.86);
closeTo(n1.finalInstallment, 336.1361466, 0.000001);
assert.equal(n1.fixedFinancingChargeApplied, 75);

const n2 = calculateNovaCreditQuote({ vehicleValue: 23000, accessories: 0, downPayment: 5750, term: 48, device: 575 });
assert.ok(n2);
assert.equal(n2.minimumDownPayment, 5750);
closeTo(n2.financedValue, 18491.608, 0.000001);
assert.equal(n2.monthlyInstallment, 509.96);

const n3Validation = validateNovaCreditQuote({ vehicleValue: 23000, accessories: 0, downPayment: 5749, term: 48, device: 575 });
assert.equal(n3Validation.valid, false);
if (!n3Validation.valid) {
  assert.equal(n3Validation.code, "DOWN_PAYMENT_BELOW_MINIMUM");
  assert.equal(n3Validation.message, "Valor inferior a entrada mínima");
}
assert.equal(calculateNovaCreditQuote({ vehicleValue: 23000, accessories: 0, downPayment: 5749, term: 48, device: 575 }), null);

assert.deepEqual(getNovaCreditTerms(), [12, 18, 24, 36, 48]);
for (const term of getNovaCreditTerms()) {
  const quote = calculateNovaCreditQuote({ vehicleValue: 23000, accessories: 0, downPayment: 6000, term, device: novaCreditRules.defaultDevice });
  assert.ok(quote, `supported term ${term} should calculate`);
  assert.equal(quote.term, term);
}

const accessoriesQuote = calculateNovaCreditQuote({ vehicleValue: 23000, accessories: 1200.5, downPayment: 7000, term: 36, device: 731 });
assert.ok(accessoriesQuote);
assert.equal(accessoriesQuote.totalVehicleValue, 24200.5);
assert.equal(accessoriesQuote.device, 731);

assert.equal(validateNovaCreditQuote({ vehicleValue: null, accessories: null, downPayment: null, term: null, device: 731 }).valid, false);
assert.equal(validateNovaCreditQuote({ vehicleValue: 23000, accessories: null, downPayment: 6000, term: 7, device: 731 }).valid, false);
assert.equal(validateNovaCreditQuote({ vehicleValue: 23000, accessories: null, downPayment: 6000, term: 48, device: null }).valid, false);

const validQuote = calculateNovaCreditQuote({ vehicleValue: 23000, accessories: 500, downPayment: 6000, term: 36, device: 731 });
assert.ok(validQuote);
const validSnapshot = createNovaCreditSnapshot({
  leadId: "11111111-1111-4111-8111-111111111111",
  clientName: "Cliente Nova",
  clientPhone: "+593999999999",
  modelId: "v3",
  modelName: "Alsvin V3",
  quote: validQuote,
  documentDate: "2026-09-08T12:00:00.000Z",
});
const novaPdf = await renderNovaCreditPdf(validSnapshot);
assert.ok(novaPdf.length > 1000);
assert.equal(new TextDecoder().decode(novaPdf.slice(0, 5)), "%PDF-");
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const parsedPdf = await pdfjs.getDocument({ data: novaPdf, disableWorker: true, standardFontDataUrl: new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).toString() }).promise;
let pdfText = "";
for (let pageNo = 1; pageNo <= parsedPdf.numPages; pageNo += 1) {
  const page = await parsedPdf.getPage(pageNo);
  const content = await page.getTextContent();
  pdfText += content.items.map((item) => typeof item.str === "string" ? item.str : "").join(" ");
}
const normalizedPdfText = pdfText.toLocaleLowerCase("es-EC");
for (const required of ["cliente nova", "alsvin v3", "crédito vehicular / novacredit", "entrada", "valor financiado", "cuota mensual"]) assert.ok(normalizedPdfText.includes(required), `NovaCredit PDF missing ${required}`);
assert.equal(validSnapshot.quoteType, "NOVACREDIT");
assert.equal(validSnapshot.fixedFinancingChargeApplied, 75);
assert.equal(quoteSnapshotsEquivalent(validSnapshot, { ...validSnapshot, documentDate: "2026-09-09T12:00:00.000Z" }), true);
assert.equal(quoteSnapshotsEquivalent(validSnapshot, { ...validSnapshot, downPayment: validSnapshot.downPayment + 1 }), false);
assert.equal(quoteSnapshotsEquivalent(validSnapshot, { ...validSnapshot, termMonths: 48 }), false);
assert.equal(quoteSnapshotsEquivalent(validSnapshot, { ...validSnapshot, deviceAmount: validSnapshot.deviceAmount + 1 }), false);
assert.equal(quoteSnapshotsEquivalent(validSnapshot, { ...validSnapshot, quoteType: "TARJETA_CREDITO" }), false);
const mockSend = sendNovaCreditDocumentMock({ quoteFileId: "11111111-1111-4111-8111-111111111111", recipientPhone: "+593999999999", documentUrl: "/local/mock-nova.pdf", fileName: "nova.pdf" });
assert.equal(mockSend.status, "MOCK_ACCEPTED");
assert.match(mockSend.providerMessageId, /^local-novacredit-/u);

const source = fs.readFileSync("lib/financial/novacredit.ts", "utf8");
const calculator = fs.readFileSync("components/quotes/novacredit-calculator.tsx", "utf8");
const workspace = fs.readFileSync("components/quotes/quote-workspace.tsx", "utf8");
const page = fs.readFileSync("app/cotizacion/page.tsx", "utf8");
const actions = fs.readFileSync("lib/quotes/actions.ts", "utf8");
const repository = fs.readFileSync("lib/quotes/repository.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/073_allow_novacredit_quote_files.sql", "utf8");
assert.ok(!/from ["']xlsx["']|require\(["']xlsx["']\)/u.test(source), "NovaCredit runtime must not read Excel");
assert.ok(source.includes("fixedFinancingCharge: 75"), "NovaCredit must retain the approved fixed charge");
for (const required of ["Crédito vehicular", "Dispositivo", "getNovaCreditTerms", "aria-pressed", "Cuota mensual", "referencial"]) assert.ok(calculator.includes(required), `NovaCredit UI missing ${required}`);
for (const required of ["NovaCreditCalculator", "quoteMode", "NOVACREDIT", "¿Qué quieres cotizar?"]) assert.ok(workspace.includes(required), `global quotation integration missing ${required}`);
assert.ok(page.includes("No necesitas un lead para calcular"), "global quotation page must communicate lead-free calculation");
for (const required of ["generateNovaCreditQuotePdfAction", "prepareNovaCreditQuoteSendAction", "sendNovaCreditQuoteAction", "createNovaCreditSnapshot", "renderNovaCreditPdf", "sendNovaCreditDocumentMock"]) assert.ok(actions.includes(required), `NovaCredit workflow missing ${required}`);
assert.match(actions, /quote_type !== "NOVACREDIT"|quote_type === "NOVACREDIT"/);
assert.doesNotMatch(actions, /sendWhatsappDocument\([^)]*NOVACREDIT/u);
assert.ok(repository.includes('quoteType: "NOVACREDIT"'), "quote history must map NovaCredit files");
assert.match(migration, /NOVACREDIT/);
assert.match(migration, /quote_files_quote_type_check/);
assert.match(workspace, /Ver PDF que se enviará/);
assert.match(workspace, /pendingNovaSend/);
assert.match(workspace, /quoteMode === "NOVACREDIT"/);

console.log("NovaCredit contract checks: PASS");
