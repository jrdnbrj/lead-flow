import assert from "node:assert/strict";
import fs from "node:fs";
import { calculateCardQuote, cardFactorTable, cardModalities, getCardFactor, getCardTerms, validateCardQuote } from "../lib/financial/card-quote.ts";

const d1 = calculateCardQuote({ modality: "NORMAL", term: 60, amount: 3000 });
assert.ok(d1);
assert.equal(d1.factor, 0.4610);
assert.equal(d1.interest, 1383);
assert.equal(d1.total, 4383);
assert.equal(d1.installment.toFixed(2), "73.05");

const d2 = calculateCardQuote({ modality: "NORMAL", term: 3, amount: 1000 });
assert.ok(d2);
assert.equal(d2.factor, 0.0268);
assert.equal(d2.interest, 26.8);
assert.equal(d2.total, 1026.8);
assert.equal(d2.installment.toFixed(2), "342.27");

const d3 = calculateCardQuote({ modality: "CORPORATIVO", term: 36, amount: 5000 });
assert.ok(d3);
assert.equal(d3.factor, 0.1825);
assert.equal(d3.interest, 912.5);
assert.equal(d3.total, 5912.5);
assert.equal(d3.installment.toFixed(2), "164.24");

const d4 = validateCardQuote({ modality: "CORPORATIVO", term: 48, amount: 1000 });
assert.equal(d4.valid, false);
if (!d4.valid) assert.equal(d4.code, "UNSUPPORTED_TERM");
assert.equal(getCardFactor("CORPORATIVO", 48), null);

assert.deepEqual(getCardTerms("NORMAL"), [3, 6, 9, 12, 15, 18, 24, 36, 48, 60]);
assert.deepEqual(getCardTerms("CORPORATIVO"), [3, 6, 9, 12, 15, 18, 24, 36]);
assert.equal(validateCardQuote({ modality: "NORMAL", term: 3, amount: null }).valid, false);
assert.equal(validateCardQuote({ modality: "NORMAL", term: 3, amount: 0 }).valid, false);
assert.equal(validateCardQuote({ modality: "NORMAL", term: 3, amount: -1 }).valid, false);
assert.equal(validateCardQuote({ modality: "NORMAL", term: 7, amount: 1000 }).valid, false);
assert.equal(validateCardQuote({ modality: "INVALID", term: 3, amount: 1000 }).valid, false);
assert.notEqual(d2?.installment, 342.27);
assert.equal(cardFactorTable.NORMAL[48], 0.3618);
assert.deepEqual(cardModalities.map((option) => option.value), ["NORMAL", "CORPORATIVO"]);
assert.equal(calculateCardQuote({ modality: "NORMAL", term: 48, amount: 2000 })?.factor, 0.3618);
assert.equal(calculateCardQuote({ modality: "CORPORATIVO", term: 36, amount: 2000 })?.factor, 0.1825);
assert.equal(calculateCardQuote({ modality: "NORMAL", term: 3, amount: 2000 })?.amount, 2000);

const dashboard = fs.readFileSync("components/dashboard/dashboard-client.tsx", "utf8");
const tool = fs.readFileSync("components/leads/card-quote-tool.tsx", "utf8");
for (const required of ["lead.paymentMethods.includes(\"TARJETA_CREDITO\")", "CardQuoteTool"]) assert.ok(dashboard.includes(required), `dashboard missing ${required}`);
for (const required of ["Cotizador de tarjeta", "Cuota mensual", "informativa", "aria-pressed"]) assert.ok(tool.includes(required), `card quote UI missing ${required}`);

console.log("Card quote contract checks: PASS");
