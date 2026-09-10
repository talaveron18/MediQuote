'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      const response = await fetch('/api/recovery/password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      setMessage(data.message || 'Si existe una cuenta activa con ese correo, recibirás instrucciones para restablecer la contraseña.')
    } catch {
      // Keep the same enumeration-safe public message on network/internal failures.
      setMessage('Si existe una cuenta activa con ese correo, recibirás instrucciones para restablecer la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>Recuperar contraseña</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? (
            <div className="space-y-4" role="status">
              <p className="text-sm text-gray-700">{message}</p>
              <Link href="/login" className="text-sm text-emerald-700 hover:underline">Volver al inicio de sesión</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? 'Enviando…' : 'Enviar instrucciones'}
              </Button>
              <Link href="/login" className="block text-center text-sm text-gray-600 hover:underline">Cancelar</Link>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
