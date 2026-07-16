import { create } from 'zustand';
import { DEFAULT_SERVICE_LOCATION_ID, getServiceLocation } from '@/lib/service-locations';
import type { AppView, UserRole, BudgetInput, ServiceBlockInput, ClientDTO, BlockCalculationResult, BudgetCalculationResult, CategoryDTO, SurchargeConfigDTO, LaborRuleDTO, HolidayInfo, BlockType } from '@/lib/types';

interface AppState {
  currentView: AppView;
  editingBudgetId: string | null;
  setView: (view: AppView) => void;
  editBudget: (id: string) => void;
  newBudget: () => void;
  currentUser: { id: string; email: string; name: string; role: string; mustChangePassword?: boolean } | null;
  setCurrentUser: (u: { id: string; email: string; name: string; role: string; mustChangePassword?: boolean } | null) => void;
  currentRole: UserRole;
  setRole: (role: UserRole) => void;
  isAdmin: () => boolean;
  clients: ClientDTO[];
  categories: CategoryDTO[];
  surcharges: SurchargeConfigDTO[];
  laborRule: LaborRuleDTO | null;
  holidays: HolidayInfo[];
  appConfig: Record<string, string>;
  setClients: (c: ClientDTO[]) => void;
  setCategories: (c: CategoryDTO[]) => void;
  setSurcharges: (s: SurchargeConfigDTO[]) => void;
  setLaborRule: (r: LaborRuleDTO | null) => void;
  setHolidays: (h: HolidayInfo[]) => void;
  setAppConfig: (c: Record<string, string>) => void;
  budgetForm: BudgetInput;
  serviceBlocks: ServiceBlockInput[];
  blockResults: BlockCalculationResult[];
  budgetTotals: BudgetCalculationResult | null;
  setBudgetForm: (f: Partial<BudgetInput>) => void;
  setServiceBlocks: (b: ServiceBlockInput[]) => void;
  updateServiceBlock: (index: number, b: Partial<ServiceBlockInput>) => void;
  addServiceBlock: (b: ServiceBlockInput) => void;
  removeServiceBlock: (index: number) => void;
  setBlockResults: (r: BlockCalculationResult[]) => void;
  setBudgetTotals: (t: BudgetCalculationResult | null) => void;
  resetBudgetForm: () => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  loading: boolean;
  setLoading: (l: boolean) => void;
}

const emptyBudgetForm: BudgetInput = {
  clientId: '',
  description: '',
  validUntil: '',
  status: 'borrador',
  discountPercent: 0,
  ivaPercent: 21,
  clientNotes: '',
  internalNotes: '',
  serviceLocationId: DEFAULT_SERVICE_LOCATION_ID,
  serviceAutonomousCommunity: getServiceLocation(DEFAULT_SERVICE_LOCATION_ID).autonomousCommunity,
  serviceProvince: getServiceLocation(DEFAULT_SERVICE_LOCATION_ID).province,
  serviceMunicipality: getServiceLocation(DEFAULT_SERVICE_LOCATION_ID).municipality,
  serviceBlocks: [],
};

export const emptyBlock: ServiceBlockInput = {
  blockType: 'profesional_hora',
  serviceName: '',
  professionalCategory: '',
  puestosSimultaneos: 1,
  plantillaSeleccionada: 1,
  pricePerHour: 0,
  contractType: 'temporal',
  dateMode: 'range',
  specificDates: [],
  dateRangeStart: '',
  dateRangeEnd: '',
  daysOfWeek: [1, 2, 3, 4, 5],
  excludeSundays: true,
  excludeHolidays: true,
  holidayTypesExcluded: ['nacional', 'autonomico'],
  shiftType: 'morning',
  shiftStartTime: '',
  shiftEndTime: '',
  hoursPerDay: 8,
  breakMinutes: 0,
  unitType: 'hora',
  quantity: 1,
  enabledSurcharges: [],
};

// ─── Block type presets ─────────────────────────────────────────

