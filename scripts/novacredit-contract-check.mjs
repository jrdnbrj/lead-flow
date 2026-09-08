import assert from "node:assert/strict";
import fs from "node:fs";

import { calculateNovaCreditQuote, getNovaCreditTerms, novaCreditRules, validateNovaCreditQuote } from "../lib/financial/novacredit.ts";

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

const source = fs.readFileSync("lib/financial/novacredit.ts", "utf8");
const calculator = fs.readFileSync("components/quotes/novacredit-calculator.tsx", "utf8");
const workspace = fs.readFileSync("components/quotes/quote-workspace.tsx", "utf8");
const page = fs.readFileSync("app/cotizacion/page.tsx", "utf8");
assert.ok(!/from ["']xlsx["']|require\(["']xlsx["']\)/u.test(source), "NovaCredit runtime must not read Excel");
assert.ok(source.includes("fixedFinancingCharge: 75"), "NovaCredit must retain the approved fixed charge");
for (const required of ["Crédito vehicular", "Dispositivo", "getNovaCreditTerms", "aria-pressed", "Cuota mensual", "referencial"]) assert.ok(calculator.includes(required), `NovaCredit UI missing ${required}`);
for (const required of ["NovaCreditCalculator", "quoteMode", "NOVACREDIT", "¿Qué quieres cotizar?"]) assert.ok(workspace.includes(required), `global quotation integration missing ${required}`);
assert.ok(page.includes("No necesitas un lead para calcular"), "global quotation page must communicate lead-free calculation");

console.log("NovaCredit contract checks: PASS");
