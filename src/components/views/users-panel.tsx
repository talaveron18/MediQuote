'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Edit, KeyRound, UserCheck, UserX, Shield } from 'lucide-react';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  createdById?: string | null;
  createdByUser?: { name: string } | null;
}

interface UserFormData {
  name: string;
  email: string;
  password?: string;
  role: string;
}

const ROLES = ['maestro', 'admin', 'comercial'] as const;

const ROLE_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  maestro:   { label: 'Maestro',   variant: 'default',  className: 'bg-amber-500/15 text-amber-700 border-amber-500/25 hover:bg-amber-500/25' },
  admin:     { label: 'Admin',     variant: 'default',  className: 'bg-blue-500/15 text-blue-700 border-blue-500/25 hover:bg-blue-500/25' },
  comercial: { label: 'Comercial', variant: 'default',  className: 'bg-green-500/15 text-green-700 border-green-500/25 hover:bg-green-500/25' },
};

const EMPTY_FORM: UserFormData = { name: '', email: '', password: '', role: 'comercial' };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function UsersPanel() {
  const currentRole = useAppStore((s) => s.currentRole);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  /* Dialog state */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Fetch users                                                      */
  /* ---------------------------------------------------------------- */

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setAccessDenied(false);
    try {
      const res = await fetch('/api/users');
      if (res.status === 403) {
        setAccessDenied(true);
        return;
      }
      if (!res.ok) throw new Error('Error al cargar usuarios');
      const data = await res.json();
      const usersList = Array.isArray(data) ? data : (data.users || []);
      setUsers(usersList);
    } catch {
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* ---------------------------------------------------------------- */

  function formatDate(date?: string | null) {
    if (!date) return '—';
    try {
      return new Date(date).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return date;
    }
  }

  function roleBadge(role: string) {
    const cfg = ROLE_BADGE[role] ?? { label: role, variant: 'secondary' as const, className: '' };
    return (
      <Badge variant={cfg.variant} className={cfg.className}>
        {cfg.label}
      </Badge>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Dialog – open / close                                            */
  /* ---------------------------------------------------------------- */

  function openCreate() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setForm({ name: user.name, email: user.email, password: '', role: user.role });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
  }

  /* ---------------------------------------------------------------- */
  /*  Save (create / update)                                           */
  /* ---------------------------------------------------------------- */

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Nombre y email son obligatorios');
      return;
    }

    setSaving(true);
    try {
      const isEdit = !!editingUser;
      const url = isEdit ? '/api/users' : '/api/users';
      const method = isEdit ? 'PUT' : 'POST';

      const body: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
      };
      if (editingUser) body.id = editingUser.id;
      if (form.password) body.password = form.password;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 403) {
        toast.error('Acceso denegado');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(err.error || 'Error al guardar usuario');
      }

      toast.success(isEdit ? 'Usuario actualizado' : 'Usuario creado');
      closeDialog();
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar usuario');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Reset password                                                   */
  /* ---------------------------------------------------------------- */

  async function handleResetPassword(user: User) {
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, action: 'resetPassword' }),
      });

      if (res.status === 403) {
        toast.error('Acceso denegado');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(err.error || 'Error al resetear contraseña');
      }

      toast.success('Contraseña reseteada correctamente');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al resetear contraseña');
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Toggle active                                                    */
  /* ---------------------------------------------------------------- */

  async function handleToggleActive(user: User) {
    // Prevent deactivating maestro from the maestro's own view
    if (user.role === 'maestro' && currentRole === 'maestro') {
      toast.error('No puedes desactivar tu propia cuenta de maestro');
      return;
    }

    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, action: 'toggleActive' }),
      });

      if (res.status === 403) {
        toast.error('Acceso denegado');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(err.error || 'Error al cambiar estado');
      }

      toast.success(user.active ? 'Usuario desactivado' : 'Usuario activado');
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cambiar estado');
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (accessDenied) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Gestión de usuarios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Shield className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">Acceso denegado</p>
            <p className="text-sm mt-1">No tienes permisos para gestionar usuarios.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Gestión de usuarios
        </CardTitle>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo usuario
        </Button>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <p>Cargando usuarios…</p>
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <p>No hay usuarios registrados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último acceso</TableHead>
                  <TableHead>Creado por</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{roleBadge(user.role)}</TableCell>
                    <TableCell>
                      <Badge variant={user.active ? 'default' : 'secondary'} className={user.active ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/25' : 'bg-gray-500/15 text-gray-600 border-gray-500/25'}>
                        {user.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(user.lastLoginAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {user.createdByUser?.name || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(user)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Resetear contraseña" onClick={() => handleResetPassword(user)}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {/* Hide deactivate button for maestro when current user is maestro */}
                        {!(user.role === 'maestro' && currentRole === 'maestro') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title={user.active ? 'Desactivar' : 'Activar'}
                            onClick={() => handleToggleActive(user)}
                          >
                            {user.active ? (
                              <UserX className="h-4 w-4 text-red-500" />
                            ) : (
                              <UserCheck className="h-4 w-4 text-green-500" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* ---- Create / Edit Dialog ---- */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="user-name">Nombre</Label>
              <Input
                id="user-name"
                placeholder="Nombre completo"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="user-password">
                Contraseña {editingUser && '(dejar vacío para no cambiar)'}
              </Label>
              <Input
                id="user-password"
                type="password"
                placeholder={editingUser ? '••••••••' : 'Contraseña'}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="user-role">Rol</Label>
              <Select
                value={form.role}
                onValueChange={(value) => setForm((f) => ({ ...f, role: value }))}
              >
                <SelectTrigger id="user-role">
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_BADGE[role]?.label ?? role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : editingUser ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}