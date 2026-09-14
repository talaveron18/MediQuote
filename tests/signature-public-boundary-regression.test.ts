import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const publicSignatureRoute = readFileSync('src/app/api/public/signature/route.ts', 'utf8');

test('firma pública exige consentimiento explícito e identidad del firmante', () => {
  assert.match(publicSignatureRoute, /body\.consent !== true/);
  assert.match(publicSignatureRoute, /signerName\.length < 3 \|\| signerName\.length > 160/);
  assert.match(publicSignatureRoute, /signerEmail !== signature\.recipientEmail\.toLowerCase\(\)/);
});

test('firma pública rechaza imagen inválida o excesiva antes de aceptar', () => {
  assert.match(publicSignatureRoute, /isValidSignaturePngDataUrl\(body\.signatureData\)/);
  assert.match(publicSignatureRoute, /La firma no es válida o es demasiado grande/);
});

test('aceptación revalida documento y bloquea presupuesto dentro de transacción', () => {
  assert.match(publicSignatureRoute, /db\.\$transaction\(async \(tx\) =>/);
  assert.match(publicSignatureRoute, /SELECT \"id\" FROM \"Budget\" WHERE \"id\" = \$\{signature\.budget\.id\} FOR UPDATE/);
  assert.match(publicSignatureRoute, /signatureDocumentIsCurrent\(currentBudget, signature\.documentHash\)/);
  assert.match(publicSignatureRoute, /claimPendingSignature\(tx, signature\.id/);
});

test('token aceptado no puede reutilizarse para una segunda aceptación', () => {
  assert.match(publicSignatureRoute, /signature\.status !== 'pending'/);
  assert.match(publicSignatureRoute, /if \(!claimed\) return 'already_claimed' as const/);
  assert.match(publicSignatureRoute, /Esta solicitud ya ha sido procesada/);
  assert.match(publicSignatureRoute, /status: 409/);
});
