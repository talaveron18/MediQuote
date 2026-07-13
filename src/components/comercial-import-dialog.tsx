'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Upload, RefreshCw, AlertTriangle, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface CheckResult {
  hasNewConfig: boolean;
  configVersion: string;
  exportedAt: string;
  exportedBy: string;
  localLastImport?: string;
  error?: string;
}

// ─── Comercial Remote Import Dialog ────────────────────────
// Shown as a dialog (not a view) so commercial users don't access admin panel.

export default function ComercialImportDialog() {
  const { currentRole } = useAppStore();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [alreadyChecked, setAlreadyChecked] = useState(false);

  // Auto-check on mount
  const autoCheck = useCallback(async () => {
    try {
      const res = await fetch('/api/remote-config?type=check');
      if (res.ok) {
        const data = await res.json();
        if (data.hasNewConfig) {
          setCheckResult(data);
          setOpen(true);
        }
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (currentRole !== 'admin') {
      autoCheck();
    }
  }, [currentRole, autoCheck]);

  // Manual check
  const handleCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/remote-config?type=check');
      if (res.ok) {
        const data = await res.json();
        setCheckResult(data);
        setAlreadyChecked(true);
        if (data.error) {
          toast.error('Error', { description: data.error });
        } else if (!data.hasNewConfig) {
          toast.info('No hay configuración nueva disponible.');
        }
      }
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    } finally {
      setChecking(false);
    }
  };

  // Import
  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch('/api/remote-config?type=import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: 'comercial@gasi.es',
          userName: 'Comercial',
          role: 'comercial',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const changes = Object.entries(data.changesApplied || {})
          .filter(([, v]: [string, unknown]) => (v as number) > 0)
          .map(([k, v]: [string, unknown]) => `${k}: ${v}`)
          .join(', ');
        toast.success('Configuración importada correctamente', {
          description: changes ? `Cambios: ${changes}` : 'Sin cambios aplicados.',
        });
        setOpen(false);
        setCheckResult(null);
        // Reload store config
        const store = useAppStore.getState();
        const configRes = await fetch('/api/config?type=all');
        if (configRes.ok) {
          const cfg = await configRes.json();
          if (cfg.categories) store.setCategories(cfg.categories);
          if (cfg.surcharges) store.setSurcharges(cfg.surcharges);
          if (cfg.laborRules?.length > 0) store.setLaborRule(cfg.laborRules[0]);
          if (cfg.holidays) store.setHolidays(cfg.holidays);
          if (cfg.appConfig) store.setAppConfig(cfg.appConfig);
        }
      } else {
        toast.error('Error al importar', {
          description: data.errors?.join('; ') || data.error || 'Error desconocido',
        });
      }
      if (data.warnings?.length > 0) {
        data.warnings.forEach((w: string) => toast.warning(w));
      }
    } catch (e: any) {
      toast.error('Error de conexión', { description: e.message });
    } finally {
      setImporting(false);
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return d; }
  };

  // Only show for non-admin roles
  if (currentRole === 'admin') return null;

  return (
    <>
      {/* Trigger button in sidebar — this is rendered by app-shell */}
      <button
        onClick={handleCheck}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        title="Comprobar configuración remota"
      >
        <Upload className="w-4 h-4" />
        <span>Importar Config.</span>
      </button>

      {/* Auto-check Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              Configuración remota disponible
            </DialogTitle>
            <DialogDescription>
              Se ha detectado un archivo de configuración nuevo en la carpeta remota.
            </DialogDescription>
          </DialogHeader>

          {checkResult && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-gray-500">Versión:</span>
                  <span className="ml-1 font-medium">{checkResult.configVersion || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Exportada por:</span>
                  <span className="ml-1 font-medium">{checkResult.exportedBy || 'N/A'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Fecha:</span>
                  <span className="ml-1 font-medium">{formatDate(checkResult.exportedAt)}</span>
                </div>
              </div>

              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Los precios y configuración se sobrescribirán con los valores aprobados por administración. No podrás modificarlos manualmente.</span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Ahora no
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {importing ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Importando...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Aplicar configuración</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}