import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashSignatureToken, SIGNATURE_CONSENT } from '@/lib/budget-signature';
import { claimPendingSignature, signatureDocumentIsCurrent } from '@/lib/signature-write-guard';
import { logAudit } from '@/lib/auth';
import { isValidSignaturePngDataUrl } from '@/lib/signature-image';

const includeBudget = {
  client: true,
  serviceBlocks: { orderBy: { sortOrder: 'asc' as const } },
} as const;

function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Pragma', 'no-cache');
  return NextResponse.json(body, { ...init, headers });
}

async function findRequest(token: string) {
  if (!token || token.length > 200) return null;
  return db.budgetSignatureRequest.findUnique({
    where: { tokenHash: hashSignatureToken(token) },
    include: { budget: { include: includeBudget } },
  });
}

function publicBudget(budget: any, categoryNames: Map<string, string>) {
  return {
    code: budget.code,
    validUntil: budget.validUntil,
    description: budget.description,
    client: { businessName: budget.client.businessName, cif: budget.client.cif },
    location: [budget.serviceMunicipality, budget.serviceProvince, budget.serviceAutonomousCommunity]
      .filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(', '),
    subtotal: budget.subtotal,
    discountPercent: budget.discountPercent,
    discountAmount: budget.discountAmount,
    ivaAmount: budget.ivaAmount,
    totalFinal: budget.totalFinal,
    serviceBlocks: budget.serviceBlocks.map((block: any) => ({
      serviceName: block.serviceName,
      professionalCategory: categoryNames.get(block.professionalCategory) ?? block.professionalCategory,
      totalWorkingDays: block.totalWorkingDays,
      totalHours: block.totalHours,
      selectedProfessionals: block.selectedProfessionals,
      blockClosingPrice: block.blockClosingPrice,
      ivaPercent: block.ivaPercent,
      ivaAmount: block.ivaAmount,
      blockTotalFinal: block.blockTotalFinal,
    })),
  };
}

async function revokeIfDocumentChanged(signature: any): Promise<boolean> {
  if (signatureDocumentIsCurrent(signature.budget, signature.documentHash)) return false;
  await db.budgetSignatureRequest.updateMany({
    where: { id: signature.id, status: 'pending' },
    data: { status: 'revoked' },
  });
  return true;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const signature = await findRequest(token);
  if (!signature) return noStoreJson({ error: 'Enlace no válido' }, { status: 404 });
  if (signature.status === 'pending' && signature.expiresAt.getTime() < Date.now()) {
    await db.budgetSignatureRequest.updateMany({
      where: { id: signature.id, status: 'pending' },
      data: { status: 'expired' },
    });
    return noStoreJson({ error: 'Este enlace ha caducado' }, { status: 410 });
  }
  if (signature.status !== 'pending') {
    if (signature.status === 'accepted' && !signatureDocumentIsCurrent(signature.budget, signature.documentHash)) {
      return noStoreJson(
        { error: 'La integridad del presupuesto aceptado no puede verificarse.', status: 'accepted' },
        { status: 409 },
      );
    }
    if (signature.status === 'revoked') {
      return noStoreJson(
        { error: 'El presupuesto ha cambiado. Solicite un enlace de firma nuevo.', status: 'revoked' },
        { status: 409 },
      );
    }
    return noStoreJson({ status: signature.status, acceptedAt: signature.acceptedAt });
  }
  if (await revokeIfDocumentChanged(signature)) {
    return noStoreJson(
      { error: 'El presupuesto ha cambiado. Solicite un enlace de firma nuevo.', status: 'revoked' },
      { status: 409 },
    );
  }
  const categories = await db.professionalCategory.findMany({ select: { id: true, name: true } });
  return noStoreJson({
    status: signature.status,
    expiresAt: signature.expiresAt,
    recipientEmail: signature.recipientEmail,
    consentText: SIGNATURE_CONSENT,
    documentHash: signature.documentHash,
    budget: publicBudget(signature.budget, new Map(categories.map((category) => [category.id, category.name]))),
  });
}

