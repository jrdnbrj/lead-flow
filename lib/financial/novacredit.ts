export const novaCreditTerms = [12, 18, 24, 36, 48] as const;

export type NovaCreditTerm = (typeof novaCreditTerms)[number];

export type NovaCreditRules = {
  rulesVersion: string;
  defaultDevice: number;
  fixedFinancingCharge: number;
  minimumDownPaymentRate: number;
  minimumDownPaymentIncrement: number;
  creditAnnualRate: number;
  legalExpenses: {
    fiduciary: number;
    notary: number;
    registration: number;
  };
  vehicleInsurance: {
    annualRate: number;
    depreciationByYear: readonly number[];
    superintendenceRate: number;
    emissionPerYear: number;
    campesinoRate: number;
    vatRate: number;
  };
  lifeInsurance: {
    rate: number;
    averageBase: number;
    referencePremiumByTerm: Record<NovaCreditTerm, number>;
    superintendenceRate: number;
    campesinoRate: number;
  };
};

/**
 * Versioned translation of the approved NovaCredit workbook rules.
 * Workbook source: SIMULADOR NOVACREDIT.xlsx (Downloads copy, 2026-09-08).
 *
 * LeadFlow has no approved birth-date/age source. Life insurance therefore
 * uses the deterministic reference premiums captured from the workbook rather
 * than inventing an age or exposing actuarial inputs in the advisor UI.
 */
export const novaCreditRules: NovaCreditRules = {
  rulesVersion: "novacredit-v1-2026-09-08",
  defaultDevice: 731,
  fixedFinancingCharge: 75,
  minimumDownPaymentRate: 0.25,
  minimumDownPaymentIncrement: 10,
  creditAnnualRate: 0.145,
  legalExpenses: {
    fiduciary: 198.6,
    notary: 68.8,
    registration: 300.2,
  },
  vehicleInsurance: {
    annualRate: 0.043,
    depreciationByYear: [1, 0.88, 0.792, 0.7128, 0.64152],
    superintendenceRate: 0.035,
    emissionPerYear: 0.45,
    campesinoRate: 0.005,
    vatRate: 0.12,
  },
  lifeInsurance: {
    rate: 0.0034,
    averageBase: 13000,
    referencePremiumByTerm: {
      12: 24.752,
      18: 37.128,
      24: 49.504,
      36: 74.256,
      48: 99.008,
    },
    superintendenceRate: 0.035,
    campesinoRate: 0.005,
  },
};

export type NovaCreditDraft = {
  vehicleValue: number | null;
  accessories: number | null;
  downPayment: number | null;
  term: number | null;
  device: number | null;
};

export type NovaCreditInput = {
  vehicleValue: number;
  accessories: number;
  downPayment: number;
  term: NovaCreditTerm;
  device: number;
};

export type NovaCreditQuote = NovaCreditInput & {
  rulesVersion: string;
  totalVehicleValue: number;
  minimumDownPayment: number;
  downPaymentPercentage: number;
  legalExpenses: number;
  vehicleInsurance: number;
  lifeInsurance: number;
  financedWithoutLifeInsurance: number;
  internalLifeCalculationBalance: number;
  financedValue: number;
  monthlyInstallment: number;
  finalInstallment: number;
  fixedFinancingChargeApplied: number;
};

export type NovaCreditValidationError =
  | "VEHICLE_VALUE_REQUIRED"
  | "VEHICLE_VALUE_INVALID"
  | "ACCESSORIES_INVALID"
  | "DOWN_PAYMENT_REQUIRED"
  | "DOWN_PAYMENT_INVALID"
  | "DOWN_PAYMENT_BELOW_MINIMUM"
  | "DOWN_PAYMENT_EXCEEDS_TOTAL"
  | "TERM_REQUIRED"
  | "UNSUPPORTED_TERM"
  | "DEVICE_REQUIRED"
  | "DEVICE_INVALID";

export type NovaCreditValidation =
  | { valid: true; input: NovaCreditInput; minimumDownPayment: number }
  | { valid: false; code: NovaCreditValidationError; message: string };

const MAX_SAFE_AMOUNT_CENTS = Number.MAX_SAFE_INTEGER - 100;

export function getNovaCreditTerms(): NovaCreditTerm[] {
  return [...novaCreditTerms];
}

export function isNovaCreditTerm(value: number): value is NovaCreditTerm {
  return novaCreditTerms.includes(value as NovaCreditTerm);
}

