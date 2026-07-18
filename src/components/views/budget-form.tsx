'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  AlertTriangle,
  Info,
  Calculator,
  Users,
  Clock,
  Calendar,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  FileText,
  Download,
} from 'lucide-react';
import { useAppStore, emptyBlock, BLOCK_TYPE_PRESETS, SIMPLE_BLOCK_TYPES } from '@/store/app-store';
import {
  AUTONOMOUS_COMMUNITIES,
  buildServiceLocation,
  DEFAULT_SERVICE_LOCATION_ID,
  getMunicipalitiesForProvince,
  getProvincesForCommunity,
  getServiceLocation,
  resolveServiceLocation,
} from '@/lib/service-locations';
import { calculateWorkingDates, findHolidayForDate } from '@/lib/schedule-engine';
import { filterHolidaysForLocation } from '@/lib/holiday-location';
import { splitServiceBlockForReinforcement } from '@/lib/service-block-clone';
import type {
  ServiceBlockInput,
  DateMode,
  ShiftType,
  UnitType,
  BlockType,
  BlockCalculationResult,
  HolidayType,
  BudgetCalculationResult,
  LaborWarning,
  SurchargeEntry,
  ShiftHourBreakdown,
  CourseModality,
  ServiceContractType,
} from '@/lib/types';
import { toast } from 'sonner';

// ─── Formatting helpers ─────────────────────────────────────────

function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatCurrency(value: unknown): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeNumber(value));
}

function formatNumber(value: unknown, decimals = 2): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safeNumber(value));
}

// ─── Constants ──────────────────────────────────────────────────

const SHIFT_HOURS: Record<string, number> = {
  morning: 8,
  afternoon: 6,
  night: 8,
  '24h': 24,
  custom: 8,
};

const SHIFT_LABELS: Record<string, string> = {
  morning: 'Mañana (7:00 – 15:00)',
  afternoon: 'Tarde (15:00 – 21:00)',
  night: 'Noche (21:00 – 7:00)',
  '24h': '24 horas',
  custom: 'Personalizado',
};

const SHIFT_TIMES: Record<string, { start: string; end: string }> = {
  morning: { start: '07:00', end: '15:00' },
  afternoon: { start: '15:00', end: '21:00' },
  night: { start: '21:00', end: '07:00' },
  '24h': { start: '00:00', end: '23:59' },
  custom: { start: '', end: '' },
};

const DAY_LABELS = [
  { value: 1, label: 'L' },
  { value: 2, label: 'M' },
  { value: 3, label: 'X' },
  { value: 4, label: 'J' },
  { value: 5, label: 'V' },
  { value: 6, label: 'S' },
  { value: 0, label: 'D' },
];

const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  nacional: 'Nacional',
  autonomico: 'Autonómico',
  provincial: 'Provincial',
  municipal: 'Municipal',
};

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  caducado: 'Caducado',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  borrador: 'secondary',
  enviado: 'outline',
  aceptado: 'default',
  rechazado: 'destructive',
  caducado: 'outline',
};

const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  hora: 'Hora',
  dia: 'Día',
  servicio: 'Servicio',
  kilometro: 'Kilómetro',
  unidad: 'Unidad',
  turno: 'Turno',
  curso: 'Curso',
};

const TIME_BASED_UNITS: UnitType[] = ['hora', 'dia', 'turno'];

const CONTRACT_TYPE_LABELS: Partial<Record<ServiceContractType, string>> = {
  indefinido: 'Indefinido',
  temporal: 'Temporal (requiere causa)',
  fijo_discontinuo: 'Fijo discontinuo',
};

// ─── Date mode labels ─────────────────────────────────────────
type DateUIMode = 'weekly' | 'specific' | 'month';

const DATE_MODE_OPTIONS: { value: DateUIMode; label: string; desc: string }[] = [
  { value: 'weekly', label: 'Repetición semanal', desc: 'Inicio + fin + días de la semana' },
  { value: 'specific', label: 'Días concretos', desc: 'Calendario visual mensual' },
  { value: 'month', label: 'Mes completo', desc: 'Mes + patrón de días' },
];

const MONTH_PRESETS: { label: string; days: number[] }[] = [
  { label: 'Solo L-V', days: [1, 2, 3, 4, 5] },
  { label: 'L-S', days: [1, 2, 3, 4, 5, 6] },
  { label: 'Todos los días', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Solo fines de semana', days: [0, 6] },
];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  profesional_hora: 'Profesional por hora',
  servicio_fijo: 'Servicio fijo',
  material: 'Material',
  desplazamiento: 'Desplazamiento',
  dietas: 'Dietas',
  alojamiento: 'Alojamiento',
  ambulancia: 'Ambulancia/Transporte sanitario',
  telemedicina: 'Telemedicina',
  curso: 'Curso/Formación',
  otros: 'Otros',
};

const MODALITY_LABELS: Record<CourseModality, string> = {
  presencial: 'Presencial',
  online: 'Online',
  mixta: 'Mixta',
};

// ─── Component ──────────────────────────────────────────────────

export interface BudgetFormProps {
  /** Reutiliza el formulario real dentro de otro recorrido sin cambiar el flujo clásico. */
  embedded?: boolean;
  /** Se ejecuta únicamente después de que el motor determinista devuelve un cálculo válido. */
  onCalculated?: (result: BudgetCalculationResult) => void;
}

