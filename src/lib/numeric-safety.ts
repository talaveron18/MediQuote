/** Devuelve las rutas que contienen números no finitos (NaN o ±Infinity). */
export function findNonFiniteNumbers(value: unknown, path = 'result'): string[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => findNonFiniteNumbers(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([key, item]) => findNonFiniteNumbers(item, `${path}.${key}`));
  }
  return [];
}

export function assertFiniteNumbers(value: unknown, path = 'result'): void {
  const invalid = findNonFiniteNumbers(value, path);
  if (invalid.length) throw new RangeError(`Resultado económico no finito: ${invalid.join(', ')}`);
}
