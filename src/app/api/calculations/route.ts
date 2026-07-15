import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, sanitizeForRole } from '@/lib/auth';
import { calculateServiceBlock } from '@/lib/schedule-engine';
import { calculateCosting } from '@/lib/costing/cost-engine';
import {
  calculateClosingPriceFromDiscount,
  calculateCommercialResult,
  calculateMaximumClientDiscountPercent,
  calculatePriceRange,
  DEFAULT_GASI_COMMERCIAL_POLICY,
} from '@/lib/costing/commercial-policy';
import { buildCostingInputFromDatabase } from '@/lib/costing/server-input';
import { generateHolidaysForYear } from '@/lib/spanish-holidays';
import type {
  BlockCalculationResult,
  HolidayInfo,
  ServiceBlockInput,
} from '@/lib/types';
import type { DataIssue, InternalCostBreakdown } from '@/lib/costing/cost-types';
import { SERVICE_LOCATIONS } from '@/lib/service-locations';

export const runtime = 'nodejs';

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

function simpleDirectCost(block: ServiceBlockInput): number {
  const unitCost = Number(block.fixedPrice ?? block.pricePerHour);
  if (!Number.isFinite(unitCost) || unitCost < 0) return Number.NaN;
  if (block.blockType === 'alojamiento') {
    return unitCost
      * Math.max(0, Number(block.accommodationNights ?? block.quantity ?? 0))
      * Math.max(0, Number(block.accommodationPersons ?? 1));
  }
  return unitCost * Math.max(0, Number(block.quantity ?? 0));
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json() as {
      blocks?: ServiceBlockInput[];
      discountPercent?: number;
      ivaPercent?: number;
      location?: { id?: string; cc?: string; province?: string; municipality?: string };
    };
    const blocks = body.blocks;
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json({ error: 'Se requiere al menos un bloque de servicio' }, { status: 400 });
    }

    const [dbSurcharges, laborRule, categories, legalParameterRows, appConfigRows] = await Promise.all([
      db.surchargeConfig.findMany({ where: { active: true } }),
      db.laborRule.findFirst(),
      db.professionalCategory.findMany({ where: { active: true } }),
      db.legalParameter.findMany({
        where: { isActive: true },
        include: { legalRecord: true },
      }),
      db.appConfig.findMany(),
    ]);

    const laborRules = laborRule ?? {
      maxWeeklyHours: 40,
      maxDailyHours: 12,
      minRestBetweenShiftsH: 12,
      maxConsecutiveDays: 6,
      nightStartHour: 22,
      nightEndHour: 6,
    };

    const requestedLocation = body.location?.id
      ? SERVICE_LOCATIONS.find((candidate) => candidate.id === body.location?.id)
      : SERVICE_LOCATIONS.find((candidate) => (
          candidate.province === body.location?.province
          && candidate.autonomousCommunity === body.location?.cc
          && (candidate.municipality || '') === (body.location?.municipality || '')
        ));
    if (body.location && !requestedLocation) {
      return NextResponse.json({ error: 'La zona de servicio no está soportada por el calendario legal de esta versión' }, { status: 400 });
    }
    const locationDefinition = requestedLocation ?? SERVICE_LOCATIONS[0];
    const location = {
      id: locationDefinition.id,
      cc: locationDefinition.autonomousCommunity,
      province: locationDefinition.province,
      municipality: locationDefinition.municipality,
    };
    const holidayWhere: Record<string, unknown>[] = [{ type: 'nacional' }];
    if (location.cc) holidayWhere.push({ type: 'autonomico', autonomousCommunity: location.cc });
    if (location.province) holidayWhere.push({ type: 'provincial', province: location.province });
    if (location.municipality) holidayWhere.push({ type: 'municipal', municipality: location.municipality });
    const dbHolidays = await db.holiday.findMany({ where: { OR: holidayWhere } });
    const holidays: HolidayInfo[] = dbHolidays.map((holiday) => ({
      date: holiday.date,
      name: holiday.name,
      type: holiday.type as HolidayInfo['type'],
      autonomousCommunity: holiday.autonomousCommunity ?? undefined,
      province: holiday.province ?? undefined,
      municipality: holiday.municipality ?? undefined,
      recurring: holiday.recurring,
    }));
    const years = new Set<number>();
    for (const block of blocks) {
      for (const value of [block.dateRangeStart, block.dateRangeEnd, ...(block.specificDates ?? [])]) {
        if (value) years.add(Number(value.slice(0, 4)));
      }
    }
    if (years.size === 0) years.add(new Date().getFullYear());
    for (const year of years) holidays.push(...generateHolidaysForYear(year, location));
    // La versión territorial generada se añade después de la base global y
    // prevalece por fecha (p. ej., Jueves Santo autonómico frente al seed nacional).
    const deduplicatedHolidays = [...new Map(
      holidays.map((holiday) => [holiday.date, holiday]),
    ).values()];

    // El calendario se ejecuta una sola vez. Se fuerza precio cero para que el
    // módulo operativo no construya ningún precio de venta heredado.
    const scheduleResults: BlockCalculationResult[] = blocks.map((block) => calculateServiceBlock({
      block: { ...block, pricePerHour: 0, fixedPrice: 0 },
      holidays: deduplicatedHolidays,
      surcharges: [],
      laborRules,
    }));

    const legalParameters: Record<string, number> = {};
    const legalParameterSources: Record<string, {
      id: string;
      label: string;
      url?: string;
      effectiveFrom?: string;
      effectiveTo?: string;
      status: 'verified';
    }> = {};
    for (const row of legalParameterRows) {
      const value = Number(row.value);
      if (Number.isFinite(value)) legalParameters[row.key] = value;
      if (row.legalRecord && row.legalRecord.status === 'vigente') {
        legalParameterSources[row.key] = {
          id: row.legalRecord.key,
          label: `${row.legalRecord.title}${row.legalRecord.location ? `, ${row.legalRecord.location}` : ''}`,
          url: row.legalRecord.officialUrl ?? undefined,
          effectiveFrom: row.effectiveFrom ?? undefined,
          effectiveTo: row.effectiveTo ?? undefined,
          status: 'verified',
        };
      }
    }
    const appConfig: Record<string, string> = {};
    for (const row of appConfigRows) appConfig[row.key] = row.value;

    const issues: DataIssue[] = [];
    const internalBreakdowns: InternalCostBreakdown[] = [];
    let directCostTotal = 0;
    const simpleTypes = new Set([
      'servicio_fijo', 'material', 'desplazamiento', 'dietas', 'alojamiento',
      'ambulancia', 'telemedicina', 'curso', 'otros',
    ]);

    for (const [index, block] of blocks.entries()) {
      if (simpleTypes.has(block.blockType ?? '')) {
        const amount = simpleDirectCost(block);
        if (!Number.isFinite(amount) || amount <= 0) {
          issues.push({
            field: `blocks.${index}.directCost`,
            kind: 'missing',
            message: `Falta el coste real del bloque ${index + 1}.`,
          });
        } else {
          directCostTotal += amount;
        }
        continue;
      }

      const category = categories.find((candidate) => candidate.id === block.professionalCategory);
      const built = buildCostingInputFromDatabase({
        block,
        schedule: scheduleResults[index],
        category,
        config: { legalParameters, legalParameterSources, appConfig, surcharges: dbSurcharges },
        serviceId: String(index),
        location: {
          province: location.province,
          municipality: location.municipality,
          nightSurchargeLegalParameterKey: locationDefinition.nightSurchargeLegalParameterKey,
        },
      });
      if (built.status === 'pending_configuration') {
        issues.push(...built.issues);
        continue;
      }
      const costing = calculateCosting(built.input);
      if (costing.status !== 'calculated') {
        issues.push(...costing.issues.map((issue) => ({
          ...issue,
          field: `blocks.${index}.${issue.field}`,
        })));
        continue;
      }
      internalBreakdowns.push(costing.internalCost);
    }

    if (issues.length > 0) {
      const pending = {
        blocks: scheduleResults,
        totals: null,
        commercial: {
          status: 'pending_configuration' as const,
          requiresAuthorization: true,
          pendingFields: [...new Set(issues.map((issue) => issue.field))],
        },
        issues,
      };
      return NextResponse.json(sanitizeForRole(pending, auth.role));
    }

    const overheadPercent = Number(appConfig.costing_overhead_percent ?? 15);
    const directCostWithOverhead = directCostTotal * (1 + overheadPercent / 100);
    const totalInternalCost = roundMoney(
      internalBreakdowns.reduce((sum, breakdown) => sum + breakdown.totalInternalCost, 0)
      + directCostWithOverhead,
    );
    const commercialPolicy = { ...DEFAULT_GASI_COMMERCIAL_POLICY };
    const range = calculatePriceRange(totalInternalCost, commercialPolicy);
    const requestedDiscount = Math.max(0, Number(body.discountPercent ?? 0));
    const closingPrice = calculateClosingPriceFromDiscount({
      totalInternalCost,
      requestedDiscountPercent: requestedDiscount,
      policy: commercialPolicy,
    });
    const commercial = calculateCommercialResult({
      totalInternalCost,
      closingPriceExVat: closingPrice,
      policy: commercialPolicy,
    });
    const ivaPercent = Math.min(100, Math.max(0, Number(body.ivaPercent ?? 21)));
    const ivaAmount = commercial.closingPriceExVat * ivaPercent / 100;
    const maxVisibleDiscountPercent = calculateMaximumClientDiscountPercent(commercialPolicy);

    const result = {
      blocks: scheduleResults.map((schedule) => ({
        ...schedule,
        subtotal: 0,
        totalSurcharges: 0,
        totalWithSurcharges: 0,
        surcharges: [],
      })),
      totals: {
        blocks: scheduleResults,
        subtotal: commercial.initialListPriceExVat,
        totalSurcharges: 0,
        discountAmount: commercial.clientDiscountAmount,
        ivaAmount: roundMoney(ivaAmount),
        totalFinal: roundMoney(commercial.closingPriceExVat + ivaAmount),
      },
      commercial: {
        status: 'calculated' as const,
        initialPriceExVat: commercial.initialListPriceExVat,
        closingPriceExVat: commercial.closingPriceExVat,
        discountAmount: commercial.clientDiscountAmount,
        discountPercent: commercial.clientDiscountPercentOfList,
        maximumDiscountPercent: roundMoney(maxVisibleDiscountPercent),
        semaphore: commercial.semaphore,
        requiresAuthorization: commercial.requiresAuthorization,
      },
      internalCost: {
        totalInternalCost,
        laborBlocks: internalBreakdowns,
        directCostTotal: roundMoney(directCostTotal),
        directCostOverhead: roundMoney(directCostWithOverhead - directCostTotal),
      },
    };

    const quote = await db.costingQuote.create({
      data: {
        userId: auth.id,
        snapshot: JSON.stringify({
          engineVersion: '1.0.0',
          calculatedAt: new Date().toISOString(),
          serviceBlocks: blocks,
          location,
          schedules: scheduleResults,
          internalCost: result.internalCost,
          commercialPolicy: DEFAULT_GASI_COMMERCIAL_POLICY,
          commercial,
        }),
        subtotal: result.totals.subtotal,
        discountPercent: commercial.clientDiscountPercentOfList,
        discountAmount: result.totals.discountAmount,
        ivaPercent,
        ivaAmount: result.totals.ivaAmount,
        totalFinal: result.totals.totalFinal,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    Object.assign(result.totals, { calculationToken: quote.id });

    return NextResponse.json(sanitizeForRole(result, auth.role));
  } catch (error) {
    console.error('[POST /api/calculations] Error:', error);
    return NextResponse.json({ error: 'Error al realizar el cálculo económico' }, { status: 500 });
  }
}
