'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { INTERNAL_ECONOMIC_FIELDS } from '@/lib/costing/internal-economic-config';

export default function InternalEconomicsPage() {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const missingCount = useMemo(
    () => INTERNAL_ECONOMIC_FIELDS.filter((field) => !values[field.key]?.trim()).length,
    [values],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const me = await fetch('/api/auth?action=me', { cache: 'no-store' });
        if (!me.ok) {
          router.replace('/login');
          return;
        }
        const session = await me.json();
        if (!['admin', 'maestro'].includes(session.user?.role)) {
          router.replace('/');
          return;
        }

        const response = await fetch('/api/config?type=appConfig', { cache: 'no-store' });
        if (!response.ok) throw new Error('No se pudo cargar la configuración económica');
        const config = await response.json();
        if (!active) return;
        const next: Record<string, string> = {};
        for (const field of INTERNAL_ECONOMIC_FIELDS) next[field.key] = config[field.key] ?? '';
        setValues(next);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la configuración');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      for (const field of INTERNAL_ECONOMIC_FIELDS) {
        const raw = values[field.key]?.trim() ?? '';
        if (raw !== '') {
          const numeric = Number(raw);
          if (!Number.isFinite(numeric) || numeric < 0) {
            throw new Error(`${field.label}: introduce un número igual o mayor que 0.`);
          }
        }
      }

      const results = await Promise.all(INTERNAL_ECONOMIC_FIELDS.map((field) =>
        fetch('/api/config?type=appConfig', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: field.key, value: values[field.key]?.trim() ?? '' }),
        }),
      ));
      const failed = results.find((result) => !result.ok);
      if (failed) throw new Error('No se pudo guardar toda la configuración económica');
      setMessage('Configuración económica interna guardada. Los presupuestos nuevos usarán estos valores; los históricos conservan su fotografía sellada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la configuración');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-emerald-700" />
              <h1 className="text-2xl font-bold">Configuración económica interna</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Parámetros decididos por GASI. No proceden de la gestoría y no se concilian contra ella.</p>
          </div>
          <Button variant="outline" onClick={() => router.push('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </Button>
        </div>

        <Alert>
          <AlertDescription>
            MediQuote no inventa valores económicos. Un campo vacío mantiene el cálculo en pendiente de configuración. Cada presupuesto sellado conserva los valores exactos usados al generarse.
          </AlertDescription>
        </Alert>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {message && <Alert className="border-emerald-300 bg-emerald-50"><AlertDescription>{message}</AlertDescription></Alert>}

        <Card>
          <CardHeader>
            <CardTitle>Costes, margen, comisión y semáforos</CardTitle>
            <CardDescription>{missingCount > 0 ? `${missingCount} parámetro(s) sin configurar.` : 'Todos los parámetros internos están configurados.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : INTERNAL_ECONOMIC_FIELDS.map((field) => (
              <div key={field.key} className="grid gap-2 md:grid-cols-[1fr_220px] md:items-center">
                <div>
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                </div>
                <div className="relative">
                  <Input
                    id={field.key}
                    inputMode="decimal"
                    value={values[field.key] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                    placeholder="Sin configurar"
                    aria-label={field.label}
                  />
                  <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">{field.unit}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button onClick={save} disabled={loading || saving}>
                <Save className="mr-2 h-4 w-4" />{saving ? 'Guardando…' : 'Guardar parámetros'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