export const BLOCK_TYPE_PRESETS: Record<BlockType, { label: string; icon: string; block: ServiceBlockInput }> = {
  profesional_hora: {
    label: 'Profesional por hora',
    icon: 'Users',
    block: { ...emptyBlock, blockType: 'profesional_hora' },
  },
  servicio_fijo: {
    label: 'Servicio fijo',
    icon: 'FileText',
    block: {
      ...emptyBlock,
      blockType: 'servicio_fijo',
      serviceName: 'Servicio fijo',
      unitType: 'servicio',
      pricePerHour: 0,
      fixedPrice: 0,
      quantity: 1,
    },
  },
  material: {
    label: 'Material',
    icon: 'Package',
    block: {
      ...emptyBlock,
      blockType: 'material',
      serviceName: 'Material',
      unitType: 'unidad',
      pricePerHour: 0,
      quantity: 1,
    },
  },
  desplazamiento: {
    label: 'Desplazamiento',
    icon: 'Car',
    block: {
      ...emptyBlock,
      blockType: 'desplazamiento',
      serviceName: 'Desplazamiento',
      unitType: 'kilometro',
      pricePerHour: 0,
      quantity: 1,
    },
  },
  dietas: {
    label: 'Dietas',
    icon: 'UtensilsCrossed',
    block: {
      ...emptyBlock,
      blockType: 'dietas',
      serviceName: 'Dietas',
      unitType: 'dia',
      pricePerHour: 0,
      quantity: 1,
    },
  },
  alojamiento: {
    label: 'Alojamiento',
    icon: 'Hotel',
    block: {
      ...emptyBlock,
      blockType: 'alojamiento',
      serviceName: 'Alojamiento',
      unitType: 'servicio',
      pricePerHour: 0,
      quantity: 1,
      accommodationNights: 1,
      accommodationPersons: 1,
    } as ServiceBlockInput,
  },
  ambulancia: {
    label: 'Ambulancia/Transporte sanitario',
    icon: 'Siren',
    block: {
      ...emptyBlock,
      blockType: 'ambulancia',
      serviceName: 'Ambulancia/Transporte sanitario',
      unitType: 'servicio',
      pricePerHour: 0,
      fixedPrice: 0,
      quantity: 1,
    },
  },
  telemedicina: {
    label: 'Telemedicina',
    icon: 'Video',
    block: {
      ...emptyBlock,
      blockType: 'telemedicina',
      serviceName: 'Telemedicina',
      unitType: 'servicio',
      pricePerHour: 0,
      fixedPrice: 0,
      quantity: 1,
    },
  },
  curso: {
    label: 'Curso/Formación',
    icon: 'GraduationCap',
    block: {
      ...emptyBlock,
      blockType: 'curso',
      serviceName: 'Curso',
      unitType: 'curso',
      pricePerHour: 0,
      quantity: 4,
      courseName: '',
      courseTeacher: '',
      courseModality: 'presencial',
      courseSessions: 1,
    },
  },
  otros: {
    label: 'Otros',
    icon: 'MoreHorizontal',
    block: {
      ...emptyBlock,
      blockType: 'otros',
      serviceName: '',
      unitType: 'servicio',
      pricePerHour: 0,
      fixedPrice: 0,
      quantity: 1,
    },
  },
};

export const SIMPLE_BLOCK_TYPES: BlockType[] = [
  'servicio_fijo', 'material', 'desplazamiento', 'dietas',
  'alojamiento', 'ambulancia', 'telemedicina', 'curso', 'otros',
];

export const useAppStore = create<AppState>((set, get) => ({
  currentView: 'dashboard',
  editingBudgetId: null,
  setView: (view) => set({ currentView: view }),
  editBudget: (id) => set({ currentView: 'budget-edit', editingBudgetId: id }),
  newBudget: () => set({ currentView: 'budget-new', editingBudgetId: null, budgetForm: { ...emptyBudgetForm }, serviceBlocks: [], blockResults: [], budgetTotals: null }),
  currentUser: null,
  setCurrentUser: (u) => set({ currentUser: u }),
  currentRole: 'comercial',
  setRole: (role) => set({ currentRole: role }),
  isAdmin: () => get().currentRole === 'admin' || get().currentRole === 'maestro',
  clients: [],
  categories: [],
  surcharges: [],
  laborRule: null,
  holidays: [],
  appConfig: {},
  setClients: (c) => set({ clients: c }),
  setCategories: (c) => set({ categories: c }),
  setSurcharges: (s) => set({ surcharges: s }),
  setLaborRule: (r) => set({ laborRule: r }),
  setHolidays: (h) => set({ holidays: h }),
  setAppConfig: (c) => set({ appConfig: c }),
  budgetForm: { ...emptyBudgetForm },
  serviceBlocks: [],
  blockResults: [],
  budgetTotals: null,
  setBudgetForm: (f) => set((s) => ({
    budgetForm: { ...s.budgetForm, ...f },
    budgetTotals: f.discountPercent !== undefined || f.ivaPercent !== undefined || f.serviceLocationId !== undefined
      ? null
      : s.budgetTotals,
  })),
  setServiceBlocks: (b) => set({ serviceBlocks: b }),
  updateServiceBlock: (index, b) => set((s) => {
    const blocks = [...s.serviceBlocks];
    blocks[index] = { ...blocks[index], ...b };
    return { serviceBlocks: blocks, budgetTotals: null };
  }),
  addServiceBlock: (b) => set((s) => ({ serviceBlocks: [...s.serviceBlocks, b], budgetTotals: null })),
  removeServiceBlock: (index) => set((s) => ({
    serviceBlocks: s.serviceBlocks.filter((_, i) => i !== index),
    budgetTotals: null,
  })),
  setBlockResults: (r) => set({ blockResults: r }),
  setBudgetTotals: (t) => set({ budgetTotals: t }),
  resetBudgetForm: () => set({
    budgetForm: { ...emptyBudgetForm },
    serviceBlocks: [],
    blockResults: [],
    budgetTotals: null,
    editingBudgetId: null,
  }),
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  loading: false,
  setLoading: (l) => set({ loading: l }),
}));

