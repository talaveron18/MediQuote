'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

type CostLine = { key: string; label: string; amount: number };
type LaborBlock = {
  labor: {
    salaryForService: number; pluses: CostLine[]; totalPluses: number;
    employerContributions: CostLine[]; totalEmployerContributions: number;
    occupationalRisk: CostLine[]; totalOccupationalRisk: number; expandedLaborCost: number;
  };
  managementCost: number; terminationProvision: number; otherContractCosts: number;
  overhead: number; directCosts: CostLine[]; totalDirectCosts: number; totalInternalCost: number;
};

interface BreakdownResponse {
  budget: { code: string; status: string; client: string; subtotal: number; discountAmount: number; ivaAmount: number; totalFinal: number; location: { province: string; municipality?: string } };
  engineVersion?: string; calculatedAt?: string;
  internalCost: { totalInternalCost: number; laborBlocks: LaborBlock[]; directCostTotal: number; directCostOverhead: number };
  commercial: { initialListPriceExVat: number; closingPriceExVat: number; minimumOrdinaryPriceExVat: number; commissionTier: string; commissionRatePercent: number; commissionAmount: number; finalGasiBenefit: number; finalMarginOnSalePercent: number; semaphore: string };
}

const eur = (value: number | undefined) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));

function LineRows({ lines }: { lines: CostLine[] }) {
  return <>{lines.map((line) => <TableRow key={line.key}><TableCell>{line.label}</TableCell><TableCell className="text-right">{eur(line.amount)}</TableCell></TableRow>)}</>;
}

export default function CostBreakdownPanel() {
  const [budgets, setBudgets] = useState<Array<{ id: string; code: string; client?: { businessName?: string } }>>([]);
  const [budgetId, setBudgetId] = useState('');
  const [data, setData] = useState<BreakdownResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadBudgets = useCallback(async () => {
    const response = await fetch('/api/budgets');
    if (!response.ok) return;
    const body = await response.json();
    const rows = Array.isArray(body?.budgets) ? body.budgets : [];
    setBudgets(rows);
    setBudgetId((current) => current || rows[0]?.id || '');
  }, []);

  const loadBreakdown = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/costing?budgetId=${encodeURIComponent(id)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo cargar el desglose');
      setData(body);
    } catch (reason) {
      setData(null); setError(reason instanceof Error ? reason.message : 'No se pudo cargar el desglose');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadBudgets(); }, [loadBudgets]);
  useEffect(() => { void loadBreakdown(budgetId); }, [budgetId, loadBreakdown]);

  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>Desglose económico por presupuesto</CardTitle><CardDescription>Información interna exclusiva de administración y maestro.</CardDescription></CardHeader>
      <CardContent className="flex gap-2">
        <Select value={budgetId} onValueChange={setBudgetId}><SelectTrigger className="max-w-xl"><SelectValue placeholder="Selecciona presupuesto" /></SelectTrigger><SelectContent>{budgets.map((budget) => <SelectItem key={budget.id} value={budget.id}>{budget.code} · {budget.client?.businessName || 'Cliente'}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" onClick={() => loadBreakdown(budgetId)} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
      </CardContent>
    </Card>

    {error && <Card><CardContent className="py-6 text-sm text-amber-700">{error}</CardContent></Card>}
    {data && <>
      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Coste completo</CardDescription><CardTitle>{eur(data.internalCost.totalInternalCost)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Precio inicial</CardDescription><CardTitle>{eur(data.commercial.initialListPriceExVat)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Precio de cierre</CardDescription><CardTitle>{eur(data.commercial.closingPriceExVat)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Estado</CardDescription><CardTitle><Badge>{data.budget.status}</Badge></CardTitle></CardHeader></Card>
      </div>

      <Card><CardHeader><CardTitle>{data.budget.code} · {data.budget.client}</CardTitle><CardDescription>{[data.budget.location.municipality, data.budget.location.province].filter(Boolean).join(', ')} · motor {data.engineVersion || '—'}</CardDescription></CardHeader><CardContent className="space-y-6">
        {data.internalCost.laborBlocks.map((block, index) => <div key={index} className="space-y-2"><h3 className="font-semibold">Bloque laboral {index + 1}</h3><Table><TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead className="text-right">Importe</TableHead></TableRow></TableHeader><TableBody>
          <TableRow><TableCell>Coste salarial del servicio (incluye pagas extra)</TableCell><TableCell className="text-right">{eur(block.labor.salaryForService)}</TableCell></TableRow>
          <LineRows lines={block.labor.pluses} />
          <LineRows lines={block.labor.employerContributions} />
          <LineRows lines={block.labor.occupationalRisk} />
          <TableRow><TableCell>Gestoría / altas</TableCell><TableCell className="text-right">{eur(block.managementCost)}</TableCell></TableRow>
          <TableRow><TableCell>Provisión fin de contrato</TableCell><TableCell className="text-right">{eur(block.terminationProvision)}</TableCell></TableRow>
          <TableRow><TableCell>Otros costes contractuales</TableCell><TableCell className="text-right">{eur(block.otherContractCosts)}</TableCell></TableRow>
          <TableRow><TableCell>Overhead</TableCell><TableCell className="text-right">{eur(block.overhead)}</TableCell></TableRow>
          <LineRows lines={block.directCosts} />
          <TableRow className="font-semibold"><TableCell>Total bloque</TableCell><TableCell className="text-right">{eur(block.totalInternalCost)}</TableCell></TableRow>
        </TableBody></Table></div>)}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Resultado comercial interno</CardTitle></CardHeader><CardContent><Table><TableBody>
        <TableRow><TableCell>Costes directos adicionales</TableCell><TableCell className="text-right">{eur(data.internalCost.directCostTotal)}</TableCell></TableRow>
        <TableRow><TableCell>Overhead de costes directos</TableCell><TableCell className="text-right">{eur(data.internalCost.directCostOverhead)}</TableCell></TableRow>
        <TableRow><TableCell>Precio mínimo ordinario</TableCell><TableCell className="text-right">{eur(data.commercial.minimumOrdinaryPriceExVat)}</TableCell></TableRow>
        <TableRow><TableCell>Comisión ({data.commercial.commissionTier}, {data.commercial.commissionRatePercent}%)</TableCell><TableCell className="text-right">{eur(data.commercial.commissionAmount)}</TableCell></TableRow>
        <TableRow><TableCell>Beneficio final GASI</TableCell><TableCell className="text-right">{eur(data.commercial.finalGasiBenefit)}</TableCell></TableRow>
        <TableRow><TableCell>Margen final sobre venta</TableCell><TableCell className="text-right">{Number(data.commercial.finalMarginOnSalePercent || 0).toFixed(2)}%</TableCell></TableRow>
      </TableBody></Table></CardContent></Card>
    </>}
  </div>;
}
