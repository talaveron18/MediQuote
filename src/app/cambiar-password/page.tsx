'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'

export default function CambiarPasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (newPassword.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas nuevas no coinciden')
      return
    }

    if (newPassword === currentPassword) {
      toast.error('La nueva contraseña debe ser diferente a la actual')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth?action=change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        toast.success('Contraseña actualizada correctamente')
        window.location.href = '/'
      } else {
        toast.error(data.error || 'Error al cambiar la contraseña')
      }
    } catch {
      toast.error('Error al cambiar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <KeyRound className="w-10 h-10 text-emerald-600" />
          </div>
          <CardTitle className="text-lg">Cambiar Contraseña</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Actualiza tu contraseña de acceso
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Contraseña actual</Label>
              <Input
                id="currentPassword"
                type="password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva contraseña</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Repetir nueva contraseña</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repite la nueva contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={loading}
            >
              {loading ? (
                <span className="animate-pulse">Guardando…</span>
              ) : (
                'Cambiar contraseña'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}