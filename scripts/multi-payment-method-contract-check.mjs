import assert from "node:assert/strict";
import fs from "node:fs";
import { calculateLeadScore, paymentMethods, selectablePaymentMethods } from "../lib/domain/lead.ts";
import { leadSchema } from "../lib/leads/validation.ts";

const migration = fs.readFileSync("supabase/migrations/065_multi_payment_methods.sql", "utf8");
const base = { fullName: "Lead de prueba", phone: "0999999999", carModels: ["CS15"], timeframe: "INMEDIATA", tradeInCar: false };

assert.deepEqual(selectablePaymentMethods.map((option) => option.value), ["CREDITO", "TARJETA_CREDITO", "CONTADO", "POR_DEFINIR"]);
assert.deepEqual(paymentMethods.find((option) => option.value === "LEASING"), { value: "LEASING", label: "Leasing" });
assert.equal(leadSchema.safeParse({ ...base, paymentMethods: ["CREDITO", "CONTADO"] }).success, true);
assert.equal(leadSchema.safeParse({ ...base, paymentMethods: [] }).success, false);
assert.equal(leadSchema.safeParse({ ...base, paymentMethods: ["CREDITO", "CREDITO"] }).success, false);
assert.equal(leadSchema.safeParse({ ...base, paymentMethods: ["LEASING"] }).success, true);

assert.equal(calculateLeadScore({ ...base, paymentMethods: ["CREDITO", "CONTADO"] }).score, 88);
assert.equal(calculateLeadScore({ ...base, paymentMethods: ["CONTADO", "POR_DEFINIR"] }).score, 83);

for (const required of [
  "payment_methods text[]",
  "set payment_methods = array[payment_method]",
  "leads_payment_methods_check",
  "payment_methods cannot contain duplicates",
  "payment_methods, trade_in_car",
  "new.payment_method := new.payment_methods[1]",
  "TARJETA_CREDITO' then 0",
  "LEASING",
]) assert.ok(migration.includes(required), `migration missing ${required}`);

console.log("Multi-payment method contract checks: PASS");
