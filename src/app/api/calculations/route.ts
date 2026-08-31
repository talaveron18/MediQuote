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
import { COST_ENGINE_VERSION } from '@/lib/costing/cost-types';
import { getConventionProfileForProvince, resolveServiceLocation } from '@/lib/service-locations';
import { filterHolidaysForLocation } from '@/lib/holiday-location';
import { getLocalHolidayCalendar, getMunicipalHolidays } from '@/lib/local-holidays';
import { allocateBlockPricing } from '@/lib/block-pricing';

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

    const requestedLocation = resolveServiceLocation(body.location);
    if (body.location && !requestedLocation) {
      return NextResponse.json({ error: 'La comunidad, provincia y localidad no forman una zona territorial válida' }, { status: 400 });
    }
    const locationDefinition = requestedLocation ?? resolveServiceLocation(null)!;
    const conventionProfile = getConventionProfileForProvince(locationDefinition.province);
    if (!conventionProfile) {
      return NextResponse.json({ error: `No existe convenio profesional configurado para ${locationDefinition.province}` }, { status: 422 });
    }
    const location = {
      id: locationDefinition.id,
      cc: locationDefinition.autonomousCommunity,
      province: locationDefinition.province,
      municipality: locationDefinition.municipality,
      municipalityIneCode: locationDefinition.municipalityIneCode,
      conventionProfileId: conventionProfile.id,
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
    for (const year of years) {
      holidays.push(...generateHolidaysForYear(year, location));
      holidays.push(...getMunicipalHolidays(location.municipalityIneCode, year));
    }
    // La versión territorial generada se añade después de la base global y
    // prevalece por fecha (p. ej., Jueves Santo autonómico frente al seed nacional).
    const applicableHolidays = filterHolidaysForLocation(holidays, location);
    const deduplicatedHolidays = [...new Map(
      applicableHolidays.map((holiday) => [holiday.date, holiday]),
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
    const localCalendar = getLocalHolidayCalendar(location.municipalityIneCode);
    for (const year of years) {
      if (year !== 2026 || !localCalendar || localCalendar.status !== 'verified') {
        issues.push({
          field: `holidays.municipal.${location.municipalityIneCode}.${year}`,
          kind: 'missing',
          message: year !== 2026
            ? `El calendario oficial de festivos locales de ${location.municipality} para ${year} todavía no está publicado en esta versión.`
            : `El boletín oficial no contiene todavía dos festivos locales verificables para ${location.municipality}.`,
        });
      }
    }
    const internalBreakdowns: InternalCostBreakdown[] = [];
    const blockInternalCosts = blocks.map(() => 0);
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
          blockInternalCosts[index] = amount;
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
        holidays: deduplicatedHolidays,
        location: {
          province: location.province,
          municipality: location.municipality,
          conventionProfile,
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
      blockInternalCosts[index] = costing.internalCost.totalInternalCost;
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
    const overheadFactor = 1 + overheadPercent / 100;
    for (const [index, block] of blocks.entries()) {
      if (simpleTypes.has(block.blockType ?? '')) {
        blockInternalCosts[index] = roundMoney(blockInternalCosts[index] * overheadFactor);
      }
    }
    const directCostWithOverhead = directCostTotal * overheadFactor;
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
    const fallbackIvaPercent = Math.min(100, Math.max(0, Number(body.ivaPercent ?? 21)));
    const blockPricing = allocateBlockPricing({
      internalCosts: blockInternalCosts,
      initialPriceExVat: commercial.initialListPriceExVat,
      closingPriceExVat: commercial.closingPriceExVat,
      ivaPercents: blocks.map((block) => block.ivaPercent ?? fallbackIvaPercent),
    });
    const ivaAmount = roundMoney(blockPricing.reduce((sum, block) => sum + block.ivaAmount, 0));
    const effectiveIvaPercent = commercial.closingPriceExVat > 0
      ? roundMoney(ivaAmount / commercial.closingPriceExVat * 100)
      : 0;
    const maxVisibleDiscountPercent = calculateMaximumClientDiscountPercent(commercialPolicy);

    const result = {
      blocks: scheduleResults.map((schedule, index) => ({
        ...schedule,
        subtotal: blockPricing[index].initialPriceExVat,
        totalSurcharges: 0,
        totalWithSurcharges: blockPricing[index].closingPriceExVat,
        surcharges: [],
        ...blockPricing[index],
      })),
      totals: {
        blocks: scheduleResults,
        subtotal: commercial.initialListPriceExVat,
        totalSurcharges: 0,
        discountAmount: commercial.clientDiscountAmount,
        ivaAmount,
        totalFinal: roundMoney(blockPricing.reduce((sum, block) => sum + block.totalWithVat, 0)),
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
          engineVersion: COST_ENGINE_VERSION,
          calculatedAt: new Date().toISOString(),
          serviceBlocks: blocks,
          location,
          schedules: result.blocks,
          internalCost: result.internalCost,
          commercialPolicy: DEFAULT_GASI_COMMERCIAL_POLICY,
          commercial,
        }),
        subtotal: result.totals.subtotal,
        discountPercent: commercial.clientDiscountPercentOfList,
        discountAmount: result.totals.discountAmount,
        ivaPercent: effectiveIvaPercent,
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
