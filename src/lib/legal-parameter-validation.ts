const STRICTLY_POSITIVE_KEYS = /^(JORNADA_.+_ANUAL|HORAS_FACTURABLES_.+|SMI_ANNUAL_.+)$/;

export function validateLegalParameterValue(key: unknown, value: unknown): string | null {
  const normalizedKey = String(key ?? '').trim().toUpperCase();
  if (!STRICTLY_POSITIVE_KEYS.test(normalizedKey)) return null;
  if (value === '' || value === null || value === undefined) return 'Este parámetro económico no puede quedar vacío.';
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 'La jornada, las horas productivas y el SMI deben ser números mayores que cero.';
  }
  return null;
}
