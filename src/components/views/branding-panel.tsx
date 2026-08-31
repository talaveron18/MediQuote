'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import Image from 'next/image';
import { Shield, Save } from 'lucide-react';
import { APP_VERSION, COST_ENGINE_VERSION } from '@/lib/costing/cost-types';

// Branding config fields stored as AppConfig keys
const BRANDING_KEYS = [
  { key: 'instanceName', label: 'Nombre de instancia', default: 'GASI' },
  { key: 'productName', label: 'Software base', default: 'MediQuote Pro' },
  { key: 'visibleToolName', label: 'Nombre visible en la app', default: 'Presupuestos Sanitarios' },
  { key: 'licenseHolder', label: 'Titular del software', default: 'Fernando Javier Suárez Talaverón' },
  { key: 'licenseText', label: 'Texto de licencia', default: 'Bajo licencia habilitada de MediQuote Pro' },
  { key: 'internalUseText', label: 'Texto de uso interno', default: 'Uso interno autorizado para GASI' },
  { key: 'copyrightText', label: 'Texto de copyright / footer', default: '© 2026 Fernando Javier Suárez Talaverón. MediQuote Pro. Todos los derechos reservados.' },
  { key: 'pdfFooterText', label: 'Footer PDF cliente', default: 'Documento generado mediante MediQuote Pro bajo licencia interna habilitada para GASI.' },
  { key: 'company_name', label: 'Razón social (PDF)', default: 'GASI' },
  { key: 'company_cif', label: 'CIF (PDF)', default: '' },
  { key: 'company_address', label: 'Dirección fiscal (PDF)', default: '' },
  { key: 'company_phone', label: 'Teléfono (PDF)', default: '' },
  { key: 'company_email', label: 'Email (PDF)', default: '' },
];

export default function BrandingPanel() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch('/api/config?type=appConfig');
      if (res.status === 403) {
        setError('Solo el titular puede acceder a la configuración de branding.');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setValues(data);
      }
    } catch {
      toast.error('Error al cargar configuración de branding');
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    try {
      for (const { key } of BRANDING_KEYS) {
        const value = values[key] ?? '';
        await fetch('/api/config?type=appConfig', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
      }
      toast.success('Configuración de branding guardada');
    } catch {
      toast.error('Error al guardar branding');
    } finally {
      setSaving(false);
    }
  }

  function updateValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const appVersion = APP_VERSION;
  const engineVersion = COST_ENGINE_VERSION;

  return (
    <div className="space-y-6">
      {/* Info card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            Información de licencia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500">Instancia:</span>{' '}
              <span className="font-medium">{values.instanceName || 'GASI'}</span>
            </div>
            <div>
              <span className="text-gray-500">Software base:</span>{' '}
              <span className="font-medium">{values.productName || 'MediQuote Pro'}</span>
            </div>
            <div>
              <span className="text-gray-500">Titular:</span>{' '}
              <span className="font-medium">{values.licenseHolder || 'Fernando Javier Suárez Talaverón'}</span>
            </div>
            <div>
              <span className="text-gray-500">Tipo de uso:</span>{' '}
              <span className="font-medium">Licencia interna autorizada</span>
            </div>
            <div>
              <span className="text-gray-500">Estado:</span>{' '}
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                Activa
              </Badge>
            </div>
            <div>
              <span className="text-gray-500">APP_VERSION:</span>{' '}
              <span className="font-mono text-xs">{appVersion}</span>
            </div>
            <div>
              <span className="text-gray-500">ENGINE_VERSION:</span>{' '}
              <span className="font-mono text-xs">{engineVersion}</span>
            </div>
          </div>

          {/* Logos preview */}
          <Separator className="my-3" />
          <div className="flex gap-8 items-end">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Logo GASI</p>
              <Image
                src="/branding/gasi-logo.png"
                alt="GASI"
                width={100}
                height={50}
                className="object-contain"
              />
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Logo MediQuote Pro</p>
              <Image
                src="/branding/mediquote-pro-logo.png"
                alt="MediQuote Pro"
                width={100}
                height={30}
                className="object-contain opacity-50"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable fields */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Configuración de branding</CardTitle>
            <Button
              size="sm"
              onClick={saveConfig}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Save className="w-3 h-3 mr-1" />
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {BRANDING_KEYS.map(({ key, label, default: def }) => (
            <div key={key} className="grid gap-1">
              <Label className="text-xs text-gray-600">{label}</Label>
              {key === 'pdfFooterText' || key === 'copyrightText' ? (
                <Textarea
                  value={values[key] ?? def}
                  onChange={(e) => updateValue(key, e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              ) : (
                <Input
                  value={values[key] ?? def}
                  onChange={(e) => updateValue(key, e.target.value)}
                  className="text-sm"
                  placeholder={def}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* How to change logos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Cómo cambiar logos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600 space-y-2">
          <p>
            <strong>Logo GASI:</strong> reemplazar el archivo{' '}
            <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">public/branding/gasi-logo.png</code>
          </p>
          <p>
            <strong>Logo MediQuote Pro:</strong> reemplazar el archivo{' '}
            <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">public/branding/mediquote-pro-logo.png</code>
          </p>
          <p>
            Formato: PNG con fondo transparente. Se recomienda 200px+ de ancho para buena resolución.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}