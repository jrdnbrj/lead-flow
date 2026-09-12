import assert from "node:assert/strict";

const { detectPurchaseCaseDocumentMime, validatePurchaseCaseDocumentFile, PURCHASE_CASE_DOCUMENT_MAX_BYTES } = await import("../lib/postpurchase-documents/file-validation.ts");

const bytes = (...values) => new Uint8Array(values);
const text = (value) => new TextEncoder().encode(value);
const valid = (declaredMimeType, data) => validatePurchaseCaseDocumentFile({ declaredMimeType, sizeBytes: data.length, bytes: data });

const pdf = text("%PDF-1.7\n");
assert.equal(detectPurchaseCaseDocumentMime(pdf), "application/pdf");
assert.equal(valid("application/pdf", pdf)?.extension, "pdf");
assert.equal(valid("image/jpeg", pdf), null);

const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0);
assert.equal(valid("image/jpeg", jpeg)?.extension, "jpg");
assert.equal(valid("image/png", jpeg), null);

const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
assert.equal(valid("image/png", png)?.extension, "png");

const webp = bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);
assert.equal(valid("image/webp", webp)?.extension, "webp");
assert.equal(valid("application/pdf", webp), null);
assert.equal(validatePurchaseCaseDocumentFile({ declaredMimeType: "application/pdf", sizeBytes: PURCHASE_CASE_DOCUMENT_MAX_BYTES + 1, bytes: pdf }), null);
assert.equal(validatePurchaseCaseDocumentFile({ declaredMimeType: "application/pdf", sizeBytes: pdf.length, bytes: new Uint8Array() }), null);

console.log("Postpurchase documents runtime checks: PASS");
