import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logAudit, requireAuth } from '@/lib/auth';
import { hashBudgetForSignature, hashSignatureToken, SIGNATURE_CONSENT } from '@/lib/budget-signature';
import { signatureDocumentIsCurrent } from '@/lib/signature-write-guard';
import { buildTrustedPublicUrl } from '@/lib/public-origin';

const includeBudget = {
  client: true,
  serviceBlocks: { orderBy: { sortOrder: 'asc' as const } },
} as const;

function canUseBudget(auth: { id: string; role: string }, budget: { createdById: string }) {
  return auth.role !== 'comercial' || budget.createdById === auth.id;
}

function privateNoStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Pragma', 'no-cache');
  return NextResponse.json(body, { ...init, headers });
}

function esc(value: unknown) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const certificate = request.nextUrl.searchParams.get('certificate');
  if (certificate) {
    const signed = await db.budgetSignatureRequest.findUnique({
      where: { id: certificate }, include: { budget: { include: includeBudget }, createdBy: { select: { name: true } } },
    });
    if (!signed || !canUseBudget(auth, signed.budget) || signed.status !== 'accepted') {
      return privateNoStoreJson({ error: 'Certificado no encontrado' }, { status: 404 });
    }
    if (!signatureDocumentIsCurrent(signed.budget, signed.documentHash)) {
      return privateNoStoreJson({ error: 'La integridad del presupuesto aceptado no puede verificarse.' }, { status: 409 });
    }
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Certificado ${esc(signed.budget.code)}</title><style>@page{size:A4;margin:16mm}body{font-family:Arial;color:#172033;max-width:800px;margin:30px auto}.row{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:8px 0}.box{border:1px solid #ccd5e0;border-radius:8px;padding:18px;margin:20px 0}.no-print{text-align:right}@media print{.no-print{display:none}}</style></head><body><div class="no-print"><button onclick="window.print()">Imprimir / Guardar PDF</button></div><h1>Certificado de aceptación electrónica</h1><div class="box"><div class="row"><b>Presupuesto</b><span>${esc(signed.budget.code)}</span></div><div class="row"><b>Cliente</b><span>${esc(signed.budget.client.businessName)} · ${esc(signed.budget.client.cif)}</span></div><div class="row"><b>Total aceptado</b><span>${signed.budget.totalFinal.toLocaleString('es-ES',{style:'currency',currency:'EUR'})}</span></div><div class="row"><b>Firmante</b><span>${esc(signed.signerName)} · ${esc(signed.signerEmail)}</span></div><div class="row"><b>Fecha UTC</b><span>${esc(signed.acceptedAt?.toISOString())}</span></div><div class="row"><b>Huella SHA-256</b><span style="font-family:monospace;font-size:10px">${esc(signed.documentHash)}</span></div></div><p>${esc(signed.consentText || SIGNATURE_CONSENT)}</p>${signed.signatureData ? `<div class="box"><h3>Firma manuscrita</h3><img src="${esc(signed.signatureData)}" alt="Firma" style="max-width:420px;max-height:180px"></div>` : ''}<p style="font-size:11px;color:#667">Trazabilidad: solicitud ${esc(signed.id)} · IP ${esc(signed.acceptedIp)} · agente ${esc(signed.userAgent)}</p></body></html>`;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' } });
  }
  const budgetId = request.nextUrl.searchParams.get('budgetId');
  if (!budgetId) return privateNoStoreJson({ error: 'Falta el presupuesto' }, { status: 400 });
  const budget = await db.budget.findUnique({ where: { id: budgetId }, include: includeBudget });
  if (!budget || !canUseBudget(auth, budget)) return privateNoStoreJson({ error: 'Presupuesto no encontrado' }, { status: 404 });
  const requests = await db.budgetSignatureRequest.findMany({
    where: { budgetId }, select: { id: true, status: true, recipientEmail: true, expiresAt: true, signerName: true, signerEmail: true, acceptedAt: true, createdAt: true, documentHash: true },
    orderBy: { createdAt: 'desc' }, take: 20,
  });
  const now = Date.now();
  const expiredPendingIds = requests
    .filter((row) => row.status === 'pending' && row.expiresAt.getTime() < now)
    .map((row) => row.id);
  const expiredSet = new Set(expiredPendingIds);
  const stalePendingIds = requests
    .filter((row) => row.status === 'pending' && !expiredSet.has(row.id) && !signatureDocumentIsCurrent(budget, row.documentHash))
    .map((row) => row.id);
  if (expiredPendingIds.length) {
    await db.budgetSignatureRequest.updateMany({
      where: { id: { in: expiredPendingIds }, status: 'pending' },
      data: { status: 'expired' },
    });
  }
  if (stalePendingIds.length) {
    await db.budgetSignatureRequest.updateMany({
      where: { id: { in: stalePendingIds }, status: 'pending' },
      data: { status: 'revoked' },
    });
  }
  const staleSet = new Set(stalePendingIds);
  return privateNoStoreJson({ requests: requests.map(({ documentHash: _documentHash, ...row }) => ({
    ...row,
    status: expiredSet.has(row.id) ? 'expired' : staleSet.has(row.id) ? 'revoked' : row.status,
  })) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: { budgetId?: string; recipientEmail?: string };
  try {
    body = await request.json() as { budgetId?: string; recipientEmail?: string };
  } catch {
    return privateNoStoreJson({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
  }
  if (!body.budgetId) return privateNoStoreJson({ error: 'Falta el presupuesto' }, { status: 400 });

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const issuance = await db.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Budget" WHERE "id" = ${body.budgetId} FOR UPDATE
    `;
    const budget = await tx.budget.findUnique({ where: { id: body.budgetId }, include: includeBudget });
    if (!budget || !canUseBudget(auth, budget)) return { status: 'not_found' as const };
    if (budget.status === 'aceptado') return { status: 'accepted' as const };
    if (budget.status === 'caducado') return { status: 'expired' as const };

    const recipientEmail = (body.recipientEmail || budget.client.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
      return { status: 'invalid_email' as const };
    }

    await tx.budgetSignatureRequest.updateMany({
      where: { budgetId: budget.id, status: 'pending' },
      data: { status: 'revoked' },
    });
    const created = await tx.budgetSignatureRequest.create({ data: {
      budgetId: budget.id, createdById: auth.id, tokenHash: hashSignatureToken(token), status: 'pending',
      recipientEmail, documentHash: hashBudgetForSignature(budget), expiresAt,
    } });
    await tx.budget.update({ where: { id: budget.id }, data: {
      status: 'enviado',
      history: { create: { userId: auth.id, action: 'signature_requested', oldStatus: budget.status, newStatus: 'enviado', notes: `Enviado para firma a ${recipientEmail}` } },
    } });
    return { status: 'created' as const, created, budgetCode: budget.code, budgetId: budget.id, recipientEmail };
  });

  if (issuance.status === 'not_found') return privateNoStoreJson({ error: 'Presupuesto no encontrado' }, { status: 404 });
  if (issuance.status === 'accepted') {
    return privateNoStoreJson({ error: 'Un presupuesto aceptado no puede volver a enviarse para firma. Cree una nueva versión si necesita cambios.' }, { status: 409 });
  }
  if (issuance.status === 'expired') {
    return privateNoStoreJson({ error: 'Un presupuesto caducado no puede enviarse para firma. Cree una nueva versión vigente.' }, { status: 409 });
  }
  if (issuance.status === 'invalid_email') {
    return privateNoStoreJson({ error: 'El cliente necesita un correo válido' }, { status: 400 });
  }

  const signingUrl = buildTrustedPublicUrl({
    path: `/firmar/${token}`,
    requestOrigin: request.nextUrl.origin,
    configuredOrigin: process.env.MEDIQUOTE_PUBLIC_ORIGIN,
  }).toString();
  const subject = `Presupuesto ${issuance.budgetCode} de GASI para revisión y firma`;
  const emailBody = `Buenos días,\n\nPuede revisar y aceptar electrónicamente el presupuesto ${issuance.budgetCode} de GASI mediante este enlace seguro:\n\n${signingUrl}\n\nEl enlace es personal y caduca el ${expiresAt.toLocaleDateString('es-ES')}.\n\nUn saludo.`;

  await logAudit({ action: 'budget_signature_requested', entity: 'budget', entityId: issuance.budgetId, userId: auth.id, userName: auth.name, userRole: auth.role, summary: `${issuance.budgetCode} enviado para firma a ${issuance.recipientEmail}` });
  return privateNoStoreJson({ id: issuance.created.id, signingUrl, mailtoUrl: `mailto:${encodeURIComponent(issuance.recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}` }, { status: 201 });
}
