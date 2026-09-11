'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import {
  LayoutDashboard, FilePlus, Users, Settings,
  Menu, X, LogOut, Shield, Mail, Activity, BadgeEuro,
} from 'lucide-react';
import type { AppView, UserRole } from '@/lib/types';
import ComercialImportDialog from '@/components/comercial-import-dialog';
import BudgetBlockControls from '@/components/budget-block-controls';

const DEV_ROLE_SWITCH = process.env.NEXT_PUBLIC_DEV_ROLE_SWITCH === 'true' && process.env.NODE_ENV === 'development';
const DUPLICATE_DRAFT_KEY = 'mediquote:duplicate-draft:v1';

const navItems: { view: AppView; label: string; icon: React.ReactNode; roles?: UserRole[] }[] = [
  { view: 'dashboard', label: 'Presupuestos', icon: <LayoutDashboard className="w-4 h-4" /> },
  { view: 'budget-new', label: 'Nuevo Presupuesto', icon: <FilePlus className="w-4 h-4" /> },
  { view: 'clients', label: 'Clientes', icon: <Users className="w-4 h-4" /> },
  { view: 'communications', label: 'Buzón interno', icon: <Mail className="w-4 h-4" /> },
  { view: 'cost-audit', label: 'Auditoría de costes', icon: <Activity className="w-4 h-4" />, roles: ['admin', 'maestro'] },
  { view: 'admin', label: 'Administración', icon: <Settings className="w-4 h-4" />, roles: ['admin', 'maestro'] },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { currentView, currentRole, currentUser, sidebarOpen, toggleSidebar, setView, newBudget, setRole, setCurrentUser } = useAppStore();
  const isAdmin = currentRole === 'admin' || currentRole === 'maestro';
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/notifications', { cache: 'no-store' });
        if (response.ok && active) setUnreadCount(Number((await response.json()).unreadCount ?? 0));
      } catch { /* el buzón sigue disponible aunque falle el contador */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [currentUser]);

  const handleNav = async (view: AppView) => {
    if (view === 'budget-new') {
      // "Nuevo Presupuesto" is an explicit request for a clean workspace. A
      // duplicate draft is only a temporary recovery aid for the duplicate flow
      // and must never bleed into an unrelated new quote.
      try { window.sessionStorage.removeItem(DUPLICATE_DRAFT_KEY); } catch { /* non-critical convenience state */ }
      newBudget();
    } else {
      setView(view);
    }
    if (view === 'communications' && unreadCount > 0) {
      setUnreadCount(0);
      try {
        await fetch('/api/notifications', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }),
        });
      } catch { /* no bloquea la navegación */ }
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth?action=logout', { method: 'POST' });
    } catch { /* server clears cookie */ }
    setCurrentUser(null);
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-16'
        } bg-white border-r border-gray-200 flex flex-col transition-all duration-200 flex-shrink-0`}
      >
        <div className="h-16 flex items-center px-3 border-b border-gray-200 gap-2">
          <Image
            src="/branding/gasi-logo.png"
            alt="GASI"
            width={sidebarOpen ? 100 : 28}
            height={sidebarOpen ? 36 : 28}
            className="object-contain flex-shrink-0"
          />
          {sidebarOpen && (
            <div className="min-w-0">
              <span className="font-bold text-gray-800 text-sm block truncate">Presupuestos Sanitarios</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8 flex-shrink-0"
            onClick={toggleSidebar}
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>

        <nav className="flex-1 py-2">
          {navItems
            .filter((item) => !item.roles || item.roles.includes(currentRole))
            .map((item) => {
              const active = currentView === item.view || (item.view === 'budget-new' && currentView === 'budget-new');
              return (
                <button
                  key={item.view}
                  onClick={() => handleNav(item.view)}
                  className={`relative w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    active
                      ? 'bg-emerald-50 text-emerald-700 border-r-2 border-emerald-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {item.icon}
                  {sidebarOpen && <span className="flex min-w-0 flex-1 items-center justify-between gap-2"><span className="truncate">{item.label}</span>{item.view === 'communications' && unreadCount > 0 && <span className="min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}</span>}
                  {!sidebarOpen && item.view === 'communications' && unreadCount > 0 && <span className="absolute ml-3 -mt-4 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white" />}
                </button>
              );
            })}

          {isAdmin && (
            <a
              href="/economia-interna"
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              title="Configuración económica interna"
            >
              <BadgeEuro className="w-4 h-4" />
              {sidebarOpen && <span className="truncate">Economía interna</span>}
            </a>
          )}

          {!isAdmin && sidebarOpen && (
            <div className="mt-1">
              <Separator className="mb-1" />
              <ComercialImportDialog />
            </div>
          )}
          {!isAdmin && !sidebarOpen && (
            <ComercialImportDialog />
          )}
        </nav>

        <Separator />

        <div className="p-3">
          {sidebarOpen ? (
            <div className="space-y-2">
              <div className="px-1 text-xs text-gray-500 truncate">
                {currentUser?.name || '—'}
              </div>
              <div className="px-1 text-xs text-gray-400 truncate">
                {currentUser?.email || '—'} ({currentRole})
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleLogout}
              >
                <LogOut className="w-3 h-3 mr-1" />
                Cerrar sesión
              </Button>
              {currentUser?.mustChangePassword && (
                <a
                  href="/cambiar-password"
                  className="block w-full text-center text-xs h-7 leading-7 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
                >
                  Debes cambiar la contraseña
                </a>
              )}
              {DEV_ROLE_SWITCH && (
                <div className="flex items-center gap-1 px-1">
                  <Shield className="w-3 h-3 text-amber-500" />
                  <span className="text-xs text-amber-600">DEV</span>
                  <div className="flex gap-1">
                    {(['comercial', 'admin'] as UserRole[]).map((role) => (
                      <Button
                        key={role}
                        variant={currentRole === role ? 'default' : 'outline'}
                        size="sm"
                        className={`flex-1 text-xs h-6 ${currentRole === role ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                        onClick={() => setRole(role)}
                      >
                        {role === 'comercial' ? 'Com' : 'Adm'}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="w-full h-8"
              onClick={handleLogout}
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>

        {sidebarOpen && (
          <div className="px-3 pb-3">
            <p className="text-[10px] text-gray-400 leading-tight">
              Bajo licencia habilitada de MediQuote Pro
            </p>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <BudgetBlockControls />
        {children}
      </main>
    </div>
  );
}
