'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedEmail = window.localStorage.getItem('gasi_remembered_email');
    if (savedEmail) setEmail(savedEmail);
  }, []);

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
        if (rememberEmail) window.localStorage.setItem('gasi_remembered_email', email.trim());
        else window.localStorage.removeItem('gasi_remembered_email');
        window.location.href = data.user?.mustChangePassword ? '/cambiar-password' : '/';
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-0 top-0 h-full px-3 text-gray-500 hover:text-gray-700"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(event) => setRememberEmail(event.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
              Recordar usuario en este equipo
            </label>
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
