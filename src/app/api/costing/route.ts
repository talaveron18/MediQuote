import { NextRequest, NextResponse } from 'next/server';
import { requireRole, logAudit } from '@/lib/auth';
import { calculateCosting } from '@/lib/costing/cost-engine';
import type { CostingInput } from '@/lib/costing/cost-types';

export const runtime = 'nodejs';

/**
 * Endpoint interno del motor económico.
 * Nunca se habilita al rol comercial porque el cuerpo y el resultado contienen
 * salario, cotizaciones, costes y rentabilidad de GASI.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin']);
  if (auth instanceof NextResponse) return auth;

  let body: { input?: CostingInput };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({
      status: 'pending_configuration',
      action: 'complete_in_administration',
      issues: [{ field: 'request', kind: 'invalid', message: 'El cuerpo de la solicitud no es JSON válido.' }],
    }, { status: 400 });
  }

  if (!body.input || typeof body.input !== 'object') {
    return NextResponse.json({
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

  return NextResponse.json(result);
}
