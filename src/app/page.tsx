'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import AppShell from '@/components/app-shell';
import Dashboard from '@/components/views/dashboard';
import BudgetForm from '@/components/views/budget-form';
import Clients from '@/components/views/clients';
import Admin from '@/components/views/admin';
import Communications from '@/components/views/communications';
import CostAudit from '@/components/views/cost-audit';
import type { AppView, BudgetInput, ServiceBlockInput } from '@/lib/types';

const DUPLICATE_DRAFT_KEY = 'mediquote:duplicate-draft:v1';

type DuplicateDraft = {
  budgetForm: Partial<BudgetInput>;
  serviceBlocks: ServiceBlockInput[];
};

const URL_VIEWS = new Set<AppView>([
  'dashboard',
  'budget-new',
  'budget-edit',
  'clients',
  'communications',
  'cost-audit',
  'admin',
  'history',
]);

function readDuplicateDraft(): DuplicateDraft | null {
  try {
    const raw = window.sessionStorage.getItem(DUPLICATE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DuplicateDraft;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.serviceBlocks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearDuplicateDraft() {
  try {
    window.sessionStorage.removeItem(DUPLICATE_DRAFT_KEY);
  } catch {
    // Session storage is a navigation convenience only; persistence already
    // succeeded server-side, so storage failures must not break the workspace.
  }
}

function stateFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get('view') as AppView | null;
  const requestedView = rawView && URL_VIEWS.has(rawView) ? rawView : 'dashboard';
  const budgetId = params.get('budgetId');

  if (requestedView === 'budget-edit' && !budgetId) {
    return { currentView: 'dashboard' as AppView, editingBudgetId: null };
  }

  if (requestedView === 'budget-new') {
    const duplicateDraft = readDuplicateDraft();
    if (duplicateDraft) {
      return {
        currentView: requestedView,
        editingBudgetId: null,
        budgetForm: { ...useAppStore.getInitialState().budgetForm, ...duplicateDraft.budgetForm },
        serviceBlocks: duplicateDraft.serviceBlocks,
        blockResults: [],
        budgetTotals: null,
        skipNextInitialEmptyBlock: duplicateDraft.serviceBlocks.length > 0,
      };
    }

    // Browser history can revisit ?view=budget-new after a duplicate was saved.
    // Reconstruct a genuinely new quote instead of retaining the in-memory form
    // of the saved duplicate. BudgetForm is keyed by route state below, so its
    // mount effect will add the single starter block.
    return {
      currentView: requestedView,
      editingBudgetId: null,
      budgetForm: { ...useAppStore.getInitialState().budgetForm },
      serviceBlocks: [],
      blockResults: [],
      budgetTotals: null,
      skipNextInitialEmptyBlock: false,
    };
  }

  return {
    currentView: requestedView,
    editingBudgetId: requestedView === 'budget-edit' ? budgetId : null,
  };
}

function locationForState(view: AppView, editingBudgetId: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete('view');
  url.searchParams.delete('budgetId');

  if (view !== 'dashboard') url.searchParams.set('view', view);
  if (view === 'budget-edit' && editingBudgetId) url.searchParams.set('budgetId', editingBudgetId);

  return `${url.pathname}${url.search}${url.hash}`;
}

export default function Home() {
  const { currentView, currentRole, setClients, setCategories, setSurcharges, setLaborRule, setHolidays, setAppConfig, setCurrentUser, setRole } = useAppStore();

  // Keep the workspace state addressable so refresh and browser Back/Forward
  // reconstruct the same screen instead of silently dropping an in-progress edit.
  useEffect(() => {
    let applyingHistory = false;

    const applyLocation = () => {
      applyingHistory = true;
      useAppStore.setState(stateFromLocation());
      applyingHistory = false;
    };

    applyLocation();

    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (applyingHistory) return;

      // A successful POST of a new budget first transitions from budget-new to
      // budget-edit with the server-issued id. At that exact boundary the
      // temporary duplicate draft has fulfilled its purpose and must be removed,
      // otherwise Back/Forward or a later ?view=budget-new can resurrect an
      // already-persisted copy and invite a second save.
      if (
        previous.currentView === 'budget-new' &&
        state.currentView === 'budget-edit' &&
        Boolean(state.editingBudgetId)
      ) {
        clearDuplicateDraft();
      }

      if (state.currentView === previous.currentView && state.editingBudgetId === previous.editingBudgetId) return;

      const nextLocation = locationForState(state.currentView, state.editingBudgetId);
      const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextLocation !== currentLocation) window.history.pushState(null, '', nextLocation);
    });

    window.addEventListener('popstate', applyLocation);
    return () => {
      unsubscribe();
      window.removeEventListener('popstate', applyLocation);
    };
  }, []);

  // Auth check on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth?action=me');
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setCurrentUser(data.user);
            setRole(data.user.role as 'maestro' | 'admin' | 'comercial');
          }
        } else {
          window.location.href = '/login';
          return;
        }

        // Load config data
        const configRes = await fetch('/api/config?type=all');
        if (configRes.ok) {
          const configData = await configRes.json();
          if (configData.categories) setCategories(configData.categories);
          if (configData.surcharges) setSurcharges(configData.surcharges);
          if (configData.laborRules && configData.laborRules.length > 0) setLaborRule(configData.laborRules[0]);
          if (configData.holidays) setHolidays(configData.holidays);
          if (configData.appConfig) setAppConfig(configData.appConfig);
        }
      } catch (e) {
        console.error('Error loading config:', e);
      }
    }
    checkAuth();
  }, [setClients, setCategories, setSurcharges, setLaborRule, setHolidays, setAppConfig, setCurrentUser, setRole]);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'budget-new':
      case 'budget-edit':
        return <BudgetForm key={`${currentView}:${useAppStore.getState().editingBudgetId ?? 'new'}`} />;
      case 'clients':
        return <Clients />;
      case 'communications':
        return <Communications />;
      case 'cost-audit':
        if (currentRole !== 'admin' && currentRole !== 'maestro') return <Dashboard />;
        return <CostAudit />;
      case 'admin':
        if (currentRole !== 'admin' && currentRole !== 'maestro') return <Dashboard />;
        return <Admin />;
      case 'history':
        return <Dashboard />; // Reuse dashboard with history filter for now
      default:
        return <Dashboard />;
    }
  };

  return (
    <AppShell>
      <div className="flex-1 p-4 md:p-6 overflow-auto">
        {renderView()}
      </div>
    </AppShell>
  );
}
