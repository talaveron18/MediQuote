'use client';

import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import {
  LayoutDashboard, FilePlus, Users, Settings,
  Menu, X, LogOut, Shield,
} from 'lucide-react';
import type { AppView, UserRole } from '@/lib/types';
import ComercialImportDialog from '@/components/comercial-import-dialog';

const DEV_ROLE_SWITCH = process.env.NEXT_PUBLIC_DEV_ROLE_SWITCH === 'true' && process.env.NODE_ENV === 'development';

const navItems: { view: AppView; label: string; icon: React.ReactNode; roles?: UserRole[] }[] = [
  { view: 'dashboard', label: 'Presupuestos', icon: <LayoutDashboard className="w-4 h-4" /> },
  { view: 'budget-new', label: 'Nuevo Presupuesto', icon: <FilePlus className="w-4 h-4" /> },
  { view: 'clients', label: 'Clientes', icon: <Users className="w-4 h-4" /> },
  { view: 'admin', label: 'Administración', icon: <Settings className="w-4 h-4" />, roles: ['admin', 'maestro'] },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { currentView, currentRole, currentUser, sidebarOpen, toggleSidebar, setView, newBudget, setRole, setCurrentUser } = useAppStore();
  const isAdmin = currentRole === 'admin';

  const handleNav = (view: AppView) => {
    if (view === 'budget-new') {
      newBudget();
    } else {
      setView(view);
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
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-16'
        } bg-white border-r border-gray-200 flex flex-col transition-all duration-200 flex-shrink-0`}
      >
        {/* Logo / Brand */}
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

        {/* Navigation */}
        <nav className="flex-1 py-2">
          {navItems
            .filter((item) => !item.roles || item.roles.includes(currentRole))
            .map((item) => {
              const active = currentView === item.view || (item.view === 'budget-new' && currentView === 'budget-new');
              return (
                <button
                  key={item.view}
                  onClick={() => handleNav(item.view)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    active
                      ? 'bg-emerald-50 text-emerald-700 border-r-2 border-emerald-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {item.icon}
                  {sidebarOpen && <span>{item.label}</span>}
                </button>
              );
            })}

          {/* Remote config import for non-admin roles */}
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

        {/* User info + logout + dev role switch */}
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

        {/* License line — only visible when sidebar is open */}
        {sidebarOpen && (
          <div className="px-3 pb-3">
            <p className="text-[10px] text-gray-400 leading-tight">
              Bajo licencia habilitada de MediQuote Pro
            </p>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
}