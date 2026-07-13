'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Database, Download, HardDrive, Shield, RefreshCw, CheckCircle, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface AuditEntry {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  summary: string | null;
  result: string | null;
  errorMessage: string | null;
  appVersion: string | null;
  engineVersion: string | null;
  createdAt: string;
}

export default function AdminAuditPanel() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [backuping, setBacking] = useState(false);
  const [packaging, setPackaging] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/audit-logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error('Error loading audit logs:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleBackup = async () => {
    setBacking(true);
    try {
      const res = await fetch('/api/backup?type=now', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Backup creado', { description: data.path });
        loadLogs();
      } else {
        toast.error('Error al crear backup', { description: data.error });
      }
    } catch (e: any) {
      toast.error('Error de conexión', { description: e.message });
    } finally {
      setBacking(false);
    }
  };

  const handleAuditPackage = async () => {
    setPackaging(true);
    try {
      const res = await fetch('/api/audit-package?type=generate', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Paquete de auditoría generado', { description: data.path });
        loadLogs();
      } else {
        toast.error('Error al generar paquete', { description: data.error });
      }
    } catch (e: any) {
      toast.error('Error de conexión', { description: e.message });
    } finally {
      setPackaging(false);
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

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-blue-600" />
              Backup de base de datos
            </CardTitle>
            <CardDescription className="text-xs">
              Copia la base de datos SQLite a /backups/ con fecha y hora.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleBackup} disabled={backuping} className="w-full">
              {backuping ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
              {backuping ? 'Creando backup...' : 'Crear backup ahora'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4 text-purple-600" />
              Paquete de auditoría
            </CardTitle>
            <CardDescription className="text-xs">
              Genera carpeta con DB, PDFs, JSONs, CSVs, logs y configuración.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleAuditPackage} disabled={packaging} className="w-full" variant="outline">
              {packaging ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
              {packaging ? 'Generando...' : 'Exportar paquete de auditoría'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Audit Log Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Registro de auditoría general</CardTitle>
              <CardDescription className="text-xs mt-1">
                Todas las acciones de usuarios quedan registradas. El comercial no puede borrar logs.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No hay registros de auditoría.</p>
          ) : (
            <div className="max-h-96 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs">Usuario</TableHead>
                    <TableHead className="text-xs">Acción</TableHead>
                    <TableHead className="text-xs">Entidad</TableHead>
                    <TableHead className="text-xs">Resumen</TableHead>
                    <TableHead className="text-xs">Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs py-2 whitespace-nowrap">
                        {formatDate(entry.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        <div>{entry.userName || entry.userId || '-'}</div>
                        <div className="text-gray-400">{entry.userRole || ''}</div>
                      </TableCell>
                      <TableCell className="text-xs py-2 font-mono">
                        {entry.action}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {entry.entity ? `${entry.entity}${entry.entityId ? `: ${entry.entityId.slice(0, 8)}` : ''}` : '-'}
                      </TableCell>
                      <TableCell className="text-xs py-2 max-w-[200px] truncate" title={entry.summary || ''}>
                        {entry.summary || '-'}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {entry.result === 'success' ? (
                          <Badge className="bg-green-100 text-green-800 text-xs">OK</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Error</Badge>
                        )}
                        {entry.errorMessage && (
                          <p className="text-red-500 text-xs mt-0.5 max-w-[200px] truncate" title={entry.errorMessage}>
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
    </div>
  );
}