'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Upload, Download, RefreshCw, FileCheck, AlertTriangle, Clock, CheckCircle, XCircle, Info,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  action: string;
  userEmail: string | null;
  userName: string | null;
  role: string | null;
  oldVersion: string | null;
  newVersion: string | null;
  changesApplied: string | null;
  fileSource: string | null;
  result: string;
  errorMessage: string | null;
  createdAt: string;
}

interface CheckResult {
  hasNewConfig: boolean;
  configVersion: string;
  exportedAt: string;
  exportedBy: string;
  localLastImport?: string;
  error?: string;
}

// ─── Component ──────────────────────────────────────────────

export default function RemoteConfigPanel() {
  const { currentRole } = useAppStore();
  const isAdmin = currentRole === 'admin';
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importPreview, setImportPreview] = useState<{ errors: string[]; warnings: string[]; version: string } | null>(null);

  const loadAuditLog = useCallback(async () => {
    try {
      const res = await fetch('/api/remote-config?type=audit');
      if (res.ok) {
        const data = await res.json();
        setAuditLog(data);
      }
    } catch (e) {
      console.error('Error loading audit log:', e);
    }
  }, []);

  const checkForConfig = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/remote-config?type=check');
      if (res.ok) {
        const data = await res.json();
        setCheckResult(data);
        if (data.hasNewConfig) {
          setShowImportDialog(true);
        }
      }
    } catch (e) {
      console.error('Error checking config:', e);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    loadAuditLog();
  }, [loadAuditLog]);

  // ── Export ──
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/remote-config?type=export&user=admin@gasi.es');
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message, {
          description: `Archivo generado: ${data.path} (v${data.version})`,
        });
        loadAuditLog();
      } else {
        toast.error('Error al exportar', { description: data.error });
      }
    } catch (e: any) {
      toast.error('Error de conexión', { description: e.message });
    } finally {
      setExporting(false);
    }
  };

  // ── Import ──
  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch('/api/remote-config?type=import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: currentRole === 'admin' ? 'admin@gasi.es' : 'comercial@gasi.es',
          userName: currentRole === 'admin' ? 'Administrador' : 'Comercial',
          role: currentRole,
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
        setShowImportDialog(false);
        setCheckResult(null);
        // Reload all config in the store
        await reloadStoreConfig();
        loadAuditLog();
      } else {
        toast.error('Error al importar', {
          description: data.errors?.join('; ') || data.error || 'Error desconocido',
        });
      }
      if (data.warnings?.length > 0) {
        data.warnings.forEach((w: string) => {
          toast.warning(w);
        });
      }
    } catch (e: any) {
      toast.error('Error de conexión', { description: e.message });
    } finally {
      setImporting(false);
    }
  };

  // Reload store config after import
  const reloadStoreConfig = async () => {
    try {
      const res = await fetch('/api/config?type=all');
      if (res.ok) {
        const data = await res.json();
        const store = useAppStore.getState();
        if (data.categories) store.setCategories(data.categories);
        if (data.surcharges) store.setSurcharges(data.surcharges);
        if (data.laborRules?.length > 0) store.setLaborRule(data.laborRules[0]);
        if (data.holidays) store.setHolidays(data.holidays);
        if (data.appConfig) store.setAppConfig(data.appConfig);
      }
    } catch (e) {
      console.error('Error reloading config:', e);
    }
  };

  // ── Check & Preview ──
  const handleCheckAndPreview = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/remote-config?type=check');
      if (res.ok) {
        const data = await res.json();
        setCheckResult(data);
        if (data.error) {
          toast.error('Error', { description: data.error });
          return;
        }
        if (!data.hasNewConfig) {
          toast.info('No hay configuración nueva disponible.');
          return;
        }
        // Show import dialog with info
        setImportPreview(null);
        setShowImportDialog(true);
      }
    } catch (e: any) {
      toast.error('Error', { description: e.message });
    } finally {
      setChecking(false);
    }
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return d;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'export': return 'Exportación';
      case 'import': return 'Importación';
      case 'import_error': return 'Error de importación';
      case 'auto_check': return 'Check automático';
      default: return action;
    }
  };

  const parseChanges = (json: string | null) => {
    if (!json) return '-';
    try {
      const obj = JSON.parse(json);
      return Object.entries(obj)
        .filter(([, v]: [string, unknown]) => (v as number) > 0)
        .map(([k, v]: [string, unknown]) => `${k}: ${v}`)
        .join(', ') || 'Sin cambios';
    } catch {
      return json;
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Action Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Admin: Export */}
        {isAdmin && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-600" />
                Exportar configuración remota
              </CardTitle>
              <CardDescription className="text-xs">
                Genera gasi-config.json en la carpeta remote-config/ para sincronizar con el comercial.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleExport}
                disabled={exporting}
                className="w-full"
              >
                {exporting ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Exportando...</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" /> Exportar a remote-config/gasi-config.json</>
                )}
              </Button>
              <p className="text-xs text-gray-500 mt-2">
                La administración puede copiar este archivo a la carpeta sincronizada (Drive/OneDrive/Dropbox).
              </p>
            </CardContent>
          </Card>
        )}

        {/* Import (both roles, but commercial is read-only for prices) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-600" />
              Importar configuración remota
              {!isAdmin && (
                <Badge variant="outline" className="text-xs ml-1">Solo lectura</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              Lee gasi-config.json de la carpeta remota y aplica la configuración.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              onClick={handleCheckAndPreview}
              disabled={checking}
              variant={checkResult?.hasNewConfig ? 'default' : 'outline'}
              className="w-full"
            >
              {checking ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Comprobando...</>
              ) : (
                <><FileCheck className="w-4 h-4 mr-2" /> Comprobar y previsualizar importación</>
              )}
            </Button>
            {!isAdmin && (
              <p className="text-xs text-amber-600 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Como comercial, no puedes modificar precios manualmente. Solo puedes importar configuración aprobada por administración.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Status ────────────────────────────────────────── */}
      {checkResult && !checkResult.hasNewConfig && (
        <Card className="bg-gray-50">
          <CardContent className="py-3 flex items-center gap-2 text-sm text-gray-600">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span>La configuración local está al día.</span>
            {checkResult.localLastImport && (
              <span className="text-xs text-gray-400">
                Última importación: {formatDate(checkResult.localLastImport)}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Import Dialog ─────────────────────────────────── */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              Configuración remota disponible
            </DialogTitle>
            <DialogDescription>
              Se ha detectado un archivo de configuración más reciente en la carpeta remota.
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
                  <span className="text-gray-500">Fecha exportación:</span>
                  <span className="ml-1 font-medium">{formatDate(checkResult.exportedAt)}</span>
                </div>
                {checkResult.localLastImport && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Última importación local:</span>
                    <span className="ml-1 font-medium">{formatDate(checkResult.localLastImport)}</span>
                  </div>
                )}
              </div>

              {!isAdmin && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Los precios y configuración se sobrescribirán con los valores aprobados por administración. No podrás modificarlos manualmente.</span>
                </div>
              )}
            </div>
          )}

          {importPreview?.errors && importPreview.errors.length > 0 && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs">
              <strong>Errores de validación:</strong>
              <ul className="mt-1 list-disc list-inside">
                {importPreview.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancelar
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

      {/* ── Audit Log ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            Registro de auditoría
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditLog.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No hay registros de importación/exportación.
            </p>
          ) : (
            <div className="max-h-80 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs">Acción</TableHead>
                    <TableHead className="text-xs">Usuario</TableHead>
                    <TableHead className="text-xs">Versión</TableHead>
                    <TableHead className="text-xs">Cambios</TableHead>
                    <TableHead className="text-xs">Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs py-2">
                        {formatDate(entry.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        <Badge variant="outline" className="text-xs">
                          {getActionLabel(entry.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {entry.userName || entry.userEmail || '-'}
                        {entry.role && (
                          <span className="text-gray-400 ml-1">({entry.role})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {entry.oldVersion && entry.newVersion ? (
                          <span>{entry.oldVersion} → {entry.newVersion}</span>
                        ) : (
                          <span>{entry.newVersion || '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs py-2 max-w-[200px] truncate">
                        {entry.action === 'import' || entry.action === 'export'
                          ? parseChanges(entry.changesApplied)
                          : '-'}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {entry.result === 'success' ? (
                          <Badge className="bg-green-100 text-green-800 text-xs">OK</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Error</Badge>
                        )}
                        {entry.errorMessage && (
                          <p className="text-red-500 text-xs mt-1 max-w-[200px] truncate" title={entry.errorMessage}>
                            {entry.errorMessage}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Info Card ─────────────────────────────────────── */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="py-3">
          <div className="flex items-start gap-2 text-xs text-blue-800">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p><strong>Cómo funciona:</strong></p>
              <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
                <li>El admin pulsa &quot;Exportar&quot; para generar <code className="bg-blue-100 px-1 rounded">remote-config/gasi-config.json</code>.</li>
                <li>La administración copia ese archivo a una carpeta compartida (Google Drive, OneDrive, Dropbox).</li>
                <li>El comercial sincroniza esa carpeta en su equipo.</li>
                <li>Al iniciar la app o pulsar &quot;Comprobar&quot;, se detecta la nueva configuración y se ofrece importarla.</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}