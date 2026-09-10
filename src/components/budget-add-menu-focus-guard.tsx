'use client';

import { useEffect } from 'react';

/**
 * The add-block trigger currently owns a delayed onBlur close handler. When a
 * popup option receives focus, that delayed close can outlive the selection and
 * close a freshly reopened menu. Intercept only focus transitions from the
 * add-block trigger into its own popup; handleAddBlock still closes the popup
 * after a selection and normal focus-out still closes it.
 */
export function BudgetAddMenuFocusGuard() {
  useEffect(() => {
    const guardFocusTransition = (event: FocusEvent) => {
      const target = event.target;
      const related = event.relatedTarget;
      if (!(target instanceof HTMLButtonElement) || !(related instanceof Node)) return;
      if (!target.textContent?.includes('Añadir bloque')) return;

      const container = target.parentElement;
      if (!container || !container.contains(related)) return;

      event.stopPropagation();
    };

    document.addEventListener('focusout', guardFocusTransition, true);
    return () => document.removeEventListener('focusout', guardFocusTransition, true);
  }, []);

  return null;
}