export function validateNovaCreditQuote(input: NovaCreditDraft, rules: NovaCreditRules = novaCreditRules): NovaCreditValidation {
  if (input.vehicleValue === null) return { valid: false, code: "VEHICLE_VALUE_REQUIRED", message: "Ingresa el valor del vehículo." };
  if (!isSafeMoney(input.vehicleValue) || input.vehicleValue <= 0) return { valid: false, code: "VEHICLE_VALUE_INVALID", message: "Ingresa un valor del vehículo en dólares mayor que cero, con hasta 2 decimales." };

  const accessories = input.accessories ?? 0;
  if (!isSafeMoney(accessories) || accessories < 0) return { valid: false, code: "ACCESSORIES_INVALID", message: "Los accesorios u otros deben ser cero o un valor positivo." };

  if (input.downPayment === null) return { valid: false, code: "DOWN_PAYMENT_REQUIRED", message: "Ingresa la entrada." };
  if (!isSafeMoney(input.downPayment) || input.downPayment < 0) return { valid: false, code: "DOWN_PAYMENT_INVALID", message: "Ingresa una entrada válida en dólares, con hasta 2 decimales." };

  if (input.term === null) return { valid: false, code: "TERM_REQUIRED", message: "Selecciona un plazo." };
  if (!isNovaCreditTerm(input.term)) return { valid: false, code: "UNSUPPORTED_TERM", message: "Este plazo no está disponible para NovaCredit." };

  const device = input.device;
  if (device === null) return { valid: false, code: "DEVICE_REQUIRED", message: "Ingresa el valor del dispositivo." };
  if (!isSafeMoney(device) || device < 0) return { valid: false, code: "DEVICE_INVALID", message: "Ingresa un valor válido para el dispositivo." };

  const totalVehicleValue = input.vehicleValue + accessories;
  const minimumDownPayment = ceilTo(totalVehicleValue * rules.minimumDownPaymentRate, rules.minimumDownPaymentIncrement);
  if (input.downPayment < minimumDownPayment) return { valid: false, code: "DOWN_PAYMENT_BELOW_MINIMUM", message: "Valor inferior a entrada mínima" };
  if (input.downPayment > totalVehicleValue) return { valid: false, code: "DOWN_PAYMENT_EXCEEDS_TOTAL", message: "La entrada no puede superar el valor total del vehículo." };

  return {
    valid: true,
    input: { vehicleValue: input.vehicleValue, accessories, downPayment: input.downPayment, term: input.term, device },
    minimumDownPayment,
  };
}

export function calculateNovaCreditQuote(input: NovaCreditDraft, rules: NovaCreditRules = novaCreditRules): NovaCreditQuote | null {
  const validation = validateNovaCreditQuote(input, rules);
  if (!validation.valid) return null;

  const { vehicleValue, accessories, downPayment, term, device } = validation.input;
  const totalVehicleValue = vehicleValue + accessories;
  const legalExpenses = rules.legalExpenses.fiduciary + rules.legalExpenses.notary + rules.legalExpenses.registration;
  const dealerFinancedValue = totalVehicleValue - downPayment;
  const financedWithoutLifeInsurance = dealerFinancedValue + device + legalExpenses;
  const internalLifeCalculationBalance = financedWithoutLifeInsurance + (rules.lifeInsurance.averageBase * rules.lifeInsurance.rate * term / 12) + rules.fixedFinancingCharge;
  const lifeInsurance = rules.lifeInsurance.referencePremiumByTerm[term];
  const financedValue = financedWithoutLifeInsurance + lifeInsurance;
  const monthlyInstallment = roundToCents(calculatePayment(rules.creditAnnualRate / 12, term, financedValue));
  const vehicleInsurance = calculateVehicleInsurance(totalVehicleValue, term, rules.vehicleInsurance);

  return {
    ...validation.input,
    rulesVersion: rules.rulesVersion,
    totalVehicleValue,
    minimumDownPayment: validation.minimumDownPayment,
    downPaymentPercentage: downPayment / totalVehicleValue,
    legalExpenses,
    vehicleInsurance,
    lifeInsurance,
    financedWithoutLifeInsurance,
    internalLifeCalculationBalance,
    financedValue,
    monthlyInstallment,
    finalInstallment: monthlyInstallment + vehicleInsurance / term,
    fixedFinancingChargeApplied: rules.fixedFinancingCharge,
  };
}

function calculateVehicleInsurance(totalVehicleValue: number, term: NovaCreditTerm, rules: NovaCreditRules["vehicleInsurance"]): number {
  const coverageYears = Math.max(1, Math.ceil(term / 12));
  const netPremium = Array.from({ length: coverageYears }, (_, index) => {
    const depreciation = rules.depreciationByYear[index] ?? rules.depreciationByYear[rules.depreciationByYear.length - 1];
    return totalVehicleValue * rules.annualRate * depreciation;
  }).reduce((sum, value) => sum + value, 0);
  const superintendence = roundToCents(netPremium * rules.superintendenceRate);
  const emission = coverageYears * rules.emissionPerYear;
  const campesino = netPremium * rules.campesinoRate;
  const vat = roundToCents((netPremium + superintendence + emission + campesino) * rules.vatRate);
  return netPremium + superintendence + emission + campesino + vat;
}

function calculatePayment(monthlyRate: number, term: number, principal: number): number {
  if (monthlyRate === 0) return principal / term;
  return (principal * monthlyRate) / (1 - (1 + monthlyRate) ** -term);
}

function ceilTo(value: number, increment: number): number {
  return Math.ceil((value - Number.EPSILON) / increment) * increment;
}

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isSafeMoney(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && cents <= MAX_SAFE_AMOUNT_CENTS;
}