export async function POST(request: NextRequest) {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return noStoreJson({ error: 'El cuerpo debe ser JSON válido' }, { status: 400 });
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    return noStoreJson({ error: 'El cuerpo debe ser un objeto JSON válido' }, { status: 400 });
  }
  const body = parsedBody as Record<string, unknown>;
  if (typeof body.token !== 'string' || !body.token) {
    return noStoreJson({ error: 'El token de firma debe ser texto' }, { status: 400 });
  }
  if (typeof body.signerName !== 'string') {
    return noStoreJson({ error: 'El nombre del firmante debe ser texto' }, { status: 400 });
  }
  if (typeof body.signerEmail !== 'string') {
    return noStoreJson({ error: 'El correo del firmante debe ser texto' }, { status: 400 });
  }
  if (body.signatureData !== undefined && typeof body.signatureData !== 'string') {
    return noStoreJson({ error: 'La firma debe enviarse como imagen válida' }, { status: 400 });
  }
  if (body.consent !== true) {
    return noStoreJson({ error: 'Debe aceptar la declaración de firma' }, { status: 400 });
  }

  const signature = await findRequest(body.token);
  if (!signature) return noStoreJson({ error: 'Enlace no válido' }, { status: 404 });
  if (signature.status !== 'pending') return noStoreJson({ error: 'Esta solicitud ya no está pendiente', status: signature.status }, { status: 409 });
  if (signature.expiresAt.getTime() < Date.now()) {
    await db.budgetSignatureRequest.updateMany({
      where: { id: signature.id, status: 'pending' },
      data: { status: 'expired' },
    });
    return noStoreJson({ error: 'Este enlace ha caducado' }, { status: 410 });
  }
  const signerName = body.signerName.trim();
  const signerEmail = body.signerEmail.trim().toLowerCase();
  if (signerName.length < 3 || signerName.length > 160) return noStoreJson({ error: 'Indique el nombre completo del firmante' }, { status: 400 });
  if (signerEmail !== signature.recipientEmail.toLowerCase()) return noStoreJson({ error: 'El correo del firmante debe coincidir con el destinatario' }, { status: 400 });
  if (!isValidSignaturePngDataUrl(body.signatureData)) {
    return noStoreJson({ error: 'La firma no es válida o es demasiado grande' }, { status: 400 });
  }
  if (!signatureDocumentIsCurrent(signature.budget, signature.documentHash)) {
    await db.budgetSignatureRequest.updateMany({
      where: { id: signature.id, status: 'pending' },
      data: { status: 'revoked' },
    });
    return noStoreJson({ error: 'El presupuesto ha cambiado. Solicite un enlace de firma nuevo.' }, { status: 409 });
  }

  const acceptedAt = new Date();
  const acceptedIp = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const userAgent = request.headers.get('user-agent')?.slice(0, 500) || null;

  const acceptanceResult = await db.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Budget" WHERE "id" = ${signature.budget.id} FOR UPDATE
    `;
    const currentBudget = await tx.budget.findUnique({
      where: { id: signature.budget.id },
      include: includeBudget,
    });
    if (!currentBudget || currentBudget.status === 'aceptado' || !signatureDocumentIsCurrent(currentBudget, signature.documentHash)) {
      await tx.budgetSignatureRequest.updateMany({
        where: { id: signature.id, status: 'pending' },
        data: { status: 'revoked' },
      });
      return 'document_changed' as const;
    }

    const claimed = await claimPendingSignature(tx, signature.id, {
      signerName,
      signerEmail,
      signatureData: body.signatureData,
      consentText: SIGNATURE_CONSENT,
      acceptedAt,
      acceptedIp,
      userAgent,
    });
    if (!claimed) return 'already_claimed' as const;

    await tx.budget.update({ where: { id: signature.budget.id }, data: {
      status: 'aceptado', history: { create: {
        userId: signature.createdById, action: 'client_accepted_electronically',
        oldStatus: currentBudget.status, newStatus: 'aceptado', notes: `Firmado por ${signerName} (${signerEmail})`,
      } },
    } });
    return 'accepted' as const;
  });

  if (acceptanceResult === 'document_changed') {
    return noStoreJson({ error: 'El presupuesto ha cambiado. Solicite un enlace de firma nuevo.', status: 'revoked' }, { status: 409 });
  }
  if (acceptanceResult === 'already_claimed') {
    return noStoreJson({ error: 'Esta solicitud ya ha sido procesada', status: 'accepted' }, { status: 409 });
  }

  const recipients = await db.user.findMany({
    where: { active: true, OR: [{ id: signature.createdById }, { role: { in: ['maestro', 'admin'] } }] },
    select: { id: true },
  });
  for (const recipient of recipients) {
    const message = await db.internalMessage.create({ data: {
      senderId: signature.createdById,
      recipientId: recipient.id,
      subject: `Presupuesto ${signature.budget.code} firmado y aceptado`,
      body: `${signerName} (${signerEmail}) ha firmado y aceptado el presupuesto. Certificado: /api/signatures?certificate=${signature.id}`,
      budgetId: signature.budget.id,
      clientId: signature.budget.clientId,
    } });
    await db.notification.create({ data: {
      userId: recipient.id, type: 'budget_signed',
      title: `Presupuesto ${signature.budget.code} firmado`,
      body: `${signerName} ha aceptado electrónicamente el presupuesto.`,
      linkView: 'communications', entityId: message.id,
    } });
  }
  await logAudit({
    action: 'budget_accepted_electronically', entity: 'budget', entityId: signature.budget.id,
    userName: signerName, userRole: 'client', summary: `${signature.budget.code} firmado por ${signerEmail}`,
    newData: JSON.stringify({ signatureRequestId: signature.id, acceptedAt, documentHash: signature.documentHash }),
  });
  return noStoreJson({ status: 'accepted', acceptedAt });
}