export default function BudgetForm({ embedded = false, onCalculated }: BudgetFormProps = {}) {
  const store = useAppStore();
  const isAdmin = store.currentRole === 'admin' || store.currentRole === 'maestro';
  const isEditing = !!store.editingBudgetId;

  // Local UI state
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set());
  const [specificDatesText, setSpecificDatesText] = useState<Record<number, string>>({});
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [addBlockMenuOpen, setAddBlockMenuOpen] = useState(false);
  const [calculationPending, setCalculationPending] = useState<string[]>([]);
  const selectedCommunity = store.budgetForm.serviceAutonomousCommunity || 'Madrid';
  const selectedProvince = store.budgetForm.serviceProvince || 'Madrid';
  const availableProvinces = useMemo(() => getProvincesForCommunity(selectedCommunity), [selectedCommunity]);
  const availableMunicipalities = useMemo(
    () => getMunicipalitiesForProvince(selectedCommunity, selectedProvince),
    [selectedCommunity, selectedProvince],
  );

  // ─── Data fetching on mount ──────────────────────────────────

  useEffect(() => {
    async function loadData() {
      store.setLoading(true);
      try {
        const [catRes, clientRes, configRes] = await Promise.all([
          fetch('/api/config?type=categories'),
          fetch('/api/clients'),
          fetch('/api/config?type=appConfig'),
        ]);

        if (catRes.ok) {
          const catData = await catRes.json();
          store.setCategories(catData);
        }
        if (clientRes.ok) {
          const clientData = await clientRes.json();
          store.setClients(clientData);
        }
        if (configRes.ok) {
          const configData = await configRes.json();
          store.setAppConfig(configData);
        }

        // If editing, load existing budget
        if (store.editingBudgetId) {
          const budgetRes = await fetch('/api/budgets');
          if (budgetRes.ok) {
            const allBudgets = await budgetRes.json();
            const budgetList = Array.isArray(allBudgets)
              ? allBudgets
              : Array.isArray(allBudgets?.budgets)
                ? allBudgets.budgets
                : [];
            const budget = budgetList.find((b: { id?: string }) => b.id === store.editingBudgetId);
            if (budget) {
              const storedLocation = resolveServiceLocation({
                id: budget.serviceLocationId,
                cc: budget.serviceAutonomousCommunity,
                province: budget.serviceProvince,
                municipality: budget.serviceMunicipality,
              }) ?? getServiceLocation(DEFAULT_SERVICE_LOCATION_ID);
              store.setBudgetForm({
                clientId: budget.clientId || '',
                description: budget.description || '',
                validUntil: budget.validUntil || '',
                status: budget.status || 'borrador',
                discountPercent: budget.discountPercent || 0,
                ivaPercent: budget.ivaPercent ?? 21,
                clientNotes: budget.clientNotes || '',
                internalNotes: budget.internalNotes || '',
                serviceLocationId: storedLocation.id,
                serviceAutonomousCommunity: storedLocation.autonomousCommunity,
                serviceProvince: storedLocation.province,
                serviceMunicipality: storedLocation.municipality,
              });
              // Sync IVA mode with loaded value
              if (budget.serviceBlocks && Array.isArray(budget.serviceBlocks)) {
                store.setServiceBlocks(budget.serviceBlocks.map((block: ServiceBlockInput) => ({
                  ...block,
                  ivaPercent: block.ivaPercent ?? budget.ivaPercent ?? 21,
                })));
                // Initialize specific dates text for blocks with specific mode
                const newTexts: Record<number, string> = {};
                budget.serviceBlocks.forEach((b: ServiceBlockInput, i: number) => {
                  if (b.dateMode === 'specific' && b.specificDates) {
                    newTexts[i] = b.specificDates.join(', ');
                  }
                });
                setSpecificDatesText(newTexts);
                // Expand all blocks when editing
                const allExpanded = new Set<number>(budget.serviceBlocks.map((_: ServiceBlockInput, i: number) => i));
                setExpandedBlocks(allExpanded);
              }
            }
          }
        } else {
          // New budget: start with one empty block
          store.addServiceBlock({ ...emptyBlock });
          setExpandedBlocks(new Set([0]));
        }
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Error al cargar los datos iniciales');
      } finally {
        store.setLoading(false);
        setDataLoaded(true);
      }
    }
    loadData();
  }, []);

  // ─── Handlers ────────────────────────────────────────────────

  const toggleBlock = useCallback((index: number) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleAddBlock = useCallback((blockType: BlockType = 'profesional_hora') => {
    const preset = BLOCK_TYPE_PRESETS[blockType];
    const newBlock = { ...preset.block, ivaPercent: store.budgetForm.ivaPercent ?? 21 };
    store.addServiceBlock(newBlock);
    const nextIndex = store.serviceBlocks.length;
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      next.add(nextIndex);
      return next;
    });
    setAddBlockMenuOpen(false);
  }, [store]);

  const handleCloneReinforcementBlock = useCallback((index: number, result: BlockCalculationResult) => {
    const source = store.serviceBlocks[index];
    if (!source) return;
    try {
      const split = splitServiceBlockForReinforcement({
        source,
        workingDates: result.workingDates,
        professionals: result.plantillaMinimaRecomendada,
      });
      const next = [...store.serviceBlocks.slice(0, index), ...split, ...store.serviceBlocks.slice(index + 1)];
      store.setServiceBlocks(next);
      store.setBlockResults([]);
      store.setBudgetTotals(null);
      setExpandedBlocks((previous) => {
        const expanded = new Set(previous);
        expanded.delete(index);
        split.forEach((_, offset) => expanded.add(index + offset));
        return expanded;
      });
      toast.success(`Cobertura repartida entre ${split.length} ficha(s), sin duplicar las horas del cliente. Pulsa Calcular.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo repartir la cobertura');
    }
  }, [store]);

  const handleRemoveBlock = useCallback(
    (index: number) => {
      store.removeServiceBlock(index);
      const newResults = [...store.blockResults];
      newResults.splice(index, 1);
      store.setBlockResults(newResults);

      if (store.serviceBlocks.length <= 1) {
        store.setBudgetTotals({
          blocks: [],
          subtotal: 0,
          totalSurcharges: 0,
          discountAmount: 0,
          ivaAmount: 0,
          totalFinal: 0,
        });
        toast.info('Presupuesto sin bloques. Añade al menos un bloque para guardar.');
      }

      setExpandedBlocks((prev) => {
        const next = new Set<number>();
        prev.forEach((i) => {
          if (i < index) next.add(i);
          else if (i > index) next.add(i - 1);
        });
        return next;
      });
      const newTexts: Record<number, string> = {};
      Object.entries(specificDatesText).forEach(([key, val]) => {
        const k = Number(key);
        if (k < index) newTexts[k] = val;
        else if (k > index) newTexts[k - 1] = val;
      });
      setSpecificDatesText(newTexts);
    },
    [store, specificDatesText]
  );

  const handleCategoryChange = useCallback(
    (index: number, categoryId: string) => {
      store.updateServiceBlock(index, {
        professionalCategory: categoryId,
        pricePerHour: 0,
        internalCostPerHour: undefined,
      });
    },
    [store]
  );

  const handleShiftTypeChange = useCallback(
    (index: number, shiftType: ShiftType) => {
      const hours = SHIFT_HOURS[shiftType] || 8;
      const times = SHIFT_TIMES[shiftType] || { start: '', end: '' };
      store.updateServiceBlock(index, {
        shiftType,
        hoursPerDay: hours,
        shiftStartTime: times.start,
        shiftEndTime: times.end,
      });
    },
    [store]
  );

  const handleDayToggle = useCallback(
    (index: number, day: number) => {
      const block = store.serviceBlocks[index];
      if (!block) return;
      const currentDays = block.daysOfWeek ?? [1, 2, 3, 4, 5];
      const newDays = currentDays.includes(day)
        ? currentDays.filter((d) => d !== day)
        : [...currentDays, day].sort();
      store.updateServiceBlock(index, { daysOfWeek: newDays });
    },
    [store]
  );

  const handleHolidayTypeToggle = useCallback(
    (index: number, hType: HolidayType) => {
      const block = store.serviceBlocks[index];
      if (!block) return;
      const current = block.holidayTypesExcluded ?? ['nacional', 'autonomico'];
      const newTypes = current.includes(hType)
        ? current.filter((t) => t !== hType)
        : [...current, hType];
      store.updateServiceBlock(index, { holidayTypesExcluded: newTypes });
    },
    [store]
  );

  const handleSpecificDatesTextChange = useCallback(
    (index: number, text: string) => {
      setSpecificDatesText((prev) => ({ ...prev, [index]: text }));
      const dates = text
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d.length > 0);
      store.updateServiceBlock(index, { specificDates: dates });
    },
    [store]
  );

  // ─── Calendar UI state for "Días concretos" mode ──────────
  const [calendarMonth, setCalendarMonth] = useState<Record<number, { year: number; month: number }>>({});
  const applicableHolidays = useMemo(() => filterHolidaysForLocation(store.holidays, {
    cc: store.budgetForm.serviceAutonomousCommunity,
    province: store.budgetForm.serviceProvince,
    municipality: store.budgetForm.serviceMunicipality,
  }), [store.holidays, store.budgetForm.serviceAutonomousCommunity, store.budgetForm.serviceProvince, store.budgetForm.serviceMunicipality]);
  const getCalendarMonth = useCallback((index: number) => {
    if (!calendarMonth[index]) {
      const now = new Date();
      setCalendarMonth((p) => ({ ...p, [index]: { year: now.getFullYear(), month: now.getMonth() } }));
      return { year: now.getFullYear(), month: now.getMonth() };
    }
    return calendarMonth[index];
  }, [calendarMonth]);

  const handleCalendarNav = useCallback((index: number, delta: number) => {
    setCalendarMonth((prev) => {
      const cur = prev[index] || { year: new Date().getFullYear(), month: new Date().getMonth() };
      let m = cur.month + delta;
      let y = cur.year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      return { ...prev, [index]: { year: y, month: m } };
    });
  }, []);

  const handleCalendarToggle = useCallback((index: number, dateStr: string) => {
    const block = store.serviceBlocks[index];
    if (!block) return;
    const current = block.specificDates ?? [];
    const newDates = current.includes(dateStr)
      ? current.filter((d) => d !== dateStr)
      : [...current, dateStr].sort();
    store.updateServiceBlock(index, { specificDates: newDates, dateMode: 'specific' as DateMode });
  }, [store]);

  // ─── Month preset handler for "Mes completo" mode ─────────
  const handleMonthPreset = useCallback((index: number, days: number[]) => {
    store.updateServiceBlock(index, { daysOfWeek: days, excludeSundays: !days.includes(0) });
  }, [store]);

  // ─── Map DateUIMode → store DateMode + update block ────────
  const getDateUIMode = useCallback((block: ServiceBlockInput): DateUIMode => {
    // El modo elegido por el usuario manda (persistido). La inferencia es solo
    // fallback para presupuestos antiguos sin dateUIMode.
    if (block.dateUIMode) return block.dateUIMode;
    // Infer current UI mode from block state
    if (block.dateMode === 'specific' && block.specificDates && block.specificDates.length > 0 && !block.dateRangeStart) return 'specific';
    if (block.dateMode === 'range' && block.dateRangeStart && block.dateRangeEnd) {
      // Check if it's a full-month range (day=1 to last day)
      const startDay = block.dateRangeStart.split('-')[2];
      if (startDay === '01') return 'month';
    }
    return 'weekly';
  }, []);

  const handleDateUIModeChange = useCallback((index: number, mode: DateUIMode) => {
    const block = store.serviceBlocks[index];
    if (!block) return;
    switch (mode) {
      case 'weekly':
        store.updateServiceBlock(index, {
          dateUIMode: 'weekly',
          dateMode: 'range' as DateMode,
          specificDates: [],
          daysOfWeek: block.daysOfWeek?.length ? block.daysOfWeek : [1, 2, 3, 4, 5],
        });
        break;
      case 'specific':
        store.updateServiceBlock(index, {
          dateUIMode: 'specific',
          dateMode: 'specific' as DateMode,
          dateRangeStart: undefined,
          dateRangeEnd: undefined,
          specificDates: block.specificDates ?? [],
        });
        break;
      case 'month':
        store.updateServiceBlock(index, {
          dateUIMode: 'month',
          dateMode: 'range' as DateMode,
          specificDates: [],
          daysOfWeek: block.daysOfWeek?.length ? block.daysOfWeek : [1, 2, 3, 4, 5],
        });
        break;
    }
  }, [store]);

  const handleCalculate = useCallback(async () => {
    if (store.serviceBlocks.length === 0) {
      toast.error('Añade al menos un bloque de servicio');
      return;
    }
    for (let i = 0; i < store.serviceBlocks.length; i++) {
      const b = store.serviceBlocks[i];
      const label = `Bloque ${i + 1}`;
      const isSimple = SIMPLE_BLOCK_TYPES.includes(b.blockType as BlockType);
      if (!isSimple) {
        if (!b.professionalCategory) { toast.error(`${label}: selecciona categoría profesional`); return; }
        if (!b.contractType) { toast.error(`${label}: selecciona el tipo de contratación`); return; }
        if (b.contractType === 'mercantil_autonomo') {
          toast.error(`${label}: mercantil/autónomo requiere una valoración separada y no puede calcularse como relación laboral.`);
          return;
        }
        if (safeNumber(b.puestosSimultaneos) < 1) { toast.error(`${label}: debe haber al menos 1 puesto`); return; }
        if (safeNumber(b.plantillaSeleccionada) < 1) { toast.error(`${label}: plantilla mínima 1`); return; }
        if ((b.unitType === 'hora' || b.unitType === 'dia' || b.unitType === 'turno') && b.dateMode === 'range') {
          if (!b.dateRangeStart) { toast.error(`${label}: falta fecha inicio`); return; }
          if (!b.dateRangeEnd) { toast.error(`${label}: falta fecha fin`); return; }
          if (b.dateRangeEnd < b.dateRangeStart) { toast.error(`${label}: la fecha fin no puede ser anterior a la fecha inicio`); return; }
          if (safeNumber(b.hoursPerDay) <= 0) { toast.error(`${label}: horas/día debe ser mayor que 0`); return; }
        }
      } else {
        if (safeNumber(b.quantity) <= 0 && !b.fixedPrice) { toast.error(`${label}: cantidad o precio debe ser mayor que 0`); return; }
        const unitPrice = b.fixedPrice ?? b.pricePerHour;
        if (safeNumber(unitPrice) < 0) { toast.error(`${label}: el precio no puede ser negativo`); return; }
      }
    }
    setCalculating(true);
    try {
      const payload = {
        blocks: store.serviceBlocks,
        discountPercent: store.budgetForm.discountPercent ?? 0,
        ivaPercent: store.budgetForm.ivaPercent ?? 21,
        location: {
          id: store.budgetForm.serviceLocationId,
          cc: store.budgetForm.serviceAutonomousCommunity,
          province: store.budgetForm.serviceProvince,
          municipality: store.budgetForm.serviceMunicipality || undefined,
        },
      };
      const res = await fetch('/api/calculations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error('Error en el cálculo');
      }
      const data = await res.json();
      const blocks = Array.isArray(data.blocks) ? data.blocks : [];
      if (data.commercial?.status === 'pending_configuration') {
        const pendingFields = Array.isArray(data.commercial.pendingFields)
          ? data.commercial.pendingFields
          : [];
        store.setBlockResults(blocks);
        store.setBudgetTotals(null);
        setCalculationPending(pendingFields);
        toast.error('Faltan datos económicos. El presupuesto permanece en borrador.');
        return;
      }
      const totals = {
        blocks,
        subtotal: safeNumber(data.totals?.subtotal),
        totalSurcharges: safeNumber(data.totals?.totalSurcharges),
        discountAmount: safeNumber(data.totals?.discountAmount),
        ivaAmount: safeNumber(data.totals?.ivaAmount),
        totalFinal: safeNumber(data.totals?.totalFinal),
        calculationToken: data.totals?.calculationToken,
        commercial: data.commercial,
      };
      store.setBlockResults(blocks);
      store.setBudgetTotals(totals);
      setCalculationPending([]);
      toast.success('Cálculo realizado correctamente');
      const allExpanded = new Set(store.serviceBlocks.map((_, i) => i));
      setExpandedBlocks(allExpanded);
      onCalculated?.(totals);
    } catch (error) {
      console.error('Calculation error:', error);
      toast.error('Error al realizar el cálculo');
    } finally {
      setCalculating(false);
    }
  }, [store, onCalculated]);

  const handleSave = useCallback(async () => {
    if (!store.budgetForm.clientId) {
      toast.error('Seleccione un cliente');
      return;
    }
    if (store.serviceBlocks.length === 0) {
      toast.error('Añade al menos un bloque de servicio para guardar');
      return;
    }
    if (!store.budgetTotals) {
      toast.error('Calcula el presupuesto antes de guardarlo');
      return;
    }
    const totalsFinal = safeNumber(store.budgetTotals.totalFinal);
    if (totalsFinal <= 0) {
      toast.error('El presupuesto tiene totales no válidos. Vuelve a calcular.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...store.budgetForm,
        serviceBlocks: store.serviceBlocks.map((block, index) => ({
          ...block,
          ...(store.blockResults[index] ?? {}),
          blockSubtotal: safeNumber(store.blockResults[index]?.initialPriceExVat ?? store.blockResults[index]?.subtotal),
        })),
        subtotal: safeNumber(store.budgetTotals.subtotal),
        totalSurcharges: safeNumber(store.budgetTotals.totalSurcharges),
        discountAmount: safeNumber(store.budgetTotals.discountAmount),
        ivaAmount: safeNumber(store.budgetTotals.ivaAmount),
        totalFinal: totalsFinal,
        calculationToken: store.budgetTotals.calculationToken,
      };

      let res: Response;
      if (isEditing && store.editingBudgetId) {
        res = await fetch('/api/budgets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: store.editingBudgetId, ...payload }),
        });
      } else {
        res = await fetch('/api/budgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        throw new Error('Error al guardar');
      }

      const saved = await res.json();
      const savedBudget = saved.budget ?? saved;
      if (savedBudget?.id) {
        store.editBudget(savedBudget.id);
      }
      toast.success(isEditing ? 'Presupuesto actualizado' : 'Presupuesto creado');
      store.setView('dashboard');
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Error al guardar el presupuesto');
    } finally {
      setSaving(false);
    }
  }, [store, isEditing]);

  const handleExportPdf = useCallback(() => {
    if (!store.editingBudgetId) {
      toast.error('Guarda el presupuesto antes de generar PDF');
      return;
    }
    window.open(`/api/pdf?id=${store.editingBudgetId}`, '_blank');
  }, [store.editingBudgetId]);

  const handleExportCommercialPdf = useCallback(() => {
    if (!store.editingBudgetId) {
      toast.error('Guarda el presupuesto antes de generar PDF');
      return;
    }
    window.open(`/api/pdf?id=${store.editingBudgetId}&mode=commercial`, '_blank');
  }, [store.editingBudgetId]);

  const handleBack = useCallback(() => {
    store.resetBudgetForm();
    store.setView('dashboard');
  }, [store]);

  const maxDiscount = Math.max(
    0,
    Math.floor(safeNumber(store.budgetTotals?.commercial?.maximumDiscountPercent, 5)),
  );
  const canExportCommercialPdf = ['comercial', 'admin', 'maestro'].includes(store.currentRole);

  // ─── Sub-components ──────────────────────────────────────────

  function renderLaborWarnings(warnings: LaborWarning[]) {
    if (!warnings || warnings.length === 0) return null;

    const severityColors: Record<string, string> = {
      error: 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
      warning: 'border-yellow-500 bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
      info: 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
    };

    const severityIcons: Record<string, React.ReactNode> = {
      error: <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />,
      warning: <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />,
      info: <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
    };

    return (
      <div className="space-y-2 mt-3">
        {warnings.map((w, wi) => (
          <Alert
            key={wi}
            className={`border-l-4 ${severityColors[w.severity] || severityColors.info}`}
          >
            {severityIcons[w.severity]}
            <AlertDescription className="text-sm">{w.message}</AlertDescription>
          </Alert>
        ))}
      </div>
    );
  }

  function renderShiftBreakdown(breakdown: ShiftHourBreakdown) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-sm">
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <span className="text-muted-foreground text-xs">Total</span>
          <p className="font-medium">{formatNumber(breakdown.total, 1)} h</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <span className="text-muted-foreground text-xs">Ordinarias</span>
          <p className="font-medium">{formatNumber(breakdown.regular, 1)} h</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <span className="text-muted-foreground text-xs">Nocturnas</span>
          <p className="font-medium">{formatNumber(breakdown.night, 1)} h</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <span className="text-muted-foreground text-xs">Domingos</span>
          <p className="font-medium">{formatNumber(breakdown.sunday, 1)} h</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <span className="text-muted-foreground text-xs">Festivos</span>
          <p className="font-medium">{formatNumber(breakdown.holiday, 1)} h</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <span className="text-muted-foreground text-xs">Nac.</span>
          <p className="font-medium">{formatNumber(breakdown.holidayNational, 1)} h</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <span className="text-muted-foreground text-xs">Aut.</span>
          <p className="font-medium">{formatNumber(breakdown.holidayAutonomico, 1)} h</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded p-2">
          <span className="text-muted-foreground text-xs">Prov.</span>
          <p className="font-medium">{formatNumber(breakdown.holidayProvincial, 1)} h</p>
        </div>
      </div>
    );
  }

  function renderSurchargesTable(surcharges: SurchargeEntry[]) {
    if (!surcharges || surcharges.length === 0) return null;
    return (
      <div className="mt-3 border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 dark:bg-gray-800">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Concepto</th>
              <th className="text-right px-3 py-2 font-medium">Horas</th>
              <th className="text-right px-3 py-2 font-medium">Tipo</th>
              <th className="text-right px-3 py-2 font-medium">Valor</th>
              <th className="text-right px-3 py-2 font-medium">Importe</th>
            </tr>
          </thead>
          <tbody>
            {surcharges.map((s, si) => (
              <tr key={si} className="border-t">
                <td className="px-3 py-1.5">{s.name}</td>
                <td className="text-right px-3 py-1.5">{formatNumber(s.hours, 1)}</td>
                <td className="text-right px-3 py-1.5">
                  {s.surchargeType === 'percentage' && `${s.value}%`}
                  {s.surchargeType === 'fixed' && formatCurrency(s.value)}
                  {s.surchargeType === 'multiplier' && `×${s.value}`}
                  {s.surchargeType === 'special_price' && 'P. esp.'}
                </td>
                <td className="text-right px-3 py-1.5">
                  {s.surchargeType === 'fixed' ? '—' : formatCurrency(s.value)}
                </td>
                <td className="text-right px-3 py-1.5 font-medium">{formatCurrency(s.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderBlockResult(result: BlockCalculationResult, blockIndex: number) {
    return (
      <div className="mt-4 space-y-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Calculator className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold text-sm text-emerald-700 dark:text-emerald-400">
            Resultados del cálculo
          </span>
        </div>

        {(result.overtimeHours > 0 || result.deficitPlantilla > 0) && (
          <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertDescription className="space-y-2 text-amber-950 dark:text-amber-100">
              <p className="font-medium">Sugerencia del sistema: revisar la cobertura con un profesional de refuerzo.</p>
              <p className="text-sm">
                {result.overtimeHours > 0
                  ? `Se estiman ${formatNumber(result.overtimeHours, 1)} h extra. `
                  : ''}
                La plantilla mínima recomendada es de {result.plantillaMinimaRecomendada} profesional(es).
                Esta sugerencia no añade una partida facturable ni duplica las horas del cliente.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-500 bg-white hover:bg-amber-100 dark:bg-transparent"
                  onClick={() => handleCloneReinforcementBlock(blockIndex, result)}
                >
                  <Users className="h-3.5 w-3.5 mr-1" />
                  Repartir cobertura
                </Button>
                <span className="self-center text-xs text-amber-800 dark:text-amber-200">
                  Se crearán fichas con fechas o turnos complementarios. La cobertura total no se duplica.
                </span>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border">
            <span className="text-muted-foreground text-xs">Precio del bloque sin IVA</span>
            <p className="font-semibold">{formatCurrency(result.closingPriceExVat ?? result.totalWithSurcharges)}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border">
            <span className="text-muted-foreground text-xs">IVA ({result.ivaPercent ?? 21}%)</span>
            <p className="font-semibold">{formatCurrency(result.ivaAmount)}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-emerald-300">
            <span className="text-muted-foreground text-xs">Total del bloque</span>
            <p className="font-semibold text-emerald-700">{formatCurrency(result.totalWithVat)}</p>
          </div>
        </div>

        {isAdmin && (<>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-sm">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border">
            <span className="text-muted-foreground text-xs">Días laborables</span>
            <p className="font-semibold">{result.totalWorkingDays}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border">
            <span className="text-muted-foreground text-xs">Horas por puesto</span>
            <p className="font-semibold">{formatNumber(result.hoursPerPosition, 1)}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border">
            <span className="text-muted-foreground text-xs">Horas cobertura</span>
            <p className="font-semibold">{formatNumber(result.coverageHours, 1)}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border">
            <span className="text-muted-foreground text-xs">Puestos simultáneos</span>
            <p className="font-semibold">{result.puestosSimultaneos}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border">
            <span className="text-muted-foreground text-xs">Plantilla mín. recomendada</span>
            <p className="font-semibold text-teal-700 dark:text-teal-400">
              {result.plantillaMinimaRecomendada}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border">
            <span className="text-muted-foreground text-xs">Plantilla seleccionada</span>
            <p className="font-semibold">{result.plantillaSeleccionada}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border">
            <span className="text-muted-foreground text-xs">Déficit plantilla</span>
            <p className={`font-semibold ${result.deficitPlantilla > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
              {result.deficitPlantilla}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border">
            <span className="text-muted-foreground text-xs">Horas extra</span>
            <p className="font-semibold text-orange-600">
              {result.overtimeHours > 0 ? formatNumber(result.overtimeHours, 1) : '0'}
            </p>
          </div>
        </div>

        {result.weeklyHoursPerPro && result.weeklyHoursPerPro.length > 0 && (
          <div className="mt-3">
            <span className="text-xs font-medium text-muted-foreground">Horas semanales por profesional</span>
            <div className="mt-1 max-h-40 overflow-y-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium">Semana</th>
                    <th className="text-right px-3 py-1.5 font-medium">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {result.weeklyHoursPerPro.map((w, wi) => (
                    <tr key={wi} className="border-t">
                      <td className="px-3 py-1">{w.weekKey}</td>
                      <td className="text-right px-3 py-1 font-mono">{formatNumber(w.hours, 1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <span className="text-xs font-medium text-muted-foreground">Desglose de horas</span>
          {renderShiftBreakdown(result.shiftBreakdown)}
        </div>

        <Separator />

        <div className="flex justify-between items-center">
          <div>
            {result.plantillaMinimaRecomendada > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-teal-700 border-teal-400 cursor-help">
                      <Users className="h-3 w-3 mr-1" />
                      Plantilla mín. recomendada: {result.plantillaMinimaRecomendada}
                      {result.deficitPlantilla > 0 && (
                        <span className="ml-1 text-red-600 dark:text-red-400">(déficit: {result.deficitPlantilla})</span>
                      )}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Calculado según normativa laboral vigente
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <Badge variant="outline" className="border-emerald-400 text-emerald-700">
            Coste y precio calculados en servidor
          </Badge>
        </div>

        {result.laborWarnings && result.laborWarnings.length > 0 && (
          <>
            <Separator />
            <div>
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Avisos laborales
              </span>
              {renderLaborWarnings(result.laborWarnings)}
            </div>
          </>
        )}
        </>)}
      </div>
    );
  }

  function renderBlockIvaSelector(block: ServiceBlockInput, index: number) {
    const value = safeNumber(block.ivaPercent, 21);
    const mode = value === 0 ? 'exento' : value === 21 ? 'standard' : 'custom';
    return (
      <div className="space-y-1.5 max-w-xs">
        <Label htmlFor={`block-iva-${index}`} className="text-xs">IVA de esta partida</Label>
        <Select
          value={mode}
          onValueChange={(selected) => {
            if (selected === 'exento') store.updateServiceBlock(index, { ivaPercent: 0 });
            if (selected === 'standard') store.updateServiceBlock(index, { ivaPercent: 21 });
            if (selected === 'custom' && (value === 0 || value === 21)) {
              store.updateServiceBlock(index, { ivaPercent: 10 });
            }
          }}
        >
          <SelectTrigger id={`block-iva-${index}`} className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">21%</SelectItem>
            <SelectItem value="exento">Exento (0%)</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
        {mode === 'custom' && (
          <Input
            aria-label={`IVA personalizado del bloque ${index + 1}`}
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={value}
            onChange={(event) => store.updateServiceBlock(index, {
              ivaPercent: Math.min(100, Math.max(0, safeNumber(event.target.value))),
            })}
            className="h-9"
          />
        )}
      </div>
    );
  }

  function renderSimpleBlockFields(block: ServiceBlockInput, index: number) {
    const bt = block.blockType;

    // Common concept/service name
    const serviceNameLabel = (() => {
      switch (bt) {
        case 'material': return 'Nombre del material';
        case 'servicio_fijo': return 'Nombre del servicio';
        case 'desplazamiento': return 'Concepto de desplazamiento';
        case 'dietas': return 'Concepto de dieta';
        case 'alojamiento': return 'Concepto de alojamiento';
        case 'ambulancia': return 'Tipo de transporte';
        case 'telemedicina': return 'Concepto de telemedicina';
        case 'curso': return 'Nombre del curso';
        case 'otros': return 'Concepto';
        default: return 'Nombre del servicio';
      }
    })();

    const unitLabel = (() => {
      switch (bt) {
        case 'material': return 'Precio/unidad (€)';
        case 'desplazamiento': return 'Precio/km (€)';
        case 'dietas': return 'Precio/día-persona (€)';
        case 'alojamiento': return 'Precio/noche (€)';
        case 'ambulancia': return 'Precio/servicio (€)';
        case 'telemedicina': return 'Precio/sesión (€)';
        case 'curso': return 'Precio/hora (€)';
        case 'servicio_fijo': return 'Precio fijo (€)';
        case 'otros': return 'Precio/unidad (€)';
        default: return 'Precio/unidad (€)';
      }
    })();

    const qtyLabel = (() => {
      switch (bt) {
        case 'material': return 'Cantidad';
        case 'desplazamiento': return 'Kilómetros';
        case 'dietas': return 'Días';
        case 'alojamiento': return 'Noches';
        case 'ambulancia': return 'Servicios';
        case 'telemedicina': return 'Sesiones';
        case 'curso': return 'Horas';
        case 'servicio_fijo': return 'Cantidad';
        case 'otros': return 'Cantidad';
        default: return 'Cantidad';
      }
    })();

    return (
      <>
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Información del bloque
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`svc-name-${index}`} className="text-xs">{serviceNameLabel}</Label>
              <Input
                id={`svc-name-${index}`}
                value={block.serviceName}
                onChange={(e) => store.updateServiceBlock(index, { serviceName: e.target.value })}
                placeholder={bt === 'material' ? 'Ej: Material quirúrgico' : bt === 'curso' ? 'Ej: Primeros auxilios' : 'Ej: Coordinación'}
                className="h-9"
              />
            </div>

            {bt === 'material' && (
              <div className="space-y-1.5">
                <Label htmlFor={`mat-name-${index}`} className="text-xs">Descripción del material</Label>
                <Input
                  id={`mat-name-${index}`}
                  value={block.materialName || ''}
                  onChange={(e) => store.updateServiceBlock(index, { materialName: e.target.value })}
                  placeholder="Ej: Jeringas, vendas..."
                  className="h-9"
                />
              </div>
            )}

            {bt === 'ambulancia' && (
              <div className="space-y-1.5">
                <Label htmlFor={`transport-type-${index}`} className="text-xs">Tipo de ambulancia</Label>
                <Select
                  value={block.transportType || ''}
                  onValueChange={(val) => store.updateServiceBlock(index, { transportType: val })}
                >
                  <SelectTrigger id={`transport-type-${index}`} className="h-9">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="convencional">Convencional</SelectItem>
                    <SelectItem value="uvci">UVCI</SelectItem>
                    <SelectItem value="medicalizada">Medicalizada</SelectItem>
                    <SelectItem value="soporte_vital">Soporte vital básico</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Course-specific fields */}
            {bt === 'curso' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor={`course-teacher-${index}`} className="text-xs">Profesor/a</Label>
                  <Input
                    id={`course-teacher-${index}`}
                    value={block.courseTeacher || ''}
                    onChange={(e) => store.updateServiceBlock(index, { courseTeacher: e.target.value })}
                    placeholder="Nombre del profesor/a"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`course-modality-${index}`} className="text-xs">Modalidad</Label>
                  <Select
                    value={block.courseModality || 'presencial'}
                    onValueChange={(val: CourseModality) => store.updateServiceBlock(index, { courseModality: val })}
                  >
                    <SelectTrigger id={`course-modality-${index}`} className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(MODALITY_LABELS) as [CourseModality, string][]).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`course-sessions-${index}`} className="text-xs">Número de sesiones</Label>
                  <Input
                    id={`course-sessions-${index}`}
                    type="number"
                    min="1"
                    step="1"
                    value={block.courseSessions || 1}
                    onChange={(e) => store.updateServiceBlock(index, { courseSessions: parseInt(e.target.value, 10) || 1 })}
                    className="h-9"
                  />
                </div>
              </>
            )}

            {/* Accommodation-specific fields */}
            {bt === 'alojamiento' && (
              <div className="space-y-1.5">
                <Label htmlFor={`accom-persons-${index}`} className="text-xs">Personas</Label>
                <Input
                  id={`accom-persons-${index}`}
                  type="number"
                  min="1"
                  step="1"
                  value={block.accommodationPersons || 1}
                  onChange={(e) => store.updateServiceBlock(index, { accommodationPersons: parseInt(e.target.value, 10) || 1 })}
                  className="h-9"
                />
              </div>
            )}
          </div>

          {/* Price and quantity row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor={`svc-price-${index}`} className="text-xs">{unitLabel}</Label>
              <Input
                id={`svc-price-${index}`}
                type="number"
                min="0"
                step="0.01"
                value={bt === 'servicio_fijo' || bt === 'ambulancia' || bt === 'telemedicina' || bt === 'alojamiento' ? (block.fixedPrice ?? '') : (block.pricePerHour || '')}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  if (bt === 'servicio_fijo' || bt === 'ambulancia' || bt === 'telemedicina' || bt === 'alojamiento') {
                    store.updateServiceBlock(index, { fixedPrice: val });
                  } else {
                    store.updateServiceBlock(index, { pricePerHour: val });
                  }
                }}
                disabled={!isAdmin}
                className="h-9"
                title={!isAdmin ? 'El precio viene de la configuración aprobada.' : undefined}
              />
              {!isAdmin && (
                <p className="text-xs text-amber-600 mt-0.5">Precio fijado por administración</p>
              )}
            </div>
            {bt !== 'servicio_fijo' && (
              <div className="space-y-1.5">
                <Label htmlFor={`svc-qty-${index}`} className="text-xs">{qtyLabel}</Label>
                <Input
                  id={`svc-qty-${index}`}
                  type="number"
                  min="1"
                  step="1"
                  value={bt === 'alojamiento' ? (block.accommodationNights || 1) : (block.quantity || 1)}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 1;
                    if (bt === 'alojamiento') {
                      store.updateServiceBlock(index, { accommodationNights: val });
                    } else {
                      store.updateServiceBlock(index, { quantity: val });
                    }
                  }}
                  className="h-9"
                />
              </div>
            )}
          </div>

          <div className="mt-4">{renderBlockIvaSelector(block, index)}</div>

          {/* Simple block result summary */}
          {store.blockResults[index] && (
            <div className="mt-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-sm text-emerald-700 dark:text-emerald-400">
                  Resultado del cálculo
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <div><span className="text-muted-foreground">Sin IVA</span><p className="font-semibold">{formatCurrency(store.blockResults[index].closingPriceExVat)}</p></div>
                <div><span className="text-muted-foreground">IVA ({store.blockResults[index].ivaPercent ?? block.ivaPercent ?? 21}%)</span><p className="font-semibold">{formatCurrency(store.blockResults[index].ivaAmount)}</p></div>
                <div><span className="text-muted-foreground">Total bloque</span><p className="font-bold text-emerald-700">{formatCurrency(store.blockResults[index].totalWithVat)}</p></div>
              </div>
            </div>
          )}
        </div>

        {/* Observations */}
        <div className="space-y-1.5 mt-4">
          <Label htmlFor={`obs-${index}`} className="text-xs">Observaciones</Label>
          <Textarea
            id={`obs-${index}`}
            value={block.observations || ''}
            onChange={(e) => store.updateServiceBlock(index, { observations: e.target.value })}
            placeholder="Observaciones sobre este bloque..."
            rows={2}
            className="text-sm"
          />
        </div>
      </>
    );
  }

  function renderServiceBlock(block: ServiceBlockInput, index: number) {
    const isExpanded = expandedBlocks.has(index);
    const result = store.blockResults[index];
    const isTimeBased = TIME_BASED_UNITS.includes(block.unitType) && !SIMPLE_BLOCK_TYPES.includes(block.blockType as BlockType);
    const isSimpleBlock = SIMPLE_BLOCK_TYPES.includes(block.blockType as BlockType);
    const categoryName = store.categories.find((c) => c.id === block.professionalCategory)?.name || '';
    const blockTypeLabel = block.blockType ? BLOCK_TYPE_LABELS[block.blockType] : '';

    return (
      <Card key={index} className={`mb-4 ${result && (result.overtimeHours > 0 || result.deficitPlantilla > 0) ? 'border-amber-400 ring-1 ring-amber-200 dark:ring-amber-900' : ''}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base font-semibold">
                Bloque {index + 1}
                {blockTypeLabel && (
                  <Badge variant="secondary" className="text-xs ml-2">
                    {blockTypeLabel}
                  </Badge>
                )}
                {categoryName && (
                  <span className="text-muted-foreground font-normal ml-2">
                    — {categoryName}
                  </span>
                )}
              </CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleBlock(index)}
                className="h-8 w-8 p-0"
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveBlock(index)}
                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="space-y-6">
            {isSimpleBlock ? (
              renderSimpleBlockFields(block, index)
            ) : (
              <>
            {/* ─── Basic Info ──────────────────────────────────── */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Información básica
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`svc-name-${index}`} className="text-xs">
                    Nombre del servicio
                  </Label>
                  <Input
                    id={`svc-name-${index}`}
                    value={block.serviceName}
                    onChange={(e) =>
                      store.updateServiceBlock(index, { serviceName: e.target.value })
                    }
                    placeholder="Ej: Enfermería UCI"
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`svc-cat-${index}`} className="text-xs">
                    Categoría profesional
                  </Label>
                  <Select
                    value={block.professionalCategory}
                    onValueChange={(val) => handleCategoryChange(index, val)}
                  >
                    <SelectTrigger id={`svc-cat-${index}`} className="h-9">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {store.categories
                        .filter((c) => c.active !== false)
                        .map((cat) => (
                          <SelectItem key={cat.id} value={cat.id ?? ''}>
                            {cat.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`svc-unit-${index}`} className="text-xs">
                    Tipo de unidad
                  </Label>
                  <Select
                    value={block.unitType}
                    onValueChange={(val: UnitType) =>
                      store.updateServiceBlock(index, { unitType: val })
                    }
                  >
                    <SelectTrigger id={`svc-unit-${index}`} className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(UNIT_TYPE_LABELS) as [UnitType, string][]).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Time-based fields (precio/hora) vs non-time-based (precio/unidad, cantidad) */}
              {isTimeBased ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`svc-contract-${index}`} className="text-xs">Tipo de contratación</Label>
                    <Select
                      value={block.contractType ?? ''}
                      onValueChange={(value: ServiceContractType) =>
                        store.updateServiceBlock(index, { contractType: value })
                      }
                    >
                      <SelectTrigger id={`svc-contract-${index}`} className="h-9">
                        <SelectValue placeholder="Seleccionar contratación" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(CONTRACT_TYPE_LABELS) as [ServiceContractType, string][]).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Alert className="border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20">
                    <Calculator className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      El precio lo construye el motor GASI con salario, pagas extra, cotizaciones, pluses, contratación, overhead y política comercial.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`svc-fprice-${index}`} className="text-xs">
                      Coste real/Unidad (€)
                    </Label>
                    <Input
                      id={`svc-fprice-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={block.fixedPrice || ''}
                      onChange={(e) =>
                        store.updateServiceBlock(index, {
                          fixedPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                      disabled={!isAdmin}
                      className="h-9"
                      title={!isAdmin ? 'El precio viene de la configuración aprobada.' : undefined}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`svc-qty-${index}`} className="text-xs">
                      Cantidad
                    </Label>
                    <Input
                      id={`svc-qty-${index}`}
                      type="number"
                      min="1"
                      step="1"
                      value={block.quantity || 1}
                      onChange={(e) =>
                        store.updateServiceBlock(index, {
                          quantity: parseInt(e.target.value, 10) || 1,
                        })
                      }
                      className="h-9"
                    />
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* ─── Date Configuration (time-based only) ─────────── */}
            {isTimeBased && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Configuración de fechas
                </h4>

                <div className="space-y-4">
                  {/* ── Mode selector ── */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Modo de fecha</Label>
                    <div className="flex gap-2">
                      {DATE_MODE_OPTIONS.map((opt) => {
                        const active = getDateUIMode(block) === opt.value;
                        return (
                          <button key={opt.value} type="button" onClick={() => handleDateUIModeChange(index, opt.value)}
                            className={`flex-1 rounded-md border px-3 py-2 text-left transition-colors
                              ${active
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 text-muted-foreground'}`}
                          >
                            <div className="text-xs font-medium">{opt.label}</div>
                            <div className="text-[10px] opacity-70 mt-0.5">{opt.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ═══ MODE 1: Repetición semanal ═══ */}
                  {getDateUIMode(block) === 'weekly' && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor={`date-start-${index}`} className="text-xs">Fecha inicio</Label>
                          <Input id={`date-start-${index}`} type="date" value={block.dateRangeStart || ''}
                            onChange={(e) => store.updateServiceBlock(index, { dateRangeStart: e.target.value })} className="h-9" />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`date-end-${index}`} className="text-xs">Fecha fin</Label>
                          <Input id={`date-end-${index}`} type="date" value={block.dateRangeEnd || ''}
                            onChange={(e) => store.updateServiceBlock(index, { dateRangeEnd: e.target.value })} className="h-9" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Días de la semana</Label>
                        <div className="flex gap-1.5">
                          {DAY_LABELS.map((day) => (
                            <label key={day.value}
                              className={`flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer text-sm font-medium transition-colors
                                ${(block.daysOfWeek ?? []).includes(day.value)
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-muted-foreground hover:border-emerald-400'}`}
                            >
                              <Checkbox checked={(block.daysOfWeek ?? []).includes(day.value)}
                                onCheckedChange={() => handleDayToggle(index, day.value)} className="sr-only" />
                              <span>{day.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* ═══ MODE 2: Días concretos (visual calendar) ═══ */}
                  {getDateUIMode(block) === 'specific' && (() => {
                    const cm = getCalendarMonth(index);
                    const firstDay = new Date(cm.year, cm.month, 1).getDay();
                    const daysInMonth = new Date(cm.year, cm.month + 1, 0).getDate();
                    const selected = new Set(block.specificDates ?? []);
                    const weekStart = firstDay === 0 ? 6 : firstDay - 1;
                    const blanks = Array.from({ length: weekStart }, (_, i) => null);
                    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <button type="button" onClick={() => handleCalendarNav(index, -1)}
                            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <span className="text-sm font-medium">{MONTH_NAMES[cm.month]} {cm.year}</span>
                          <button type="button" onClick={() => handleCalendarNav(index, 1)}
                            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center">
                          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                            <div key={d} className="text-[10px] font-medium text-muted-foreground py-1">{d}</div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {blanks.map((_, i) => <div key={`b-${i}`} />)}
                          {days.map((day) => {
                            const dateStr = `${cm.year}-${String(cm.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const isSelected = selected.has(dateStr);
                            const dow = new Date(cm.year, cm.month, day).getDay();
                            const isSunday = dow === 0;
                            const holiday = findHolidayForDate(dateStr, applicableHolidays);
                            return (
                              <button key={day} type="button" onClick={() => handleCalendarToggle(index, dateStr)}
                                className={`h-8 w-full rounded-md text-xs font-medium transition-colors relative
                                  ${isSelected
                                    ? 'bg-emerald-600 text-white'
                                    : isSunday
                                      ? 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900'
                                      : holiday
                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900'
                                        : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-emerald-400'}`}
                                title={holiday ? holiday.name : isSunday ? 'Domingo' : undefined}
                              >
                                {day}
                                {holiday && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500" />}
                              </button>
                            );
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {selected.size} día{selected.size !== 1 ? 's' : ''} seleccionado{selected.size !== 1 ? 's' : ''}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ═══ MODE 3: Mes completo ═══ */}
                  {getDateUIMode(block) === 'month' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Desde el mes</Label>
                          <Select value={block.dateRangeStart?.slice(0, 7) || ''} onValueChange={(val) => {
                            const [y, m] = val.split('-').map(Number);
                            const lastDay = new Date(y, m, 0).getDate();
                            store.updateServiceBlock(index, {
                              dateRangeStart: `${val}-01`,
                              dateRangeEnd: `${val}-${String(lastDay).padStart(2, '0')}`,
                            });
                          }}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Seleccionar mes" /></SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, i) => {
                                const d = new Date(); d.setMonth(d.getMonth() + i);
                                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                                return <SelectItem key={key} value={key}>{MONTH_NAMES[d.getMonth()]} {d.getFullYear()}</SelectItem>;
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Hasta el mes</Label>
                          <Select value={block.dateRangeEnd?.slice(0, 7) || ''} onValueChange={(val) => {
                            const [y, m] = val.split('-').map(Number);
                            const lastDay = new Date(y, m, 0).getDate();
                            store.updateServiceBlock(index, { dateRangeEnd: `${val}-${String(lastDay).padStart(2, '0')}` });
                          }}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Mismo mes" /></SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, i) => {
                                const d = new Date(); d.setMonth(d.getMonth() + i);
                                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                                return <SelectItem key={key} value={key}>{MONTH_NAMES[d.getMonth()]} {d.getFullYear()}</SelectItem>;
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Patrón de días</Label>
                        <div className="flex flex-wrap gap-2">
                          {MONTH_PRESETS.map((preset) => {
                            const isActive = JSON.stringify([...(block.daysOfWeek ?? [])].sort()) === JSON.stringify([...preset.days].sort());
                            return (
                              <button key={preset.label} type="button" onClick={() => handleMonthPreset(index, preset.days)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                                  ${isActive
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'border-gray-300 dark:border-gray-600 text-muted-foreground hover:border-emerald-400'}`}
                              >{preset.label}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Ajustar días</Label>
                        <div className="flex gap-1.5">
                          {DAY_LABELS.map((day) => (
                            <label key={day.value}
                              className={`flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer text-sm font-medium transition-colors
                                ${(block.daysOfWeek ?? []).includes(day.value)
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-muted-foreground hover:border-emerald-400'}`}
                            >
                              <Checkbox checked={(block.daysOfWeek ?? []).includes(day.value)}
                                onCheckedChange={() => handleDayToggle(index, day.value)} className="sr-only" />
                              <span>{day.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ═══ Shared: Holiday exclusion (all 3 modes) ═══ */}
                  <div className="flex items-center gap-2">
                    <Switch checked={block.excludeHolidays}
                      onCheckedChange={(checked) => store.updateServiceBlock(index, { excludeHolidays: checked })} />
                    <Label className="text-xs cursor-pointer">No prestar servicio en festivos</Label>
                  </div>
                  {block.excludeHolidays && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tipos de festivo a excluir</Label>
                      <div className="flex flex-wrap gap-3">
                        {(Object.entries(HOLIDAY_TYPE_LABELS) as [HolidayType, string][]).map(([value, label]) => (
                          <div key={value} className="flex items-center gap-1.5">
                            <Checkbox id={`holiday-${value}-${index}`}
                              checked={(block.holidayTypesExcluded ?? []).includes(value)}
                              onCheckedChange={() => handleHolidayTypeToggle(index, value)} />
                            <Label htmlFor={`holiday-${value}-${index}`} className="text-xs cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ═══ Date summary (all 3 modes) ═══ */}
                  {(() => {
                    const hasRange = block.dateMode === 'range' && block.dateRangeStart && block.dateRangeEnd;
                    const hasSpecific = block.dateMode === 'specific' && block.specificDates && block.specificDates.length > 0;
                    if (!hasRange && !hasSpecific) return null;
                    try {
                      const dates = calculateWorkingDates({
                        dateMode: block.dateMode as 'specific' | 'range',
                        specificDates: block.specificDates,
                        dateRangeStart: block.dateRangeStart,
                        dateRangeEnd: block.dateRangeEnd,
                        daysOfWeek: block.daysOfWeek,
                        excludeSundays: block.excludeSundays,
                        excludeHolidays: block.excludeHolidays,
                        holidayTypesExcluded: block.holidayTypesExcluded,
                      }, applicableHolidays);
                      if (dates.length === 0) return (
                        <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 rounded-md p-2">
                          Sin días para este rango/criterio. Ajusta las fechas o los días de la semana.
                        </div>
                      );
                      let laborables = 0, sabados = 0, domingos = 0;
                      const festivos: Record<string, number> = {};
                      for (const d of dates) {
                        const dt = new Date(d + 'T12:00:00');
                        const dow = dt.getDay();
                        if (dow === 6) sabados++;
                        else if (dow === 0) domingos++;
                        else laborables++;
                      }
                      let excludedSundays = 0, excludedHolidays = 0;
                      if (block.excludeHolidays || block.excludeSundays) {
                        const allInRange = hasRange ? (() => {
                          const s = new Date(block.dateRangeStart! + 'T12:00:00');
                          const e = new Date(block.dateRangeEnd! + 'T12:00:00');
                          const arr: string[] = [];
                          const cur = new Date(s);
                          while (cur <= e) { arr.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
                          return arr;
                        })() : block.specificDates ?? [];
                        for (const d of allInRange) {
                          const dt = new Date(d + 'T12:00:00');
                          if (dt.getDay() === 0) excludedSundays++;
                          const h = findHolidayForDate(d, applicableHolidays);
                          if (h && (!block.holidayTypesExcluded || block.holidayTypesExcluded.includes(h.type))) {
                            festivos[h.type] = (festivos[h.type] || 0) + 1;
                            excludedHolidays++;
                          }
                        }
                      }
                      return (
                        <div className="text-xs bg-gray-50 dark:bg-gray-900 rounded-md p-3 space-y-1.5">
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span className="text-muted-foreground">Total: <span className="font-semibold text-foreground">{dates.length}</span></span>
                            <span className="text-muted-foreground">Laborables: <span className="font-semibold text-foreground">{laborables}</span></span>
                            <span className="text-muted-foreground">Sábados: <span className="font-semibold text-foreground">{sabados}</span></span>
                            <span className="text-muted-foreground">Domingos: <span className="font-semibold text-foreground">{domingos}</span></span>
                          </div>
                          {Object.keys(festivos).length > 0 && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {Object.entries(festivos).map(([type, count]) => (
                                <span key={type} className="text-amber-600 dark:text-amber-400">
                                  Festivos {HOLIDAY_TYPE_LABELS[type as HolidayType] || type}: <span className="font-semibold">{count}</span>
                                </span>
                              ))}
                            </div>
                          )}
                          {(excludedSundays > 0 || excludedHolidays > 0) && (
                            <div className="text-muted-foreground">
                              Excluidos: {excludedSundays > 0 && <span>{excludedSundays} domingos</span>}
                              {excludedSundays > 0 && excludedHolidays > 0 && <span>, </span>}
                              {excludedHolidays > 0 && <span>{excludedHolidays} festivo{excludedHolidays !== 1 ? 's' : ''}</span>}
                            </div>
                          )}
                        </div>
                      );
                    } catch { return null; }
                  })()}
                </div>
              </div>
            )}

            {/* Date separator only for time-based */}
            {isTimeBased && <Separator />}

            {/* ─── Shift Configuration (time-based only) ─────────── */}
            {isTimeBased && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Configuración de turno
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`shift-type-${index}`} className="text-xs">
                      Tipo de turno
                    </Label>
                    <Select
                      value={block.shiftType}
                      onValueChange={(val: ShiftType) =>
                        handleShiftTypeChange(index, val)
                      }
                    >
                      <SelectTrigger id={`shift-type-${index}`} className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.entries(SHIFT_LABELS) as [ShiftType, string][]
                        ).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {block.shiftType === 'custom' && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor={`shift-start-${index}`} className="text-xs">
                          Hora inicio
                        </Label>
                        <Input
                          id={`shift-start-${index}`}
                          type="time"
                          value={block.shiftStartTime || ''}
                          onChange={(e) =>
                            store.updateServiceBlock(index, {
                              shiftStartTime: e.target.value,
                            })
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`shift-end-${index}`} className="text-xs">
                          Hora fin
                        </Label>
                        <Input
                          id={`shift-end-${index}`}
                          type="time"
                          value={block.shiftEndTime || ''}
                          onChange={(e) =>
                            store.updateServiceBlock(index, {
                              shiftEndTime: e.target.value,
                            })
                          }
                          className="h-9"
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor={`hours-per-day-${index}`} className="text-xs">
                      Horas/día
                    </Label>
                    <Input
                      id={`hours-per-day-${index}`}
                      type="number"
                      min="1"
                      max="24"
                      step="0.5"
                      value={block.hoursPerDay || ''}
                      onChange={(e) =>
                        store.updateServiceBlock(index, {
                          hoursPerDay: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`break-mins-${index}`} className="text-xs">
                      Descanso (min)
                    </Label>
                    <Input
                      id={`break-mins-${index}`}
                      type="number"
                      min="0"
                      step="5"
                      value={block.breakMinutes || ''}
                      onChange={(e) =>
                        store.updateServiceBlock(index, {
                          breakMinutes: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      className="h-9"
                    />
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* ─── Puestos y Plantilla ──────────────────────────── */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Puestos y Plantilla
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`puestos-${index}`} className="text-xs">
                    Puestos
                  </Label>
                  <Input
                    id={`puestos-${index}`}
                    type="number"
                    min="1"
                    step="1"
                    value={block.puestosSimultaneos || 1}
                    onChange={(e) =>
                      store.updateServiceBlock(index, {
                        puestosSimultaneos: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="h-9 w-32"
                  />
                  <p className="text-xs text-muted-foreground">Puestos simultáneos a cubrir</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`plantilla-${index}`} className="text-xs">
                    Plantilla
                  </Label>
                  <Input
                    id={`plantilla-${index}`}
                    type="number"
                    min="0"
                    step="1"
                    value={block.plantillaSeleccionada ?? 0}
                    onChange={(e) =>
                      store.updateServiceBlock(index, {
                        plantillaSeleccionada: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="h-9 w-32"
                  />
                  <p className="text-xs text-muted-foreground">Personal real asignado</p>
                </div>
              </div>
              {result && result.plantillaMinimaRecomendada > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-teal-600 dark:text-teal-400 mt-2 cursor-help flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        Plantilla mínima recomendada: {result.plantillaMinimaRecomendada} profesional
                        {result.plantillaMinimaRecomendada !== 1 ? 'es' : ''}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      Calculado según normativa laboral vigente y horas semanales
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* ─── Observations ─────────────────────────────────── */}
            <div className="space-y-1.5">
              <Label htmlFor={`obs-${index}`} className="text-xs">
                Observaciones
              </Label>
              <Textarea
                id={`obs-${index}`}
                value={block.observations || ''}
                onChange={(e) =>
                  store.updateServiceBlock(index, { observations: e.target.value })
                }
                placeholder="Observaciones sobre este bloque..."
                rows={2}
                className="text-sm"
              />
            </div>

            {/* ─── Calculation Result ───────────────────────────── */}
            {renderBlockIvaSelector(block, index)}
            {result && renderBlockResult(result, index)}
            </>
            )}
          </CardContent>
        )}
      </Card>
    );
  }

  // ─── Main Render ──────────────────────────────────────────────

  if (!dataLoaded && store.loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto" />
          <p className="text-sm text-muted-foreground">Cargando datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'flex min-h-full flex-col' : 'flex min-h-full flex-col'}>
      {/* ─── Scrollable Main Area ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Page title */}
          {!embedded && <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="h-8 w-8 p-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold">
                  {isEditing ? 'Editar presupuesto' : 'Nuevo presupuesto'}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Complete los datos para crear el presupuesto
                </p>
              </div>
            </div>
            {isEditing && store.budgetForm.status && (
              <Badge variant={STATUS_VARIANTS[store.budgetForm.status] || 'secondary'}>
                {STATUS_LABELS[store.budgetForm.status] || store.budgetForm.status}
              </Badge>
            )}
          </div>}

          {/* ─── Section 1: Budget Header ─────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Datos del presupuesto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Client selector */}
                <div className="space-y-1.5">
                  <Label htmlFor="client-select" className="text-xs font-medium">
                    Cliente *
                  </Label>
                  <Select
                    value={store.budgetForm.clientId}
                    onValueChange={(val) => store.setBudgetForm({ clientId: val })}
                  >
                    <SelectTrigger id="client-select" className="h-9">
                      <SelectValue placeholder="Seleccionar cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {store.clients.map((client) => (
                        <SelectItem key={client.id} value={client.id ?? ''}>
                          <span className="flex flex-col">
                            <span>{client.businessName}</span>
                            <span className="text-xs text-muted-foreground">
                              {client.cif}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="service-community" className="text-xs font-medium">Comunidad autónoma *</Label>
                  <Select
                    value={selectedCommunity}
                    onValueChange={(value) => {
                      const province = getProvincesForCommunity(value)[0];
                      const municipality = getMunicipalitiesForProvince(value, province)[0];
                      if (!municipality) return;
                      const location = buildServiceLocation(municipality);
                      store.setBudgetForm({
                        serviceLocationId: location.id,
                        serviceAutonomousCommunity: location.autonomousCommunity,
                        serviceProvince: location.province,
                        serviceMunicipality: location.municipality || '',
                      });
                    }}
                  >
                    <SelectTrigger id="service-community" className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUTONOMOUS_COMMUNITIES.map((community) => (
                        <SelectItem key={community} value={community}>{community}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="service-province" className="text-xs font-medium">Provincia *</Label>
                  <Select value={selectedProvince} onValueChange={(value) => {
                    const municipality = getMunicipalitiesForProvince(selectedCommunity, value)[0];
                    if (!municipality) return;
                    const location = buildServiceLocation(municipality);
                    store.setBudgetForm({ serviceLocationId: location.id, serviceAutonomousCommunity: location.autonomousCommunity, serviceProvince: location.province, serviceMunicipality: location.municipality });
                  }}>
                    <SelectTrigger id="service-province" className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{availableProvinces.map((province) => <SelectItem key={province} value={province}>{province}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="service-municipality" className="text-xs font-medium">Localidad *</Label>
                  <Select value={store.budgetForm.serviceLocationId || DEFAULT_SERVICE_LOCATION_ID} onValueChange={(value) => {
                    const municipality = availableMunicipalities.find((row) => `ine-${row.ineCode}` === value);
                    if (!municipality) return;
                    const location = buildServiceLocation(municipality);
                    store.setBudgetForm({ serviceLocationId: location.id, serviceAutonomousCommunity: location.autonomousCommunity, serviceProvince: location.province, serviceMunicipality: location.municipality });
                  }}>
                    <SelectTrigger id="service-municipality" className="h-9 w-full"><SelectValue placeholder="Selecciona localidad" /></SelectTrigger>
                    <SelectContent>{availableMunicipalities.map((municipality) => <SelectItem key={municipality.ineCode} value={`ine-${municipality.ineCode}`}>{municipality.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">La combinación fija festivos y convenio profesional aplicable.</p>
                </div>

                {/* Status (only admin or editing) */}
                {(isAdmin || isEditing) && (
                  <div className="space-y-1.5">
                    <Label htmlFor="budget-status" className="text-xs font-medium">
                      Estado
                    </Label>
                    <Select
                      value={store.budgetForm.status || 'borrador'}
                      onValueChange={(val) => store.setBudgetForm({ status: val as never })}
                      disabled={!isAdmin}
                    >
                      <SelectTrigger id="budget-status" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.entries(STATUS_LABELS) as [string, string][]
                        ).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Validity date */}
                <div className="space-y-1.5">
                  <Label htmlFor="valid-until" className="text-xs font-medium">
                    Fecha de validez
                  </Label>
                  <Input
                    id="valid-until"
                    type="date"
                    value={store.budgetForm.validUntil || ''}
                    onChange={(e) => store.setBudgetForm({ validUntil: e.target.value })}
                    className="h-9"
                  />
                </div>

                {/* Banda comercial negociable: ocho puntos sobre coste = 5% del precio inicial. */}
                {(
                  <div className="space-y-1.5">
                    <Label htmlFor="discount-percent" className="text-xs font-medium">
                      Descuento (%)
                    </Label>
                    <Select
                      value={String(Math.min(maxDiscount, Math.max(0, Math.round(store.budgetForm.discountPercent ?? 0))))}
                      onValueChange={(value) => store.setBudgetForm({ discountPercent: Number(value) })}
                    >
                      <SelectTrigger id="discount-percent" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: maxDiscount + 1 }, (_, value) => (
                          <SelectItem key={value} value={String(value)}>
                            {value === 0 ? 'Sin descuento (0%)' : `${value}% de descuento`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {maxDiscount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Máximo permitido: {maxDiscount}% (en puntos porcentuales).
                      </p>
                    )}
                    {store.budgetTotals && safeNumber(store.budgetForm.discountPercent) > 0 && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        Descuento aplicado: −{formatCurrency(store.budgetTotals.discountAmount)}. Recalcula tras cambiarlo.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="budget-desc" className="text-xs font-medium">
                  Descripción
                </Label>
                <Textarea
                  id="budget-desc"
                  value={store.budgetForm.description || ''}
                  onChange={(e) => store.setBudgetForm({ description: e.target.value })}
                  placeholder="Descripción del presupuesto..."
                  rows={3}
                  className="text-sm"
                />
              </div>

              {/* Client notes */}
              <div className="space-y-1.5">
                <Label htmlFor="client-notes" className="text-xs font-medium">
                  Notas para el cliente
                </Label>
                <Textarea
                  id="client-notes"
                  value={store.budgetForm.clientNotes || ''}
                  onChange={(e) => store.setBudgetForm({ clientNotes: e.target.value })}
                  placeholder="Notas que se incluirán en el documento enviado al cliente..."
                  rows={2}
                  className="text-sm"
                />
              </div>

              {/* Internal notes (admin only) */}
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label htmlFor="internal-notes" className="text-xs font-medium text-orange-600 dark:text-orange-400">
                    Notas internas
                  </Label>
                  <Textarea
                    id="internal-notes"
                    value={store.budgetForm.internalNotes || ''}
                    onChange={(e) =>
                      store.setBudgetForm({ internalNotes: e.target.value })
                    }
                    placeholder="Notas visibles solo para administradores..."
                    rows={2}
                    className="text-sm border-orange-200 dark:border-orange-800"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Section 2: Service Blocks ─────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Bloques de servicio
              </h2>
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddBlockMenuOpen((prev) => !prev)}
                  onBlur={() => setTimeout(() => setAddBlockMenuOpen(false), 150)}
                  className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Añadir bloque
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
                {addBlockMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-gray-900 border rounded-lg shadow-lg z-50 py-1">
                    {(Object.entries(BLOCK_TYPE_PRESETS) as [BlockType, { label: string; icon: string }][]).map(
                      ([type, preset]) => (
                        <button
                          key={type}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950 flex items-center gap-2 transition-colors"
                          onClick={() => handleAddBlock(type)}
                        >
                          <span className="text-muted-foreground text-xs">+</span>
                          {preset.label}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>

            {store.serviceBlocks.map((block, index) => renderServiceBlock(block, index))}
          </div>

          {/* ─── Section 3: Budget Totals ─────────────────────── */}
          {calculationPending.length > 0 && (
            <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                El presupuesto sigue en borrador: Administración debe completar {calculationPending.length} dato(s) económico(s).
              </AlertDescription>
            </Alert>
          )}
          {store.budgetTotals && (
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-emerald-600" />
                  Resumen del presupuesto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-w-md ml-auto space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Precio inicial sin IVA</span>
                    <span className="font-medium">
                      {formatCurrency(store.budgetTotals.subtotal)}
                    </span>
                  </div>
                  {store.budgetTotals.discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Descuento
                        {store.budgetForm.discountPercent
                          ? ` (${store.budgetForm.discountPercent}%)`
                          : ''}
                      </span>
                      <span className="font-medium text-red-600">
                        −{formatCurrency(store.budgetTotals.discountAmount)}
                      </span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Base imponible</span>
                    <span className="font-semibold">
                      {formatCurrency(
                        store.budgetTotals.subtotal +
                          store.budgetTotals.totalSurcharges -
                          store.budgetTotals.discountAmount
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      IVA por partidas
                    </span>
                    <span className="font-medium">
                      {formatCurrency(store.budgetTotals.ivaAmount)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-lg font-bold">TOTAL</span>
                    <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(store.budgetTotals.totalFinal)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ─── Sticky Action Bar ────────────────────────────────── */}
      <div className={embedded
        ? 'sticky bottom-0 border-t bg-white shadow-lg dark:bg-gray-950 z-40'
        : 'fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-950 border-t shadow-lg z-50'}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          {!embedded && <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="h-9"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Volver
          </Button>}

          <div className="flex items-center gap-2">
            {isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPdf}
                className="h-9"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Exportar PDF
              </Button>
            )}
            {isEditing && canExportCommercialPdf && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCommercialPdf}
                className="h-9 border-blue-300 text-blue-800 hover:bg-blue-50"
              >
                <FileText className="h-4 w-4 mr-1.5" />
                PDF comercial
              </Button>
            )}

            <Button
              size="sm"
              onClick={handleCalculate}
              disabled={calculating || store.serviceBlocks.length === 0}
              className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {calculating ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white mr-1.5" />
                  Calculando...
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4 mr-1.5" />
                  Calcular
                </>
              )}
            </Button>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white mr-1.5" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1.5" />
                  {isEditing ? 'Actualizar' : 'Guardar'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
