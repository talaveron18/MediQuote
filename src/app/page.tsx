'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import AppShell from '@/components/app-shell';
import Dashboard from '@/components/views/dashboard';
import BudgetForm from '@/components/views/budget-form';
import Clients from '@/components/views/clients';
import Admin from '@/components/views/admin';
import Communications from '@/components/views/communications';

export default function Home() {
  const { currentView, currentRole, setClients, setCategories, setSurcharges, setLaborRule, setHolidays, setAppConfig, setCurrentUser, setRole } = useAppStore();

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
        return <BudgetForm />;
      case 'clients':
        return <Clients />;
      case 'communications':
        return <Communications />;
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
