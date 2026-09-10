'use client';

import { Copy, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';

export default function BudgetBlockControls() {
  const currentView = useAppStore((state) => state.currentView);
  const serviceBlocks = useAppStore((state) => state.serviceBlocks);
  const budgetTotals = useAppStore((state) => state.budgetTotals);
  const cloneServiceBlock = useAppStore((state) => state.cloneServiceBlock);
  const moveServiceBlock = useAppStore((state) => state.moveServiceBlock);

  if (currentView !== 'budget-new' && currentView !== 'budget-edit') return null;
  if (serviceBlocks.length === 0) return null;

  return (
    <section
      aria-label="Organización de bloques del presupuesto"
      data-testid="budget-block-controls"
      data-calculation-state={budgetTotals ? 'calculated' : 'stale'}
      className="mx-6 mt-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Organizar bloques</h2>
          <p className="text-xs text-gray-500">Clona o cambia el orden antes de recalcular y guardar.</p>
        </div>
        {!budgetTotals && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
            <AlertTriangle className="h-3 w-3" /> Recalcular necesario
          </span>
        )}
      </div>

      <div className="space-y-2">
        {serviceBlocks.map((block, index) => (
          <div key={`${block.id ?? 'draft'}-${index}`} className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 px-2 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
              Bloque {index + 1}{block.serviceName ? ` · ${block.serviceName}` : ''}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              aria-label={`Clonar bloque ${index + 1}`}
              onClick={() => cloneServiceBlock(index)}
            >
              <Copy className="mr-1 h-3.5 w-3.5" /> Clonar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              aria-label={`Subir bloque ${index + 1}`}
              disabled={index === 0}
              onClick={() => moveServiceBlock(index, -1)}
            >
              <ArrowUp className="mr-1 h-3.5 w-3.5" /> Subir
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              aria-label={`Bajar bloque ${index + 1}`}
              disabled={index === serviceBlocks.length - 1}
              onClick={() => moveServiceBlock(index, 1)}
            >
              <ArrowDown className="mr-1 h-3.5 w-3.5" /> Bajar
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
