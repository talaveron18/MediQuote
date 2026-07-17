import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashBudgetForSignature, hashSignatureToken, SIGNATURE_CONSENT } from '@/lib/budget-signature';
import { logAudit } from '@/lib/auth';

const includeBudget = {
  client: true,
  serviceBlocks: { orderBy: { sortOrder: 'asc' as const } },
} as const;

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

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const signature = await findRequest(token);
  if (!signature) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 });
  if (signature.status === 'pending' && signature.expiresAt.getTime() < Date.now()) {
    await db.budgetSignatureRequest.update({ where: { id: signature.id }, data: { status: 'expired' } });
    return NextResponse.json({ error: 'Este enlace ha caducado' }, { status: 410 });
  }
  if (signature.status !== 'pending') {
    return NextResponse.json({ status: signature.status, acceptedAt: signature.acceptedAt });
  }
  const categories = await db.professionalCategory.findMany({ select: { id: true, name: true } });
  return NextResponse.json({
    status: signature.status,
    expiresAt: signature.expiresAt,
    recipientEmail: signature.recipientEmail,
    consentText: SIGNATURE_CONSENT,
    budget: publicBudget(signature.budget, new Map(categories.map((category) => [category.id, category.name]))),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    token?: string; signerName?: string; signerEmail?: string; signatureData?: string; consent?: boolean;
  };
  const signature = await findRequest(body.token ?? '');
  if (!signature) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 });
  if (signature.status !== 'pending') return NextResponse.json({ error: 'Esta solicitud ya no está pendiente', status: signature.status }, { status: 409 });
  if (signature.expiresAt.getTime() < Date.now()) {
    await db.budgetSignatureRequest.update({ where: { id: signature.id }, data: { status: 'expired' } });
    return NextResponse.json({ error: 'Este enlace ha caducado' }, { status: 410 });
  }
  const signerName = body.signerName?.trim() ?? '';
  const signerEmail = body.signerEmail?.trim().toLowerCase() ?? '';
  if (signerName.length < 3 || signerName.length > 160) return NextResponse.json({ error: 'Indique el nombre completo del firmante' }, { status: 400 });
  if (signerEmail !== signature.recipientEmail.toLowerCase()) return NextResponse.json({ error: 'El correo del firmante debe coincidir con el destinatario' }, { status: 400 });
  if (!body.consent) return NextResponse.json({ error: 'Debe aceptar la declaración de firma' }, { status: 400 });
  if (!body.signatureData?.startsWith('data:image/png;base64,') || body.signatureData.length > 700_000) {
    return NextResponse.json({ error: 'La firma no es válida o es demasiado grande' }, { status: 400 });
  }
  if (hashBudgetForSignature(signature.budget) !== signature.documentHash) {
    await db.budgetSignatureRequest.update({ where: { id: signature.id }, data: { status: 'revoked' } });
    return NextResponse.json({ error: 'El presupuesto ha cambiado. Solicite un enlace de firma nuevo.' }, { status: 409 });
  }
  const acceptedAt = new Date();
  const acceptedIp = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const userAgent = request.headers.get('user-agent')?.slice(0, 500) || null;
  await db.$transaction([
    db.budgetSignatureRequest.update({ where: { id: signature.id }, data: {
      status: 'accepted', signerName, signerEmail, signatureData: body.signatureData,
      consentText: SIGNATURE_CONSENT, acceptedAt, acceptedIp, userAgent,
    } }),
    db.budget.update({ where: { id: signature.budget.id }, data: {
      status: 'aceptado', history: { create: {
        userId: signature.createdById, action: 'client_accepted_electronically',
        oldStatus: signature.budget.status, newStatus: 'aceptado', notes: `Firmado por ${signerName} (${signerEmail})`,
      } },
    } }),
  ]);
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
  return NextResponse.json({ status: 'accepted', acceptedAt });
}
