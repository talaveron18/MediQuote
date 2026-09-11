import { NextRequest, NextResponse } from 'next/server';
import { requireRole, logAudit } from '@/lib/auth';
import { calculateCosting } from '@/lib/costing/cost-engine';
import type { CostingInput } from '@/lib/costing/cost-types';
import { db } from '@/lib/db';
import { genericInternalErrorResponse, privateNoStoreJson } from '@/lib/private-api-response';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro']);
    if (auth instanceof NextResponse) return auth;

    const budgetId = request.nextUrl.searchParams.get('budgetId');
    if (!budgetId) return privateNoStoreJson({ error: 'Falta budgetId' }, { status: 400 });

    const budget = await db.budget.findUnique({
      where: { id: budgetId },
      select: {
        id: true, code: true, status: true, subtotal: true, discountAmount: true,
        totalFinal: true, ivaAmount: true, serviceLocationId: true,
        serviceAutonomousCommunity: true, serviceProvince: true, serviceMunicipality: true,
        client: { select: { businessName: true } },
        history: {
          where: { snapshot: { not: null } }, orderBy: { createdAt: 'desc' }, take: 1,
          select: { snapshot: true },
        },
      },
    });
    if (!budget) return privateNoStoreJson({ error: 'Presupuesto no encontrado' }, { status: 404 });

    const quote = await db.costingQuote.findFirst({
      where: { budgetId }, orderBy: { createdAt: 'desc' }, select: { snapshot: true },
    });
    const rawSnapshot = quote?.snapshot ?? budget.history[0]?.snapshot;
    if (!rawSnapshot) {
      return privateNoStoreJson({ error: 'Este presupuesto no tiene una cotización económica sellada' }, { status: 404 });
    }

    try {
      const snapshot = JSON.parse(rawSnapshot);
      return privateNoStoreJson({
        budget: {
          id: budget.id, code: budget.code, status: budget.status, client: budget.client.businessName,
          subtotal: budget.subtotal, discountAmount: budget.discountAmount,
          ivaAmount: budget.ivaAmount, totalFinal: budget.totalFinal,
          location: {
            id: budget.serviceLocationId,
            autonomousCommunity: budget.serviceAutonomousCommunity,
            province: budget.serviceProvince,
            municipality: budget.serviceMunicipality,
          },
        },
        engineVersion: snapshot.engineVersion,
        calculatedAt: snapshot.calculatedAt,
        internalCost: snapshot.internalCost,
        verifiedLaborSources: snapshot.verifiedLaborSources ?? [],
        commercial: snapshot.commercial,
      });
    } catch (error) {
      console.error('[GET /api/costing] Snapshot inválido:', error);
      return genericInternalErrorResponse('La cotización económica guardada no es válida');
    }
  } catch (error) {
    console.error('[GET /api/costing] Error:', error);
    return genericInternalErrorResponse('Error al consultar la cotización económica');
  }
}

/**
 * Endpoint interno del motor económico.
 * Nunca se habilita al rol comercial porque el cuerpo y el resultado contienen
 * salario, cotizaciones, costes y rentabilidad de GASI.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, ['admin', 'maestro']);
    if (auth instanceof NextResponse) return auth;

    let body: { input?: CostingInput };
    try {
      body = await request.json();
    } catch {
      return privateNoStoreJson({
        status: 'pending_configuration',
        action: 'complete_in_administration',
        issues: [{ field: 'request', kind: 'invalid', message: 'El cuerpo de la solicitud no es JSON válido.' }],
      }, { status: 400 });
    }

    if (!body.input || typeof body.input !== 'object') {
      return privateNoStoreJson({
        status: 'pending_configuration',
        action: 'complete_in_administration',
        issues: [{ field: 'input', kind: 'missing', message: 'Faltan los datos del cálculo económico.' }],
      }, { status: 400 });
    }

    const result = calculateCosting(body.input);

    await logAudit({
      action: 'costing_calculated',
      entity: 'CostEngine',
      entityId: body.input.serviceId,
      userId: auth.id,
      userName: auth.name,
      userRole: auth.role,
      summary: `Motor económico: ${result.status}`,
      result: result.status === 'calculated' ? 'success' : result.status,
    });

    return privateNoStoreJson(result);
  } catch (error) {
    console.error('[POST /api/costing] Error:', error);
    return genericInternalErrorResponse('Error al calcular la cotización económica');
  }
}
