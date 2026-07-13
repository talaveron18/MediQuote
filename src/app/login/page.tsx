'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LogIn } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        window.location.href = '/';
      } else {
        toast.error('Credenciales incorrectas');
      }
    } catch {
      toast.error('Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          {/* GASI Logo — main visual */}
          <div className="flex justify-center mb-3">
            <Image
              src="/branding/gasi-logo.png"
              alt="GASI"
              width={140}
              height={70}
              className="object-contain"
              priority
            />
          </div>
          <CardTitle className="text-base text-gray-700">
            Herramienta interna de presupuestación sanitaria
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* License text */}
          <p className="text-center text-xs text-gray-500 mb-1">
            Bajo licencia habilitada de MediQuote Pro
          </p>
          <p className="text-center text-xs text-gray-400 mb-5">
            Uso interno autorizado para GASI
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={loading}
            >
              {loading ? (
                <span className="animate-pulse">Accediendo…</span>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Iniciar sesión
                </>
              )}
            </Button>
          </form>

          {/* MediQuote Pro logo — discreet */}
          <div className="flex justify-center mt-5">
            <Image
              src="/branding/mediquote-pro-logo.png"
              alt="MediQuote Pro"
              width={80}
              height={24}
              className="object-contain opacity-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="mt-6 text-xs text-gray-400 text-center">
        © 2026 Fernando Javier Suárez Talaverón. MediQuote Pro. Todos los derechos reservados.
      </p>
    </div>
  );
}