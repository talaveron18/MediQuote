'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  isStrongEnoughPassword,
  MAXIMUM_PASSWORD_BYTES,
  MINIMUM_PASSWORD_LENGTH,
  passwordUtf8Bytes,
} from '@/lib/password-policy'

export default function RestablecerPasswordPage() {
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token') || ''
    setToken(value)
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!token) {
      setError('El enlace no es válido o ha caducado.')
      return
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (!isStrongEnoughPassword(password)) {
      const bytes = passwordUtf8Bytes(password)
      setError(bytes > MAXIMUM_PASSWORD_BYTES
        ? `La contraseña no puede superar ${MAXIMUM_PASSWORD_BYTES} bytes en UTF-8.`
        : `La contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`)
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/recovery/password/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || 'El enlace no es válido o ha caducado.')
        return
      }
      setPassword('')
      setConfirmation('')
      setSuccess(true)
    } catch {
      setError('No se pudo completar la recuperación. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Establecer nueva contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4" role="status">
              <p className="text-sm text-gray-700">Contraseña actualizada. Las sesiones anteriores han sido revocadas.</p>
              <Link href="/login" className="text-sm text-emerald-700 hover:underline">Iniciar sesión</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={MINIMUM_PASSWORD_LENGTH}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmation">Confirmar contraseña</Label>
                <Input
                  id="confirmation"
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  minLength={MINIMUM_PASSWORD_LENGTH}
                  required
                />
              </div>
              <p className="text-xs text-gray-500">Mínimo {MINIMUM_PASSWORD_LENGTH} caracteres y máximo {MAXIMUM_PASSWORD_BYTES} bytes UTF-8.</p>
              <Button className="w-full" type="submit" disabled={loading || !token}>
                {loading ? 'Actualizando…' : 'Actualizar contraseña'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
