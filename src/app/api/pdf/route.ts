import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const id = request.nextUrl.searchParams.get('id');
    const mode = request.nextUrl.searchParams.get('mode') || 'client';
    if (!id) {
      return privateNoStoreJson({ error: 'ID requerido' }, { status: 400 });
    }

    const budget = await db.budget.findUnique({
      where: { id },
      include: {
        client: true,
        createdBy: { select: { name: true } },
        serviceBlocks: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!budget || (auth.role === 'comercial' && budget.createdById !== auth.id)) {
      return privateNoStoreJson({ error: 'Presupuesto no encontrado' }, { status: 404 });
    }

    if (mode !== 'client' && mode !== 'commercial') {
      return privateNoStoreJson({ error: 'Modo de documento no válido' }, { status: 400 });
    }
    if (mode === 'commercial' && !['comercial', 'admin', 'maestro'].includes(auth.role)) {
      return privateNoStoreJson({ error: 'No autorizado para el documento comercial' }, { status: 403 });
    }

    const configRecords = await db.appConfig.findMany();
    const companyConfig: Record<string, string> = {};
    for (const r of configRecords) {
      companyConfig[r.key] = r.value;
    }

    // Los bloques históricos guardaban el id de categoría. Se resuelve aquí para
    // que ningún PDF entregue al cliente un identificador técnico de Prisma.
    const categories = await db.professionalCategory.findMany({
      select: { id: true, name: true },
    });
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    const printableBudget = {
      ...budget,
      serviceBlocks: budget.serviceBlocks.map((block) => ({
        ...block,
        professionalCategory: categoryNames.get(block.professionalCategory) ?? block.professionalCategory,
      })),
    };

    // El PDF cliente no contiene coste, margen, comisión ni avisos internos.
    let html = generateBudgetHTML(printableBudget, companyConfig, {
      enableSignatureSend: mode === 'client',
    });
    if (mode === 'commercial') {
      const quote = await db.costingQuote.findFirst({
        where: { budgetId: id },
        orderBy: { createdAt: 'desc' },
        select: { snapshot: true },
      });
      if (!quote) {
        return privateNoStoreJson({ error: 'No hay cálculo comercial guardado para este presupuesto' }, { status: 409 });
      }
      const snapshot = JSON.parse(quote.snapshot) as { commercial?: Record<string, unknown> };
      html = generateCommercialBudgetHTML(html, snapshot.commercial ?? {});
    }

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="presupuesto-${budget.code}.html"`,
        'Cache-Control': 'private, no-store',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: unknown) {
    console.error('[GET /api/pdf] Error:', error);
    return genericInternalErrorResponse('Error al generar el documento');
  }
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtEur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}
function fmtDate(d: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES');
}

export function generateBudgetHTML(
  budget: any,
  company: Record<string, string>,
  options: { enableSignatureSend?: boolean } = {},
): string {
  const statusLabels: Record<string, string> = {
    borrador: 'BORRADOR', enviado: 'ENVIADO', aceptado: 'ACEPTADO',
    rechazado: 'RECHAZADO', caducado: 'CADUCADO',
  };

  let blocksHTML = '';
  let blockNum = 0;
  for (const block of budget.serviceBlocks) {
    blockNum++;
    const breakdown = block.surchargeBreakdown ? JSON.parse(block.surchargeBreakdown) : [];
    let surchargeRows = '';
    for (const s of breakdown) {
      surchargeRows += `<tr><td style="padding:4px 12px;font-size:12px;color:#666;">  ${esc(s.name)}</td><td style="padding:4px 12px;font-size:12px;text-align:right;">${fmt(s.hours)}h</td><td style="padding:4px 12px;font-size:12px;text-align:right;">${fmtEur(s.amount)}</td></tr>`;
    }

    blocksHTML += `
    <div style="margin-bottom:24px;page-break-inside:avoid;">
      <h3 style="margin:0 0 8px;font-size:14px;color:#1a1a1a;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">${blockNum}. ${esc(block.serviceName)}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:3px 12px;color:#666;width:40%;">Categoría</td><td style="padding:3px 12px;">${esc(block.professionalCategory)}</td></tr>
        <tr><td style="padding:3px 12px;color:#666;">Días trabajados</td><td style="padding:3px 12px;">${block.totalWorkingDays}</td></tr>
        <tr><td style="padding:3px 12px;color:#666;">Total horas</td><td style="padding:3px 12px;">${fmt(block.totalHours)}h</td></tr>
        <tr><td style="padding:3px 12px;color:#666;">Profesionales</td><td style="padding:3px 12px;">${block.selectedProfessionals}</td></tr>
        ${block.blockTotalFinal > 0 ? `
        <tr><td style="padding:3px 12px;color:#666;">Precio sin IVA</td><td style="padding:3px 12px;">${fmtEur(block.blockClosingPrice)}</td></tr>
        <tr><td style="padding:3px 12px;color:#666;">IVA (${fmt(block.ivaPercent ?? budget.ivaPercent)}%)</td><td style="padding:3px 12px;">${fmtEur(block.ivaAmount)}</td></tr>
        <tr><td style="padding:3px 12px;color:#666;font-weight:600;">Total partida</td><td style="padding:3px 12px;font-weight:600;">${fmtEur(block.blockTotalFinal)}</td></tr>` : `
        <tr><td style="padding:3px 12px;color:#666;">Valoración</td><td style="padding:3px 12px;">Incluida en la propuesta económica global</td></tr>`}
      </table>
      ${surchargeRows ? `
      <table style="width:100%;border-collapse:collapse;margin-top:4px;">
        <tr style="background:#f9fafb;"><th style="padding:4px 12px;font-size:11px;text-align:left;color:#666;">Recargo</th><th style="padding:4px 12px;font-size:11px;text-align:right;color:#666;">Horas</th><th style="padding:4px 12px;font-size:11px;text-align:right;color:#666;">Importe</th></tr>
        ${surchargeRows}
      </table>` : ''}
    </div>`;
  }

  const baseImponible = budget.subtotal + budget.totalSurcharges - budget.discountAmount;

  const signatureControls = options.enableSignatureSend ? `
  <button type="button" onclick="sendBudgetForSignature()" style="padding:8px 18px;background:#07579b;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700;">Enviar al cliente para firma</button>` : '';
  const signatureScript = options.enableSignatureSend ? `<script>
async function sendBudgetForSignature(){
  const email=window.prompt('Correo del cliente',${JSON.stringify(budget.client.email ?? '')});
  if(!email)return;
  const button=event && event.currentTarget; if(button){button.disabled=true;button.textContent='Preparando envío…';}
  try{
    const response=await fetch('/api/signatures',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({budgetId:${JSON.stringify(budget.id)},recipientEmail:email})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'No se pudo preparar el envío');
    try{await navigator.clipboard.writeText(data.signingUrl);}catch{}
    window.location.assign(data.mailtoUrl);
    window.setTimeout(()=>window.alert('Se ha preparado el correo. Si su programa de correo no se abre, el enlace de firma se ha copiado al portapapeles:\n\n'+data.signingUrl),700);
  }catch(error){window.alert(error.message||'No se pudo preparar el envío');}
  finally{if(button){button.disabled=false;button.textContent='Enviar al cliente para firma';}}
}
</script>` : '';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Presupuesto ${budget.code}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { body { margin: 0 !important; } .no-print { display: none; } }
</style>
</head><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:40px;font-size:13px;max-width:800px;margin:0 auto;">

<div class="no-print" style="text-align:right;margin-bottom:16px;">
  <button onclick="window.print()" style="padding:8px 24px;background:#00549b;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Imprimir / Guardar PDF</button>
  ${signatureControls}
</div>

<!-- Header -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #00549b;padding-bottom:16px;margin-bottom:24px;gap:24px;">
  <div style="display:flex;gap:14px;align-items:flex-start;">
    <img src="/branding/gasi-logo.png" alt="GASI — Grupo de Asistencia Sanitaria Integral" style="width:145px;height:72px;object-fit:contain;object-position:left center;" />
    <div>
    <h1 style="margin:0;font-size:18px;color:#00549b;">${esc(company.company_name || 'GASI — Grupo de Asistencia Sanitaria Integral')}</h1>
    ${company.company_cif ? `<p style="margin:4px 0 0;color:#666;font-size:12px;">CIF: ${esc(company.company_cif)}</p>` : ''}
    ${company.company_address ? `<p style="margin:2px 0 0;color:#666;font-size:12px;">${esc(company.company_address)}</p>` : ''}
    <p style="margin:2px 0 0;color:#666;font-size:12px;">${esc(company.company_phone || '622 822 101')} · ${esc(company.company_email || 'coordinacion@gasisalud.com')}</p>
    <p style="margin:2px 0 0;color:#666;font-size:12px;">gasisalud.com · WhatsApp 634 029 865</p>
    </div>
  </div>
  <div style="text-align:right;">
    <h2 style="margin:0;font-size:20px;">PRESUPUESTO</h2>
    <p style="margin:4px 0;font-size:14px;font-weight:600;">${esc(budget.code)}</p>
    <p style="margin:2px 0;color:#666;">Fecha: ${fmtDate(budget.createdAt)}</p>
    <p style="margin:2px 0;color:#666;">Validez: ${fmtDate(budget.validUntil || '')}</p>
    <p style="margin:2px 0;"><span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:600;background:#e5e7eb;color:#374151;">${statusLabels[budget.status] || budget.status}</span></p>
  </div>
</div>

<!-- Client -->
<div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
  <h3 style="margin:0 0 8px;font-size:13px;color:#00549b;">DATOS DEL CLIENTE</h3>
  <p style="margin:0;font-weight:600;">${esc(budget.client.businessName)}</p>
  <p style="margin:2px 0 0;color:#666;">CIF: ${esc(budget.client.cif)}</p>
  <p style="margin:2px 0 0;color:#666;">${esc(budget.client.fiscalAddress)}</p>
  ${budget.client.contactPerson ? `<p style="margin:2px 0 0;color:#666;">Contacto: ${esc(budget.client.contactPerson)} ${budget.client.email ? '(' + esc(budget.client.email) + ')' : ''}</p>` : ''}
</div>

${budget.serviceProvince ? `<div style="margin:-10px 0 22px;color:#374151;font-size:12px;"><strong>Lugar de prestación:</strong> ${esc([budget.serviceMunicipality, budget.serviceProvince, budget.serviceAutonomousCommunity].filter(Boolean).join(', '))}</div>` : ''}

<!-- Description -->
${budget.description ? `<div style="margin-bottom:24px;"><h3 style="margin:0 0 8px;font-size:13px;color:#00549b;">DESCRIPCIÓN DEL SERVICIO</h3><p style="margin:0;line-height:1.6;">${esc(budget.description)}</p></div>` : ''}

<!-- Service Blocks -->
<h3 style="margin:0 0 16px;font-size:15px;color:#00549b;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">DETALLE DE SERVICIOS</h3>
${blocksHTML}

<!-- Client Notes -->
${budget.clientNotes ? `<div style="background:#eff6ff;border-left:3px solid #00549b;padding:12px;margin:24px 0;font-size:12px;color:#374151;"><strong>Notas:</strong> ${esc(budget.clientNotes)}</div>` : ''}

<!-- Totals -->
<div style="border-top:2px solid #1a1a1a;margin-top:32px;padding-top:16px;">
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 0;color:#666;">Subtotal</td><td style="padding:6px 0;text-align:right;">${fmtEur(budget.subtotal)}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Recargos</td><td style="padding:6px 0;text-align:right;">${fmtEur(budget.totalSurcharges)}</td></tr>
    ${budget.discountAmount > 0 ? `<tr><td style="padding:6px 0;color:#666;">Descuento (${fmt(budget.discountPercent)}%)</td><td style="padding:6px 0;text-align:right;color:#dc2626;">-${fmtEur(budget.discountAmount)}</td></tr>` : ''}
    <tr><td style="padding:6px 0;color:#666;">Base imponible</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmtEur(baseImponible)}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">IVA por partidas</td><td style="padding:6px 0;text-align:right;">${fmtEur(budget.ivaAmount)}</td></tr>
    <tr style="border-top:2px solid #00549b;"><td style="padding:10px 0;font-size:18px;font-weight:700;color:#00549b;">TOTAL FINAL</td><td style="padding:10px 0;text-align:right;font-size:18px;font-weight:700;color:#00549b;">${fmtEur(budget.totalFinal)}</td></tr>
  </table>
</div>

<!-- Conditions -->
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#999;">
  <p>Condiciones de pago: ${esc(budget.client?.paymentTerms || 'Según acuerdo')}</p>
  <p>Este presupuesto tiene una validez de ${company.valid_days_default || '30'} días desde la fecha de emisión.</p>
  <p>La aceptación de este presupuesto implica la conformidad con las condiciones descritas.</p>
</div>

<!-- Signature area -->
<div style="margin-top:48px;display:flex;justify-content:space-between;">
  <div style="text-align:center;width:45%;">
    <p style="font-size:12px;color:#666;margin-bottom:60px;">Firma del cliente</p>
    <div style="border-bottom:1px solid #ccc;"></div>
    <p style="font-size:11px;color:#999;margin-top:4px;">Nombre y apellidos</p>
  </div>
  <div style="text-align:center;width:45%;">
    <p style="font-size:12px;color:#666;margin-bottom:60px;">Firma del proveedor</p>
    <div style="border-bottom:1px solid #ccc;"></div>
    <p style="font-size:11px;color:#999;margin-top:4px;">${esc(company.company_name || '')}</p>
  </div>
</div>

<!-- License footer -->
<div style="margin-top:48px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#bbb;text-align:center;">
  ${esc(company.pdfFooterText || 'Documento generado mediante MediQuote Pro bajo licencia interna habilitada para GASI.')}
</div>

${signatureScript}
</body></html>`;
}

/** Documento interno: añade únicamente la comisión del comercial, nunca el coste interno. */
export function generateCommercialBudgetHTML(
  clientHtml: string,
  commercial: Record<string, unknown>,
): string {
  const rate = Number(commercial.commissionRatePercent ?? 0);
  const amount = Number(commercial.commissionAmount ?? 0);
  const tierLabels: Record<string, string> = {
    floor: 'Precio mínimo', intermediate: 'Precio intermedio', list: 'Precio inicial',
  };
  const tier = String(commercial.commissionTier ?? '');
  const section = `
<!-- Commercial-only -->
<div style="margin-top:24px;padding:16px;border:2px solid #1d4ed8;background:#eff6ff;border-radius:8px;page-break-inside:avoid;">
  <h3 style="margin:0 0 10px;color:#1d4ed8;font-size:14px;">DOCUMENTO COMERCIAL — USO INTERNO</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <tr><td style="padding:4px 0;color:#374151;">Tramo de cierre</td><td style="padding:4px 0;text-align:right;font-weight:600;">${esc(tierLabels[tier] || '—')}</td></tr>
    <tr><td style="padding:4px 0;color:#374151;">Comisión aplicable</td><td style="padding:4px 0;text-align:right;font-weight:600;">${fmt(rate)}%</td></tr>
    <tr style="border-top:1px solid #93c5fd;"><td style="padding:8px 0;font-weight:700;color:#1d4ed8;">Comisión estimada del comercial</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#1d4ed8;">${fmtEur(amount)}</td></tr>
  </table>
  <p style="margin:10px 0 0;font-size:11px;color:#475569;">Documento interno. No entregar al cliente.</p>
</div>`;
  return clientHtml
    .replace('<title>Presupuesto ', '<title>Documento comercial — Presupuesto ')
    .replace('<!-- Conditions -->', `${section}\n<!-- Conditions -->`);
}

function esc(s: string): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}