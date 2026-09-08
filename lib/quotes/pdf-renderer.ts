import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

import type { CardQuoteSnapshot, NovaCreditQuoteSnapshot } from "./types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const PAPER = rgb(0.985, 0.98, 0.96);
const INK = rgb(0.10, 0.13, 0.19);
const MUTED = rgb(0.39, 0.42, 0.47);
const LINE = rgb(0.86, 0.84, 0.80);
const PANEL = rgb(0.95, 0.93, 0.89);
const ACCENT = rgb(0.73, 0.56, 0.31);
const WHITE = rgb(1, 1, 1);

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatFactorPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeZone: "America/Guayaquil" }).format(new Date(isoDate));
}

function shorten(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trim()}…`;
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = INK, maxWidth = PAGE_WIDTH - x - MARGIN): void {
  page.drawText(text, { x, y, size, font, color, maxWidth });
}

function drawLabelValue(page: PDFPage, label: string, value: string, x: number, y: number, width: number, regular: PDFFont, bold: PDFFont): void {
  drawText(page, label.toUpperCase(), x, y, bold, 7, MUTED, width);
  drawText(page, value, x, y - 16, regular, 11, INK, width);
}

function drawFitImage(page: PDFPage, image: PDFImage, x: number, y: number, width: number, height: number): void {
  const scale = Math.min(width / image.width, height / image.height);
  const imageWidth = image.width * scale;
  const imageHeight = image.height * scale;
  page.drawImage(image, { x: x + (width - imageWidth) / 2, y: y + (height - imageHeight) / 2, width: imageWidth, height: imageHeight });
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function embedVehiclePhoto(document: PDFDocument, bytes: Uint8Array | null, mimeType: string | null): Promise<PDFImage | null> {
  if (!bytes || bytes.length === 0) return null;
  if (mimeType === "image/png" || isPng(bytes)) return document.embedPng(bytes);
  if (mimeType === "image/jpeg" || isJpeg(bytes)) return document.embedJpg(bytes);
  return null;
}

export async function renderCardQuotePdf(snapshot: CardQuoteSnapshot, photoBytes: Uint8Array | null = null, photoMimeType: string | null = null): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const photo = await embedVehiclePhoto(document, photoBytes, photoMimeType);

  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PAPER });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: ACCENT });

  drawText(page, shorten(snapshot.sellerCompany || "Cotización", 42), MARGIN, PAGE_HEIGHT - 52, bold, 10, MUTED, 300);
  drawText(page, "Cotización", MARGIN, PAGE_HEIGHT - 91, bold, 30, INK, 300);
  drawText(page, "Simulación de financiamiento referencial", MARGIN, PAGE_HEIGHT - 111, regular, 10, MUTED, 300);
  drawText(page, formatDate(snapshot.documentDate), PAGE_WIDTH - 180, PAGE_HEIGHT - 52, regular, 8.5, MUTED, 138);

  const photoX = MARGIN;
  const photoY = PAGE_HEIGHT - 345;
  const photoWidth = PAGE_WIDTH - MARGIN * 2;
  const photoHeight = 190;
  page.drawRectangle({ x: photoX, y: photoY, width: photoWidth, height: photoHeight, color: PANEL, borderColor: LINE, borderWidth: 0.8 });
  if (photo) drawFitImage(page, photo, photoX + 4, photoY + 4, photoWidth - 8, photoHeight - 8);
  else {
    drawText(page, "Imagen del vehículo no disponible", photoX + 18, photoY + photoHeight / 2, regular, 11, MUTED, photoWidth - 36);
  }

  page.drawRectangle({ x: photoX + 14, y: photoY + 14, width: 180, height: 30, color: INK });
  drawText(page, shorten(snapshot.modelName, 27), photoX + 25, photoY + 25, bold, 10, WHITE, 158);

  drawText(page, "Preparada para", MARGIN, PAGE_HEIGHT - 379, bold, 8, MUTED);
  drawText(page, shorten(snapshot.clientName, 42), MARGIN, PAGE_HEIGHT - 399, bold, 15, INK, 300);
  drawText(page, snapshot.clientPhone, PAGE_WIDTH - 180, PAGE_HEIGHT - 399, regular, 9, MUTED, 138);
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 417 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 417 }, thickness: 0.8, color: LINE });

  drawText(page, "Detalle de la propuesta", MARGIN, PAGE_HEIGHT - 447, bold, 11, INK);
  drawLabelValue(page, "Modalidad", snapshot.modality === "NORMAL" ? "Normal" : "Corporativo", MARGIN, PAGE_HEIGHT - 474, 120, regular, bold);
  drawLabelValue(page, "Plazo", `${snapshot.term} meses`, MARGIN + 145, PAGE_HEIGHT - 474, 120, regular, bold);
  drawLabelValue(page, "Monto", formatCurrency(snapshot.amount), MARGIN + 290, PAGE_HEIGHT - 474, 140, regular, bold);

  const resultX = MARGIN;
  const resultY = PAGE_HEIGHT - 630;
  const resultWidth = PAGE_WIDTH - MARGIN * 2;
  const resultHeight = 104;
  page.drawRectangle({ x: resultX, y: resultY, width: resultWidth, height: resultHeight, color: INK });
  drawText(page, "CUOTA MENSUAL ESTIMADA", resultX + 20, resultY + resultHeight - 25, bold, 8, rgb(0.78, 0.79, 0.81), 220);
  drawText(page, formatCurrency(snapshot.installment), resultX + 20, resultY + 31, bold, 28, WHITE, 250);
  drawText(page, "Interés", resultX + 315, resultY + 63, regular, 8, rgb(0.78, 0.79, 0.81), 150);
  drawText(page, formatCurrency(snapshot.interest), resultX + 315, resultY + 46, bold, 11, WHITE, 150);
  drawText(page, "Total", resultX + 315, resultY + 23, regular, 8, rgb(0.78, 0.79, 0.81), 150);
  drawText(page, formatCurrency(snapshot.total), resultX + 315, resultY + 6, bold, 11, WHITE, 150);

  drawText(page, `Factor aplicado: ${formatFactorPercentage(snapshot.factor)}`, MARGIN, 145, regular, 8.5, MUTED, 220);
  const disclaimer = "Esta cotización es referencial y no constituye aprobación crediticia. Las condiciones finales dependen de la evaluación de la entidad financiera.";
  drawText(page, disclaimer, MARGIN, 121, regular, 8, MUTED, PAGE_WIDTH - MARGIN * 2);
  page.drawLine({ start: { x: MARGIN, y: 94 }, end: { x: PAGE_WIDTH - MARGIN, y: 94 }, thickness: 0.8, color: LINE });
  drawText(page, shorten(snapshot.sellerName || "Tu asesor", 36), MARGIN, 72, bold, 9.5, INK, 220);
  drawText(page, [snapshot.sellerPhone, snapshot.sellerEmail].filter(Boolean).join("  ·  "), MARGIN, 56, regular, 8, MUTED, 300);
  drawText(page, shorten(snapshot.sellerCompany || "", 38), PAGE_WIDTH - 190, 72, bold, 8.5, MUTED, 148);

  return document.save();
}

export async function renderNovaCreditPdf(snapshot: NovaCreditQuoteSnapshot, photoBytes: Uint8Array | null = null, photoMimeType: string | null = null): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const photo = await embedVehiclePhoto(document, photoBytes, photoMimeType);

  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PAPER });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: ACCENT });

  drawText(page, shorten(snapshot.sellerCompany || "Cotización", 42), MARGIN, PAGE_HEIGHT - 52, bold, 10, MUTED, 300);
  drawText(page, "Cotización", MARGIN, PAGE_HEIGHT - 91, bold, 30, INK, 300);
  drawText(page, "Simulación de financiamiento referencial", MARGIN, PAGE_HEIGHT - 111, regular, 10, MUTED, 300);
  drawText(page, "Crédito vehicular / NovaCredit", MARGIN, PAGE_HEIGHT - 130, bold, 9, ACCENT, 300);
  drawText(page, formatDate(snapshot.documentDate), PAGE_WIDTH - 180, PAGE_HEIGHT - 52, regular, 8.5, MUTED, 138);

  const photoX = MARGIN;
  const photoY = PAGE_HEIGHT - 345;
  const photoWidth = PAGE_WIDTH - MARGIN * 2;
  const photoHeight = 180;
  page.drawRectangle({ x: photoX, y: photoY, width: photoWidth, height: photoHeight, color: PANEL, borderColor: LINE, borderWidth: 0.8 });
  if (photo) drawFitImage(page, photo, photoX + 4, photoY + 4, photoWidth - 8, photoHeight - 8);
  else drawText(page, "Imagen del vehículo no disponible", photoX + 18, photoY + photoHeight / 2, regular, 11, MUTED, photoWidth - 36);

  page.drawRectangle({ x: photoX + 14, y: photoY + 14, width: 210, height: 30, color: INK });
  drawText(page, shorten(snapshot.modelName, 31), photoX + 25, photoY + 25, bold, 10, WHITE, 188);

  drawText(page, "Preparada para", MARGIN, PAGE_HEIGHT - 374, bold, 8, MUTED);
  drawText(page, shorten(snapshot.clientName, 42), MARGIN, PAGE_HEIGHT - 394, bold, 15, INK, 300);
  drawText(page, snapshot.clientPhone, PAGE_WIDTH - 180, PAGE_HEIGHT - 394, regular, 9, MUTED, 138);
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 412 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 412 }, thickness: 0.8, color: LINE });

  drawText(page, "Detalle de la propuesta", MARGIN, PAGE_HEIGHT - 441, bold, 11, INK);
  drawLabelValue(page, "Valor del vehículo", formatCurrency(snapshot.vehicleAmount), MARGIN, PAGE_HEIGHT - 465, 145, regular, bold);
  drawLabelValue(page, "Entrada", `${formatCurrency(snapshot.downPayment)} · ${formatFactorPercentage(snapshot.downPaymentPercentage)}`, MARGIN + 165, PAGE_HEIGHT - 465, 175, regular, bold);
  drawLabelValue(page, "Plazo", `${snapshot.termMonths} meses`, MARGIN + 360, PAGE_HEIGHT - 465, 145, regular, bold);

  drawLabelValue(page, "Accesorios", formatCurrency(snapshot.accessories), MARGIN, PAGE_HEIGHT - 519, 145, regular, bold);
  drawLabelValue(page, "Dispositivo", formatCurrency(snapshot.deviceAmount), MARGIN + 165, PAGE_HEIGHT - 519, 175, regular, bold);
  drawLabelValue(page, "Valor financiado", formatCurrency(snapshot.financedValue), MARGIN + 360, PAGE_HEIGHT - 519, 145, regular, bold);

  const resultX = MARGIN;
  const resultY = 164;
  const resultWidth = PAGE_WIDTH - MARGIN * 2;
  const resultHeight = 104;
  page.drawRectangle({ x: resultX, y: resultY, width: resultWidth, height: resultHeight, color: INK });
  drawText(page, "CUOTA MENSUAL REFERENCIAL", resultX + 20, resultY + resultHeight - 25, bold, 8, rgb(0.78, 0.79, 0.81), 220);
  drawText(page, formatCurrency(snapshot.monthlyInstallment), resultX + 20, resultY + 31, bold, 28, WHITE, 250);
  drawText(page, "Cuota final", resultX + 315, resultY + 63, regular, 8, rgb(0.78, 0.79, 0.81), 150);
  drawText(page, formatCurrency(snapshot.finalInstallment), resultX + 315, resultY + 46, bold, 11, WHITE, 150);
  drawText(page, "Gastos y seguros", resultX + 315, resultY + 23, regular, 8, rgb(0.78, 0.79, 0.81), 150);
  drawText(page, formatCurrency(snapshot.legalExpenses + snapshot.vehicleInsurance + snapshot.lifeInsurance), resultX + 315, resultY + 6, bold, 11, WHITE, 150);

  drawText(page, `Gastos legales ${formatCurrency(snapshot.legalExpenses)}  ·  Seguro vehicular ${formatCurrency(snapshot.vehicleInsurance)}  ·  Seguro de vida ${formatCurrency(snapshot.lifeInsurance)}`, MARGIN, 142, regular, 7.5, MUTED, PAGE_WIDTH - MARGIN * 2);
  const disclaimer = "Esta cotización es referencial y no constituye aprobación crediticia. Las condiciones finales dependen de la evaluación del financiador.";
  drawText(page, disclaimer, MARGIN, 119, regular, 8, MUTED, PAGE_WIDTH - MARGIN * 2);
  page.drawLine({ start: { x: MARGIN, y: 94 }, end: { x: PAGE_WIDTH - MARGIN, y: 94 }, thickness: 0.8, color: LINE });
  drawText(page, shorten(snapshot.sellerName || "Tu asesor", 36), MARGIN, 72, bold, 9.5, INK, 220);
  drawText(page, [snapshot.sellerPhone, snapshot.sellerEmail].filter(Boolean).join("  ·  "), MARGIN, 56, regular, 8, MUTED, 300);
  drawText(page, shorten(snapshot.sellerCompany || "", 38), PAGE_WIDTH - 190, 72, bold, 8.5, MUTED, 148);

  return document.save();
}
