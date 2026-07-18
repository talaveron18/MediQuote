import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('presentación accesible de Gasito', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/build-week/gasito-council.module.css'), 'utf8');
  const component = readFileSync(resolve(process.cwd(), 'src/components/build-week/gasito-council.tsx'), 'utf8');

  it('desactiva el movimiento no esencial cuando el sistema lo solicita', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none !important');
  });

  it('separa estado, movimiento y texto accesible', () => {
    expect(component).toContain('data-gasito-state={state}');
    expect(component).toContain('data-motion={motion}');
    expect(component).toContain('aria-label={actorAriaLabel(role, state, active)}');
  });

  it('marca visual y textualmente a un revisor no disponible', () => {
    expect(component).toContain("state === 'no_disponible'");
    expect(component).toContain('GASITO_STATE_LABELS[state]');
    expect(component).toContain('<WifiOff');
  });
});
