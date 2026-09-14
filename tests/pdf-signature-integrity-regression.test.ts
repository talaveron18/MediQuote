import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const pdfRoute = readFileSync('src/app/api/pdf/route.ts', 'utf8');
const signatureRoute = readFileSync('src/app/api/signatures/route.ts', 'utf8');

test('PDF comercial requiere rol autorizado y cálculo comercial persistido', () => {
  assert.match(pdfRoute, /mode === 'commercial' && !\['comercial', 'admin', 'maestro'\]\.includes\(auth\.role\)/);
  assert.match(pdfRoute, /db\.costingQuote\.findFirst/);
  assert.match(pdfRoute, /No hay cálculo comercial guardado para este presupuesto/);
});

test('PDF cliente no habilita envío a firma para estados cerrados', () => {
  assert.match(pdfRoute, /signatureSendAllowed = mode === 'client' && \['borrador', 'enviado'\]\.includes\(budget\.status\)/);
  assert.doesNotMatch(pdfRoute, /\['borrador', 'enviado', 'aceptado'/);
});

test('solicitud de firma fija hash documental y revoca pendientes anteriores en la misma transacción', () => {
  assert.match(signatureRoute, /db\.\$transaction\(async \(tx\) =>/);
  assert.match(signatureRoute, /tx\.budgetSignatureRequest\.updateMany\([\s\S]*status: 'pending'[\s\S]*status: 'revoked'/);
  assert.match(signatureRoute, /documentHash: hashBudgetForSignature\(budget\)/);
});

test('certificado aceptado falla cerrado si el presupuesto ya no coincide con la huella firmada', () => {
  assert.match(signatureRoute, /signatureDocumentIsCurrent\(signed\.budget, signed\.documentHash\)/);
  assert.match(signatureRoute, /La integridad del presupuesto aceptado no puede verificarse\./);
  assert.match(signatureRoute, /status: 409/);
});
