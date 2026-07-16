// ─── Shared TypeScript Types ──────────────────────────────────────

export type UserRole = 'maestro' | 'admin' | 'comercial' | 'gestor' | 'readonly';
export type BudgetStatus = 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'caducado';
export type DateMode = 'specific' | 'range';
export type ShiftType = 'morning' | 'afternoon' | 'night' | '24h' | 'custom';
export type UnitType = 'hora' | 'dia' | 'servicio' | 'kilometro' | 'unidad' | 'turno' | 'curso';
export type BlockType = 'profesional_hora' | 'servicio_fijo' | 'material' | 'desplazamiento' | 'dietas' | 'alojamiento' | 'ambulancia' | 'telemedicina' | 'curso' | 'otros';
export type CourseModality = 'presencial' | 'online' | 'mixta';
export type ServiceContractType = 'indefinido' | 'temporal' | 'fijo_discontinuo' | 'mercantil_autonomo';
export type SurchargeKind = 'percentage' | 'fixed' | 'multiplier' | 'special_price';
export type HolidayType = 'nacional' | 'autonomico' | 'provincial' | 'municipal';
export type SurchargeType =
  | 'nocturnidad' | 'domingo' | 'festivo' | 'urgencia'
  | 'dificil_cobertura' | 'desplazamiento' | 'guardia_24h'
  | 'fin_de_semana' | 'municipio_especial' | 'servicio_premium'
  | 'festivo_nacional' | 'festivo_autonomico' | 'festivo_provincial' | 'festivo_municipal'
  | 'special_price';

// ─── API DTOs ────────────────────────────────────────────────────

export interface ClientDTO {
  id?: string;
  businessName: string;
  cif: string;
  fiscalAddress: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  sector?: string;
  paymentTerms?: string;
  notes?: string;
}

export interface ServiceBlockInput {
  id?: string;
  blockType?: BlockType;
  serviceName: string;
  professionalCategory: string;
  puestosSimultaneos: number;
  plantillaSeleccionada?: number;
  pricePerHour: number;
  internalCostPerHour?: number;
  internalMargin?: number;
  /** Modalidad prevista de contratación. Obligatoria para valorar el coste laboral. */
  contractType?: ServiceContractType;
  dateMode: DateMode;
  dateUIMode?: 'weekly' | 'specific' | 'month'; // modo de UI persistido (calendario)
  specificDates?: string[];
  dateRangeStart?: string;
  dateRangeEnd?: string;
  daysOfWeek?: number[];
  excludeSundays: boolean;
  excludeHolidays: boolean;
  holidayTypesExcluded?: HolidayType[];
  shiftType: ShiftType;
  shiftStartTime?: string;
  shiftEndTime?: string;
  hoursPerDay: number;
  breakMinutes: number;
  unitType: UnitType;
  quantity: number;
  fixedPrice?: number;
  observations?: string;
  enabledSurcharges?: SurchargeType[];
  // Extra fields for special block types
  courseName?: string;
  courseTeacher?: string;
  courseModality?: CourseModality;
  courseSessions?: number;
  materialName?: string;
  accommodationNights?: number;
  accommodationPersons?: number;
  transportType?: string;
}

export interface BudgetInput {
  id?: string;
  clientId: string;
  description?: string;
  validUntil?: string;
  status?: BudgetStatus;
  discountPercent?: number;
  ivaPercent?: number;
  clientNotes?: string;
  internalNotes?: string;
  serviceLocationId?: string;
  serviceAutonomousCommunity?: string;
  serviceProvince?: string;
  serviceMunicipality?: string;
  serviceBlocks?: ServiceBlockInput[];
}

// ─── Calculation Types ───────────────────────────────────────────

export interface DateConfig {
  dateMode: DateMode;
  specificDates?: string[];
  dateRangeStart?: string;
  dateRangeEnd?: string;
  daysOfWeek?: number[];
  excludeSundays: boolean;
  excludeHolidays: boolean;
  holidayTypesExcluded?: HolidayType[];
}

export interface ShiftConfig {
  shiftType: ShiftType;
  shiftStartTime?: string;
  shiftEndTime?: string;
  hoursPerDay: number;
  breakMinutes: number;
}

export interface ShiftHourBreakdown {
  total: number;
  regular: number;
  night: number;
  sunday: number;
  holiday: number;
  holidayNational: number;
  holidayAutonomico: number;
  holidayProvincial: number;
  holidayMunicipal: number;
  weekend: number;
}

export interface HolidayInfo {
  date: string;
  name: string;
  type: HolidayType;
  autonomousCommunity?: string;
  province?: string;
  municipality?: string;
  /** Si true, el festivo coincide por mes-día en cualquier año (ej: 01-01, 25-12). Por defecto false (solo fecha exacta). */
  recurring?: boolean;
}

export interface LaborWarning {
  type: 'max_weekly_exceeded' | 'max_daily_exceeded' | 'consecutive_days' | 'overtime_needed' | 'night_shift' | '24h_shift' | 'continuous_coverage' | 'rest_violation' | 'staff_deficit';
  severity: 'info' | 'warning' | 'error';
  message: string;
  weekKey?: string;
  details?: string;
}

export interface SurchargeEntry {
  type: SurchargeType;
  name: string;
  hours: number;
  surchargeType: SurchargeKind;
  value: number;
  amount: number;
}

export interface WeeklyHoursEntry {
  weekKey: string; // "2026-W28"
  year: number;
  week: number;
  hours: number;
}

export interface BlockCalculationResult {
  workingDates: string[];
  totalWorkingDays: number;
  hoursPerPosition: number;
  coverageHours: number;
  totalHours: number;
  shiftBreakdown: ShiftHourBreakdown;
  surcharges: SurchargeEntry[];
  totalSurcharges: number;
  puestosSimultaneos: number;
  plantillaMinimaRecomendada: number;
  plantillaSeleccionada: number;
  deficitPlantilla: number;
  weeklyHoursPerPro: WeeklyHoursEntry[];
  overtimeHours: number;
  laborWarnings: LaborWarning[];
  subtotal: number;
  totalWithSurcharges: number;
}

export interface BudgetCalculationResult {
  blocks: BlockCalculationResult[];
  subtotal: number;
  totalSurcharges: number;
  discountAmount: number;
  ivaAmount: number;
  totalFinal: number;
  calculationToken?: string;
  commercial?: {
    status: 'calculated' | 'pending_configuration' | 'blocked_closing_price';
    initialPriceExVat?: number;
    closingPriceExVat?: number;
    discountAmount?: number;
    discountPercent?: number;
    maximumDiscountPercent?: number;
    semaphore?: 'green' | 'yellow' | 'red';
    requiresAuthorization: boolean;
    pendingFields?: string[];
  };
}

// ─── Config Types ────────────────────────────────────────────────

export interface SurchargeConfigDTO {
  id?: string;
  name: string;
  type: SurchargeType;
  surchargeType: SurchargeKind;
  value: number;
  description?: string;
  active?: boolean;
}

export interface CategoryDTO {
  id?: string;
  name: string;
  description?: string;
  defaultPricePerHour: number;
  defaultInternalCost?: number;
  active?: boolean;
}

export interface LaborRuleDTO {
  id?: string;
  name: string;
  maxWeeklyHours: number;
  maxDailyHours: number;
  minRestBetweenShiftsH: number;
  maxConsecutiveDays: number;
  nightStartHour: number;
  nightEndHour: number;
}

// ─── App State ───────────────────────────────────────────────────

export type AppView =
  | 'dashboard'
  | 'budget-new'
  | 'budget-edit'
  | 'clients'
  | 'communications'
  | 'admin'
  | 'history';
