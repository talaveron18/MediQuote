import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logAudit, requireAuth } from '@/lib/auth';
import { hashBudgetForSignature, hashSignatureToken, SIGNATURE_CONSENT } from '@/lib/budget-signature';

const includeBudget = {
  client: true,
  serviceBlocks: { orderBy: { sortOrder: 'asc' as const } },
} as const;

function canUseBudget(auth: { id: string; role: string }, budget: { createdById: string }) {
  return auth.role !== 'comercial' || budget.createdById === auth.id;
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
      return NextResponse.json({ error: 'Certificado no encontrado' }, { status: 404 });
    }
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Certificado ${esc(signed.budget.code)}</title><style>@page{size:A4;margin:16mm}body{font-family:Arial;color:#172033;max-width:800px;margin:30px auto}.row{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:8px 0}.box{border:1px solid #ccd5e0;border-radius:8px;padding:18px;margin:20px 0}.no-print{text-align:right}@media print{.no-print{display:none}}</style></head><body><div class="no-print"><button onclick="window.print()">Imprimir / Guardar PDF</button></div><h1>Certificado de aceptación electrónica</h1><div class="box"><div class="row"><b>Presupuesto</b><span>${esc(signed.budget.code)}</span></div><div class="row"><b>Cliente</b><span>${esc(signed.budget.client.businessName)} · ${esc(signed.budget.client.cif)}</span></div><div class="row"><b>Total aceptado</b><span>${signed.budget.totalFinal.toLocaleString('es-ES',{style:'currency',currency:'EUR'})}</span></div><div class="row"><b>Firmante</b><span>${esc(signed.signerName)} · ${esc(signed.signerEmail)}</span></div><div class="row"><b>Fecha UTC</b><span>${esc(signed.acceptedAt?.toISOString())}</span></div><div class="row"><b>Huella SHA-256</b><span style="font-family:monospace;font-size:10px">${esc(signed.documentHash)}</span></div></div><p>${esc(signed.consentText || SIGNATURE_CONSENT)}</p>${signed.signatureData ? `<div class="box"><h3>Firma manuscrita</h3><img src="${esc(signed.signatureData)}" alt="Firma" style="max-width:420px;max-height:180px"></div>` : ''}<p style="font-size:11px;color:#667">Trazabilidad: solicitud ${esc(signed.id)} · IP ${esc(signed.acceptedIp)} · agente ${esc(signed.userAgent)}</p></body></html>`;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
  }
  const budgetId = request.nextUrl.searchParams.get('budgetId');
  if (!budgetId) return NextResponse.json({ error: 'Falta el presupuesto' }, { status: 400 });
  const budget = await db.budget.findUnique({ where: { id: budgetId }, select: { createdById: true } });
  if (!budget || !canUseBudget(auth, budget)) return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 });
  const requests = await db.budgetSignatureRequest.findMany({
    where: { budgetId }, select: { id: true, status: true, recipientEmail: true, expiresAt: true, signerName: true, signerEmail: true, acceptedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' }, take: 20,
  });
  return NextResponse.json({ requests });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json() as { budgetId?: string; recipientEmail?: string };
  if (!body.budgetId) return NextResponse.json({ error: 'Falta el presupuesto' }, { status: 400 });
  const budget = await db.budget.findUnique({ where: { id: body.budgetId }, include: includeBudget });
  if (!budget || !canUseBudget(auth, budget)) return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 });
  const recipientEmail = (body.recipientEmail || budget.client.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
    return NextResponse.json({ error: 'El cliente necesita un correo válido' }, { status: 400 });
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.budgetSignatureRequest.updateMany({ where: { budgetId: budget.id, status: 'pending' }, data: { status: 'revoked' } });
  const signatureRequest = await db.budgetSignatureRequest.create({ data: {
    budgetId: budget.id, createdById: auth.id, tokenHash: hashSignatureToken(token), status: 'pending',
    recipientEmail, documentHash: hashBudgetForSignature(budget), expiresAt,
  } });
  const signingUrl = `${request.nextUrl.origin}/firmar/${token}`;
  const subject = `Presupuesto ${budget.code} de GASI para revisión y firma`;
  const emailBody = `Buenos días,\n\nPuede revisar y aceptar electrónicamente el presupuesto ${budget.code} de GASI mediante este enlace seguro:\n\n${signingUrl}\n\nEl enlace es personal y caduca el ${expiresAt.toLocaleDateString('es-ES')}.\n\nUn saludo.`;
  await db.budget.update({ where: { id: budget.id }, data: { status: 'enviado', history: { create: { userId: auth.id, action: 'signature_requested', oldStatus: budget.status, newStatus: 'enviado', notes: `Enviado para firma a ${recipientEmail}` } } } });
  await logAudit({ action: 'budget_signature_requested', entity: 'budget', entityId: budget.id, userId: auth.id, userName: auth.name, userRole: auth.role, summary: `${budget.code} enviado para firma a ${recipientEmail}` });
  return NextResponse.json({ id: signatureRequest.id, signingUrl, mailtoUrl: `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}` }, { status: 201 });
}
