import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import type { QuoteSnapshot } from "./types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.36, 0.41, 0.49);
const LIME = rgb(0.74, 0.96, 0.26);
const SOFT = rgb(0.96, 0.97, 0.98);

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatFactorPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = INK): void {
  page.drawText(text, { x, y, size, font, color, maxWidth: PAGE_WIDTH - (x + MARGIN) });
}

function drawField(page: PDFPage, label: string, value: string, x: number, y: number, width: number, regular: PDFFont, bold: PDFFont): void {
  page.drawRectangle({ x, y: y - 12, width, height: 46, color: SOFT, borderColor: rgb(0.88, 0.9, 0.93), borderWidth: 0.7 });
  drawText(page, label.toUpperCase(), x + 12, y + 17, bold, 7, MUTED);
  drawText(page, value, x + 12, y - 1, regular, 11, INK);
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeZone: "America/Guayaquil" }).format(new Date(isoDate));
}

function shorten(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trim()}…`;
}

export async function renderCardQuotePdf(snapshot: QuoteSnapshot): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 10, width: PAGE_WIDTH, height: 10, color: LIME });
  drawText(page, "LeadFlow", MARGIN, PAGE_HEIGHT - 76, bold, 24, INK);
  drawText(page, "Cotización", MARGIN, PAGE_HEIGHT - 108, bold, 19, INK);
  drawText(page, "Simulación de financiamiento referencial", MARGIN, PAGE_HEIGHT - 128, regular, 10, MUTED);
  drawText(page, formatDate(snapshot.documentDate), PAGE_WIDTH - 172, PAGE_HEIGHT - 76, regular, 9, MUTED);

  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 151 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 151 }, thickness: 1, color: rgb(0.88, 0.9, 0.93) });
  drawText(page, "Datos de la cotización", MARGIN, PAGE_HEIGHT - 182, bold, 11, INK);
  drawField(page, "Cliente", shorten(snapshot.clientName, 36), MARGIN, PAGE_HEIGHT - 213, 244, regular, bold);
  drawField(page, "Vehículo", shorten(snapshot.modelName, 36), MARGIN + 255, PAGE_HEIGHT - 213, PAGE_WIDTH - MARGIN * 2 - 255, regular, bold);
  drawField(page, "Tipo", "Tarjeta de crédito", MARGIN, PAGE_HEIGHT - 271, 244, regular, bold);
  drawField(page, "Teléfono", shorten(snapshot.clientPhone, 28), MARGIN + 255, PAGE_HEIGHT - 271, PAGE_WIDTH - MARGIN * 2 - 255, regular, bold);

  drawText(page, "Condiciones", MARGIN, PAGE_HEIGHT - 348, bold, 11, INK);
  drawField(page, "Monto", formatCurrency(snapshot.amount), MARGIN, PAGE_HEIGHT - 379, 244, regular, bold);
  drawField(page, "Modalidad", snapshot.modality === "NORMAL" ? "Normal" : "Corporativo", MARGIN + 255, PAGE_HEIGHT - 379, PAGE_WIDTH - MARGIN * 2 - 255, regular, bold);
  drawField(page, "Plazo", `${snapshot.term} meses`, MARGIN, PAGE_HEIGHT - 437, 244, regular, bold);
  drawField(page, "Factor", formatFactorPercentage(snapshot.factor), MARGIN + 255, PAGE_HEIGHT - 437, PAGE_WIDTH - MARGIN * 2 - 255, regular, bold);

  page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - 580, width: PAGE_WIDTH - MARGIN * 2, height: 96, color: LIME, borderColor: LIME, borderWidth: 1 });
  drawText(page, "Cuota mensual estimada", MARGIN + 20, PAGE_HEIGHT - 514, bold, 10, INK);
  drawText(page, formatCurrency(snapshot.installment), MARGIN + 20, PAGE_HEIGHT - 553, bold, 27, INK);

  drawText(page, "Resumen", MARGIN, PAGE_HEIGHT - 626, bold, 11, INK);
  drawField(page, "Interés", formatCurrency(snapshot.interest), MARGIN, PAGE_HEIGHT - 657, 244, regular, bold);
  drawField(page, "Total estimado", formatCurrency(snapshot.total), MARGIN + 255, PAGE_HEIGHT - 657, PAGE_WIDTH - MARGIN * 2 - 255, regular, bold);

  const disclaimer = "Esta cotización es una simulación referencial. No constituye aprobación crediticia ni garantiza las condiciones finales de la entidad financiera.";
  drawText(page, disclaimer, MARGIN, 88, regular, 8.5, MUTED);
  drawText(page, "LeadFlow · Información preparada por tu asesor", MARGIN, 58, bold, 8.5, MUTED);

  return document.save();
}
