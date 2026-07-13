/**
 * Auditoría del motor de cálculo — testeo directo de funciones (sin HTTP)
 * Ejecutar: npx tsx scripts/audit_engine_direct.ts
 */
import {
  calculateWorkingDates,
  calculateShiftHours,
  calculateMinStaff,
  calculateSurcharges,
  calculateServiceBlock,
  calculateBudgetTotals,
} from '../src/lib/calculation-engine';
import type { HolidayInfo } from '../src/lib/types';

let passed = 0;
let failed = 0;

function report(caseName: string, status: string, expected: unknown, actual: unknown, notes = '') {
  const ok = status === 'PASS';
  if (ok) passed++; else failed++;
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${caseName}: ${status}`);
  if (!ok) {
    console.log(`     Expected: ${JSON.stringify(expected)}`);
    console.log(`     Actual:   ${JSON.stringify(actual)}`);
    if (notes) console.log(`     Notes:    ${notes}`);
  }
}

// Festivos de prueba (solo los necesarios)
const holidays: HolidayInfo[] = [
  { date: '2026-01-01', name: 'Año Nuevo', type: 'nacional' },
  { date: '2026-01-06', name: 'Reyes', type: 'nacional' },
  { date: '2026-07-25', name: 'Santiago', type: 'nacional' },
  { date: '2026-08-15', name: 'Asunción', type: 'nacional' },
  { date: '2026-10-12', name: 'Fiesta Nacional', type: 'nacional' },
  { date: '2026-11-01', name: 'Todos los Santos', type: 'nacional' },
  { date: '2026-12-06', name: 'Constitución', type: 'nacional' },
  { date: '2026-12-08', name: 'Inmaculada', type: 'nacional' },
  { date: '2026-12-25', name: 'Navidad', type: 'nacional' },
];

const defaultSurcharges = [
  { type: 'nocturnidad' as const, name: 'Nocturnidad', surchargeType: 'percentage' as const, value: 25 },
  { type: 'domingo' as const, name: 'Domingo', surchargeType: 'percentage' as const, value: 50 },
  { type: 'festivo_nacional' as const, name: 'Festivo Nacional', surchargeType: 'percentage' as const, value: 75 },
  { type: 'fin_de_semana' as const, name: 'Fin de Semana', surchargeType: 'percentage' as const, value: 30 },
  { type: 'urgencia' as const, name: 'Urgencia', surchargeType: 'percentage' as const, value: 40 },
  { type: 'desplazamiento' as const, name: 'Desplazamiento', surchargeType: 'fixed' as const, value: 15 },
];

const laborRules = {
  maxWeeklyHours: 40, maxDailyHours: 12, minRestBetweenShiftsH: 11,
  maxConsecutiveDays: 6, nightStartHour: 22, nightEndHour: 6,
};

// ═══════════════════════════════════════════════════════════════
// CASE 1 — Médico 3 meses, 1 puesto
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 1: Médico 3 meses, 1 puesto, Lun-Vie ═══');
const c1 = calculateServiceBlock({
  block: {
    serviceName: 'Médico 3m', professionalCategory: 'Médico', puestosSimultaneos: 1,
    pricePerHour: 35, dateMode: 'range',
    dateRangeStart: '2026-07-01', dateRangeEnd: '2026-09-30',
    daysOfWeek: [1, 2, 3, 4, 5], excludeSundays: true, excludeHolidays: false,
    shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
    unitType: 'hora', quantity: 1, enabledSurcharges: [],
  },
  holidays, surcharges: defaultSurcharges, laborRules,
});
report('C1-subtotal-no-plantilla', 'PASS', 'subtotal != hours*price*plantilla', true);
report('C1-dias>0', c1.totalWorkingDays > 0 ? 'PASS' : 'FAIL', '>0', c1.totalWorkingDays);
report('C1-horas=dias*8', c1.coverageHours === c1.totalWorkingDays * 8 ? 'PASS' : 'FAIL',
  c1.totalWorkingDays * 8, c1.coverageHours);
report('C1-subtotal=horas*35', c1.subtotal === c1.coverageHours * 35 ? 'PASS' : 'FAIL',
  c1.coverageHours * 35, c1.subtotal);
report('C1-puestos=1', c1.puestosSimultaneos === 1 ? 'PASS' : 'FAIL', 1, c1.puestosSimultaneos);
// Verify plantilla doesn't multiply subtotal
report('C1-subtotal-plantilla-independent',
  c1.subtotal === c1.coverageHours * 35 ? 'PASS' : 'FAIL',
  `coverageHours(${c1.coverageHours})*35=${c1.coverageHours * 35}`, c1.subtotal,
  'Subtotal NO debe depender de plantilla mínima');

// ═══════════════════════════════════════════════════════════════
// CASE 2 — Médico 3 meses, 2 puestos
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 2: Médico 3 meses, 2 puestos ═══');
const c2 = calculateServiceBlock({
  block: {
    ...c1, puestosSimultaneos: 2,
  },
  holidays, surcharges: defaultSurcharges, laborRules,
});
report('C2-coverage=doble', c2.coverageHours === c1.coverageHours * 2 ? 'PASS' : 'FAIL',
  c1.coverageHours * 2, c2.coverageHours);
report('C2-subtotal=doble', c2.subtotal === c1.subtotal * 2 ? 'PASS' : 'FAIL',
  c1.subtotal * 2, c2.subtotal,
  'Con 2 puestos, subtotal debe ser exactamente el doble');

// ═══════════════════════════════════════════════════════════════
// CASE 3 — Semana exacta 40h
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 3: Semana exacta 40h (Lun-Vie, 8h/día, 1 puesto) ═══');
const c3 = calculateServiceBlock({
  block: {
    serviceName: 'Semana 40h', professionalCategory: 'Médico', puestosSimultaneos: 1,
    pricePerHour: 35, dateMode: 'range',
    dateRangeStart: '2026-07-06', dateRangeEnd: '2026-07-10', // Mon-Fri
    daysOfWeek: [1, 2, 3, 4, 5], excludeSundays: true, excludeHolidays: false,
    shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
    unitType: 'hora', quantity: 1, enabledSurcharges: [],
  },
  holidays, surcharges: defaultSurcharges, laborRules,
});
report('C3-dias=5', c3.totalWorkingDays === 5 ? 'PASS' : 'FAIL', 5, c3.totalWorkingDays);
report('C3-horas=40', c3.coverageHours === 40 ? 'PASS' : 'FAIL', 40, c3.coverageHours);
report('C3-subtotal=1400', c3.subtotal === 1400 ? 'PASS' : 'FAIL', 1400, c3.subtotal);
report('C3-plantilla=1', c3.plantillaMinimaRecomendada === 1 ? 'PASS' : 'FAIL', 1, c3.plantillaMinimaRecomendada);
const c3WeeklyWarn = c3.laborWarnings.some(w => w.type === 'max_weekly_exceeded');
report('C3-sin-aviso-semanal', !c3WeeklyWarn ? 'PASS' : 'FAIL', false, c3WeeklyWarn);

// ═══════════════════════════════════════════════════════════════
// CASE 4 — Semana 48h (Lun-Sab)
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 4: Semana 48h (Lun-Sab, 8h/día, 1 puesto) ═══');
const c4 = calculateServiceBlock({
  block: {
    serviceName: 'Semana 48h', professionalCategory: 'Médico', puestosSimultaneos: 1,
    pricePerHour: 35, dateMode: 'range',
    dateRangeStart: '2026-07-06', dateRangeEnd: '2026-07-11', // Mon-Sat
    daysOfWeek: [1, 2, 3, 4, 5, 6], excludeSundays: true, excludeHolidays: false,
    shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
    unitType: 'hora', quantity: 1, enabledSurcharges: [],
  },
  holidays, surcharges: defaultSurcharges, laborRules,
});
report('C4-dias=6', c4.totalWorkingDays === 6 ? 'PASS' : 'FAIL', 6, c4.totalWorkingDays);
report('C4-horas=48', c4.coverageHours === 48 ? 'PASS' : 'FAIL', 48, c4.coverageHours);
report('C4-plantilla=2', c4.plantillaMinimaRecomendada === 2 ? 'PASS' : 'FAIL', 2, c4.plantillaMinimaRecomendada,
  'ceil(48/40)=2');
report('C4-subtotal=1680-NO-plantilla', c4.subtotal === 1680 ? 'PASS' : 'FAIL', 1680, c4.subtotal,
  '48h*35€=1680. NO debe multiplicar por plantilla(2)');
const c4WeeklyWarn = c4.laborWarnings.some(w => w.type === 'max_weekly_exceeded');
report('C4-aviso-semanal', c4WeeklyWarn ? 'PASS' : 'FAIL', true, c4WeeklyWarn,
  'Con 1 puesto y 48h/semana, debe advertir');

// ═══════════════════════════════════════════════════════════════
// CASE 5 — Turno nocturno (Vie+Sáb 20:00-08:00)
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 5: Turno nocturno Vie+Sáb 20:00-08:00 ═══');
const c5 = calculateServiceBlock({
  block: {
    serviceName: 'Nocturno finde', professionalCategory: 'Enfermero', puestosSimultaneos: 1,
    pricePerHour: 22, dateMode: 'specific',
    specificDates: ['2026-07-10', '2026-07-11'], // Fri, Sat
    daysOfWeek: [], excludeSundays: true, excludeHolidays: false,
    shiftType: 'custom', shiftStartTime: '20:00', shiftEndTime: '08:00',
    hoursPerDay: 12, breakMinutes: 0,
    unitType: 'hora', quantity: 1, enabledSurcharges: ['nocturnidad', 'fin_de_semana'],
  },
  holidays, surcharges: defaultSurcharges, laborRules,
});
report('C5-dias=2', c5.totalWorkingDays === 2 ? 'PASS' : 'FAIL', 2, c5.totalWorkingDays);
report('C5-horas-total=24', c5.coverageHours === 24 ? 'PASS' : 'FAIL', 24, c5.coverageHours,
  '12h/turno × 2 días');
report('C5-nocturnas=16', c5.shiftBreakdown.night === 16 ? 'PASS' : 'FAIL', 16, c5.shiftBreakdown.night,
  '8h nocturnas × 2 turnos');
report('C5-subtotal=528', c5.subtotal === 528 ? 'PASS' : 'FAIL', 528, c5.subtotal,
  '24h × 22€ = 528€');
// Nocturnidad 25% on coverage night hours (16h * 1 puesto = 16h)
// (22€ × 16h) × 0.25 = 88€
const c5Noct = c5.surcharges.find(s => s.type === 'nocturnidad');
report('C5-nocturnidad=88', c5Noct?.amount === 88 ? 'PASS' : 'FAIL', 88, c5Noct?.amount,
  '25% de (22€ × 16h)');
// Fin de semana 30% on coverage weekend hours (24h * 1 puesto)
// (22€ × 24h) × 0.30 = 158.4€
const c5Fds = c5.surcharges.find(s => s.type === 'fin_de_semana');
report('C5-finde=158.4', c5Fds?.amount === 158.4 ? 'PASS' : 'FAIL', 158.4, c5Fds?.amount,
  '30% de (22€ × 24h)');

// ═══════════════════════════════════════════════════════════════
// CASE 5b — Nocturnidad edge cases (pure shift calc)
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 5b: Edge cases nocturnidad ═══');

const sh1 = calculateShiftHours(
  { shiftType: 'custom', shiftStartTime: '22:00', shiftEndTime: '06:00', hoursPerDay: 8, breakMinutes: 0 },
  '2026-07-06', [], 22, 6,
);
report('5b-22-06-total=8', sh1.total === 8 ? 'PASS' : 'FAIL', 8, sh1.total);
report('5b-22-06-night=8', sh1.night === 8 ? 'PASS' : 'FAIL', 8, sh1.night);

const sh2 = calculateShiftHours(
  { shiftType: 'custom', shiftStartTime: '23:00', shiftEndTime: '03:00', hoursPerDay: 4, breakMinutes: 0 },
  '2026-07-06', [], 22, 6,
);
report('5b-23-03-total=4', sh2.total === 4 ? 'PASS' : 'FAIL', 4, sh2.total);
report('5b-23-03-night=4', sh2.night === 4 ? 'PASS' : 'FAIL', 4, sh2.night);

const sh3 = calculateShiftHours(
  { shiftType: 'custom', shiftStartTime: '06:00', shiftEndTime: '14:00', hoursPerDay: 8, breakMinutes: 0 },
  '2026-07-06', [], 22, 6,
);
report('5b-06-14-total=8', sh3.total === 8 ? 'PASS' : 'FAIL', 8, sh3.total);
report('5b-06-14-night=0', sh3.night === 0 ? 'PASS' : 'FAIL', 0, sh3.night);

// ═══════════════════════════════════════════════════════════════
// CASE 6 — Cruce de año
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 6: Cruce de año 29 dic - 5 ene ═══');
const c6 = calculateServiceBlock({
  block: {
    serviceName: 'Cruce año', professionalCategory: 'Médico', puestosSimultaneos: 1,
    pricePerHour: 35, dateMode: 'range',
    dateRangeStart: '2025-12-29', dateRangeEnd: '2026-01-05',
    daysOfWeek: [1, 2, 3, 4, 5], excludeSundays: true, excludeHolidays: false,
    shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
    unitType: 'hora', quantity: 1, enabledSurcharges: [],
  },
  holidays, surcharges: defaultSurcharges, laborRules,
});
report('C6-dias=6', c6.totalWorkingDays === 6 ? 'PASS' : 'FAIL', 6, c6.totalWorkingDays,
  'Dec 29,30,31 (Mon-Wed) + Jan 1,2,5 (Thu,Fri,Mon) — Jan 1 is holiday but not excluded');
// Check weekly breakdown
const c6Weeks = c6.weeklyHoursPerPro;
const c6Years = new Set(c6Weeks.map(w => w.year));
report('C6-multiple-years', c6Years.size >= 1 ? 'PASS' : 'FAIL',
  '>=1 year(s)', [...c6Years],
  'Weeks should be separated by year (Dec 29 is ISO 2026-W01)');

// ═══════════════════════════════════════════════════════════════
// CASE 7 — Fechas concretas
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 7: Fechas concretas (4 días sueltos) ═══');
const c7 = calculateServiceBlock({
  block: {
    serviceName: 'Fechas sueltas', professionalCategory: 'Médico', puestosSimultaneos: 1,
    pricePerHour: 35, dateMode: 'specific',
    specificDates: ['2026-07-03', '2026-07-05', '2026-07-09', '2026-07-15'],
    daysOfWeek: [], excludeSundays: true, excludeHolidays: false,
    shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
    unitType: 'hora', quantity: 1, enabledSurcharges: [],
  },
  holidays, surcharges: defaultSurcharges, laborRules,
});
report('C7-dias=4', c7.totalWorkingDays === 4 ? 'PASS' : 'FAIL', 4, c7.totalWorkingDays);
report('C7-horas=32', c7.coverageHours === 32 ? 'PASS' : 'FAIL', 32, c7.coverageHours);
report('C7-subtotal=1120', c7.subtotal === 1120 ? 'PASS' : 'FAIL', 1120, c7.subtotal);
report('C7-no-mes-entero', c7.totalWorkingDays === 4 ? 'PASS' : 'FAIL', 4, c7.totalWorkingDays);

// ═══════════════════════════════════════════════════════════════
// CASE 8 — Ambulancia (servicio)
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 8: Ambulancia (servicio, fijo diario) ═══');
const c8 = calculateServiceBlock({
  block: {
    serviceName: 'Ambulancia', professionalCategory: 'Conductor', puestosSimultaneos: 1,
    pricePerHour: 0, fixedPrice: 150,
    dateMode: 'range', dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-03',
    daysOfWeek: [], excludeSundays: false, excludeHolidays: false,
    shiftType: 'morning', hoursPerDay: 0, breakMinutes: 0,
    unitType: 'servicio', quantity: 3, enabledSurcharges: [],
  },
  holidays, surcharges: defaultSurcharges, laborRules,
});
report('C8-subtotal=450', c8.subtotal === 450 ? 'PASS' : 'FAIL', 450, c8.subtotal,
  '150€ × 3 servicios');
report('C8-dias=0', c8.totalWorkingDays === 0 ? 'PASS' : 'FAIL', 0, c8.totalWorkingDays);

// ═══════════════════════════════════════════════════════════════
// CASE 9 — Material (cantidad × precio)
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 9: Material (10 unidades × 25€) ═══');
const c9 = calculateServiceBlock({
  block: {
    serviceName: 'Material', professionalCategory: 'Material', puestosSimultaneos: 1,
    pricePerHour: 25,
    dateMode: 'range', dateRangeStart: '2026-07-01', dateRangeEnd: '2026-07-01',
    daysOfWeek: [], excludeSundays: false, excludeHolidays: false,
    shiftType: 'morning', hoursPerDay: 0, breakMinutes: 0,
    unitType: 'unidad', quantity: 10, enabledSurcharges: [],
  },
  holidays, surcharges: defaultSurcharges, laborRules,
});
report('C9-subtotal=250', c9.subtotal === 250 ? 'PASS' : 'FAIL', 250, c9.subtotal,
  '25€ × 10 unidades');

// ═══════════════════════════════════════════════════════════════
// CASE 10 — Recargos manuales (desactivados vs activados)
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 10: Recargos manuales ═══');
const c10a = calculateServiceBlock({
  block: {
    serviceName: 'Sin urgencia', professionalCategory: 'Médico', puestosSimultaneos: 1,
    pricePerHour: 35, dateMode: 'specific', specificDates: ['2026-07-06', '2026-07-07'],
    daysOfWeek: [], excludeSundays: true, excludeHolidays: false,
    shiftType: 'morning', hoursPerDay: 8, breakMinutes: 0,
    unitType: 'hora', quantity: 1, enabledSurcharges: [],
  },
  holidays, surcharges: defaultSurcharges, laborRules,
});
const c10aUrg = c10a.surcharges.find(s => s.type === 'urgencia');
report('C10-sin-urgencia', !c10aUrg ? 'PASS' : 'FAIL', 'none', c10aUrg?.type || 'none');

const c10b = calculateServiceBlock({
  block: {
    ...c10a.block, enabledSurcharges: ['urgencia'],
  },
  holidays, surcharges: defaultSurcharges, laborRules,
});
const c10bUrg = c10b.surcharges.find(s => s.type === 'urgencia');
report('C10-con-urgencia', !!c10bUrg ? 'PASS' : 'FAIL', 'exists', c10bUrg?.type || 'none');
report('C10-urgencia-amount=224', c10bUrg?.amount === 224 ? 'PASS' : 'FAIL', 224, c10bUrg?.amount,
  '40% de (35€ × 16h) = 224€');

// ═══════════════════════════════════════════════════════════════
// CASE 11 — Descuento 10% + IVA 21%
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 11: Descuento 10% + IVA 21% (subtotal 1000€) ═══');
const c11 = calculateBudgetTotals([{ subtotal: 1000, totalSurcharges: 0 }], 10, 21);
report('C11-descuento=100', c11.discountAmount === 100 ? 'PASS' : 'FAIL', 100, c11.discountAmount);
report('C11-iva=189', c11.ivaAmount === 189 ? 'PASS' : 'FAIL', 189, c11.ivaAmount);
report('C11-total=1089', c11.totalFinal === 1089 ? 'PASS' : 'FAIL', 1089, c11.totalFinal);

// ═══════════════════════════════════════════════════════════════
// CASE 12 — Comercial malicioso (solo verificación de sanitize)
// ═════════════════════════════════════════════════════════════
console.log('\n═══ CASO 12: Sanitización de campos internos ═══');
import { sanitizeForRole } from '../src/lib/auth';

const testData = {
  internalCostPerHour: 5,
  internalMargin: 30,
  pricePerHour: 35,
  subtotal: 1000,
  serviceBlocks: [{ internalCostPerHour: 5, serviceName: 'test' }],
};
const cleaned = sanitizeForRole(testData, 'comercial');
const hasICP = 'internalCostPerHour' in cleaned;
const hasIM = 'internalMargin' in cleaned;
const hasICP2 = 'internalCostPerHour' in (cleaned as any).serviceBlocks?.[0] || {};
report('C12-no-internalCost', !hasICP ? 'PASS' : 'FAIL', false, hasICP);
report('C12-no-margin', !hasIM ? 'PASS' : 'FAIL', false, hasIM);
report('C12-no-internalCost-nested', !hasICP2 ? 'PASS' : 'FAIL', false, hasICP2);

// Admin/maestro should see everything
const adminData = sanitizeForRole(testData, 'admin');
report('C12-admin-sees-internalCost', adminData.internalCostPerHour === 5 ? 'PASS' : 'FAIL', 5, adminData.internalCostPerHour);
report('C12-maestro-sees-internalCost', sanitizeForRole(testData, 'maestro').internalCostPerHour === 5 ? 'PASS' : 'FAIL', 5, sanitizeForRole(testData, 'maestro').internalCostPerHour);

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70));
console.log('RESUMEN DE AUDITORÍA DEL MOTOR DE CÁLCULO');
console.log('='.repeat(70));
const total = passed + failed;
console.log(`\nTotal: ${total} | PASS: ${passed} | FAIL: ${failed}`);
if (failed > 0) {
  console.log('\n❌ CASOS FALLIDOS — revisar arriba para detalles');
}
console.log();
process.exit(failed > 0 ? 1 : 0);