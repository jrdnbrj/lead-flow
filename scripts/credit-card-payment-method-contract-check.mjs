import assert from "node:assert/strict";
import fs from "node:fs";
import { calculateLeadScore, paymentMethods } from "../lib/domain/lead.ts";
import { leadSchema } from "../lib/leads/validation.ts";

const migration = fs.readFileSync("supabase/migrations/064_credit_card_payment_method.sql", "utf8");
const paymentMethod = paymentMethods.find((option) => option.value === "TARJETA_CREDITO");

assert.deepEqual(paymentMethod, { value: "TARJETA_CREDITO", label: "Tarjeta de crédito" });
assert.equal(leadSchema.safeParse({
  fullName: "Lead de prueba",
  phone: "0999999999",
  carModels: ["CS15"],
  timeframe: "INMEDIATA",
  paymentMethod: "TARJETA_CREDITO",
  tradeInCar: false,
}).success, true);

const base = { carModels: ["CS15"], timeframe: "INMEDIATA", tradeInCar: false };
assert.equal(calculateLeadScore({ ...base, paymentMethod: "TARJETA_CREDITO" }).score, 68);
assert.equal(calculateLeadScore({ ...base, paymentMethod: "CREDITO" }).score, 88);
assert.equal(calculateLeadScore({ ...base, paymentMethod: "CONTADO" }).score, 83);
assert.equal(calculateLeadScore({ ...base, paymentMethod: "LEASING" }).score, 86);
assert.equal(calculateLeadScore({ ...base, paymentMethod: "POR_DEFINIR" }).score, 73);

for (const required of [
  "'TARJETA_CREDITO'",
  "when 'TARJETA_CREDITO' then 0",
  "leads_payment_method_check",
  "payment_method in ('CREDITO', 'TARJETA_CREDITO', 'CONTADO', 'LEASING', 'POR_DEFINIR')",
]) assert.ok(migration.includes(required), `migration missing ${required}`);

console.log("Credit card payment method contract checks: PASS");
