'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Database, Download, HardDrive, RefreshCw, Shield, Upload } from 'lucide-react';
import { toast } from 'sonner';

interface AuditEntry { id: string; action: string; entity: string | null; entityId: string | null; userId: string | null; userName: string | null; userRole: string | null; summary: string | null; result: string | null; errorMessage: string | null; createdAt: string }
interface BackupInfo { filename: string; size: number; createdAt: string; kind: 'automatic' | 'manual' | 'pre-import' }

const formatDate = (value: string) => new Date(value).toLocaleString('es-ES');
const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function AdminAuditPanel() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [central, setCentral] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [logsResponse, backupsResponse] = await Promise.all([fetch('/api/audit-logs'), fetch('/api/backup?type=list')]);
      if (logsResponse.ok) setLogs(await logsResponse.json());
      if (backupsResponse.ok) { const value = await backupsResponse.json(); setBackups(value.backups || []); setCentral(Boolean(value.central)); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const createBackup = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/backup?type=now', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo crear la copia');
      if (body.central) window.location.assign('/api/backup?type=export');
      toast.success(body.central ? 'Exportación central preparada' : 'Copia SQLite verificada', { description: body.filename });
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Error de backup'); }
    finally { setBusy(false); }
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    if (!confirm(`Se restaurará “${file.name}”. Antes se creará otra copia de seguridad. ¿Continuar?`)) return;
    setBusy(true);
    try {
      const form = new FormData(); form.append('database', file);
      const response = await fetch('/api/backup?type=import', { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo importar');
      toast.success('Base de datos restaurada', { description: body.central ? `${body.restored} registros restaurados` : `Copia previa: ${body.safetyBackup.filename}` });
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Error de importación'); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  };

  const generateAuditPackage = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/audit-package?type=generate', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo generar');
      toast.success('Paquete de auditoría generado', { description: body.path });
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Error de auditoría'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle className="text-sm flex gap-2"><HardDrive className="h-4 w-4 text-blue-600" />{central ? 'Copia central' : 'Copias SQLite'}</CardTitle><CardDescription>{central ? 'Exporta todos los datos compartidos en un archivo verificable.' : 'La primera escritura de cada día crea una copia automática. Se conservan 30.'}</CardDescription></CardHeader><CardContent><Button className="w-full" onClick={createBackup} disabled={busy}><Database className="h-4 w-4 mr-2" />{central ? 'Exportar ahora' : 'Crear ahora'}</Button></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm flex gap-2"><Upload className="h-4 w-4 text-amber-600" />Importar / restaurar</CardTitle><CardDescription>Restaura una exportación compatible de GASI.</CardDescription></CardHeader><CardContent><input ref={fileInput} className="hidden" type="file" accept={central ? '.json,application/json' : '.sqlite,.db,application/vnd.sqlite3'} onChange={(event) => importBackup(event.target.files?.[0])} /><Button className="w-full" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}><Upload className="h-4 w-4 mr-2" />{central ? 'Seleccionar copia JSON' : 'Seleccionar SQLite'}</Button></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm flex gap-2"><Shield className="h-4 w-4 text-purple-600" />Paquete de auditoría</CardTitle><CardDescription>Exporta base, documentos, datos y registros para custodia.</CardDescription></CardHeader><CardContent><Button className="w-full" variant="outline" onClick={generateAuditPackage} disabled={busy}><Download className="h-4 w-4 mr-2" />Generar paquete</Button></CardContent></Card>
    </div>

    <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-sm">Copias disponibles</CardTitle><CardDescription>Descarga directa para guardar fuera del servidor.</CardDescription></div><Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button></CardHeader><CardContent><div className="max-h-72 overflow-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Tamaño</TableHead><TableHead className="text-right">Exportar</TableHead></TableRow></TableHeader><TableBody>{backups.map((backup) => <TableRow key={backup.filename}><TableCell>{formatDate(backup.createdAt)}</TableCell><TableCell><Badge variant="secondary">{backup.kind === 'automatic' ? 'Automática' : backup.kind === 'manual' ? 'Manual' : 'Pre-importación'}</Badge></TableCell><TableCell>{formatSize(backup.size)}</TableCell><TableCell className="text-right"><Button asChild variant="ghost" size="sm"><a href={`/api/backup?type=download&filename=${encodeURIComponent(backup.filename)}`}><Download className="h-4 w-4" /></a></Button></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>

    <Card><CardHeader><CardTitle className="text-sm">Registro de auditoría general</CardTitle><CardDescription>Acciones de usuarios y operaciones de sistema.</CardDescription></CardHeader><CardContent><div className="max-h-96 overflow-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Usuario</TableHead><TableHead>Acción</TableHead><TableHead>Resumen</TableHead><TableHead>Resultado</TableHead></TableRow></TableHeader><TableBody>{logs.map((entry) => <TableRow key={entry.id}><TableCell className="whitespace-nowrap text-xs">{formatDate(entry.createdAt)}</TableCell><TableCell className="text-xs">{entry.userName || entry.userId || 'Sistema'}<div className="text-muted-foreground">{entry.userRole}</div></TableCell><TableCell className="font-mono text-xs">{entry.action}</TableCell><TableCell className="text-xs max-w-xs truncate" title={entry.summary || ''}>{entry.summary || '—'}</TableCell><TableCell>{entry.result === 'success' ? <Badge>OK</Badge> : <Badge variant="destructive">Error</Badge>}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
  </div>;
}
