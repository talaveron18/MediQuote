/**
 * Lightweight budget export — runs server-side, no PDF, no fetch to own API.
 * Called directly from POST/PUT /api/budgets after save.
 *
 * Writes:
 *   - JSON file:   exports/presupuestos/json/{CODE}.json
 *   - CSV summary: exports/presupuestos_resumen.csv  (upsert by code)
 *   - AuditLog entry
 */

import { db } from '@/lib/db';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { dataRoot } from '@/lib/data-paths';
import { APP_VERSION, COST_ENGINE_VERSION } from '@/lib/costing/cost-types';

const BASE = dataRoot();

interface ExportUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function exportBudgetLightweight(
  budgetId: string,
  user: ExportUser,
): Promise<void> {
  try {
    // 1. Load budget with minimal relations
    const budget = await db.budget.findUnique({
      where: { id: budgetId },
      include: {
        client: { select: { businessName: true, cif: true } },
        createdBy: { select: { name: true, email: true } },
        serviceBlocks: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!budget) {
      console.error(`[exportLightweight] Budget ${budgetId} not found`);
      return;
    }

    const code = budget.code;

    // 2. Write JSON
    const jsonDir = path.join(BASE, 'exports', 'presupuestos', 'json');
    mkdirSync(jsonDir, { recursive: true });
    const jsonPath = path.join(jsonDir, `${code}.json`);

    const jsonData = {
      appVersion: APP_VERSION,
      calculationEngineVersion: COST_ENGINE_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: user.email,
      budget: JSON.parse(JSON.stringify(budget, (_key, value) =>
        value instanceof Date ? value.toISOString() : value
      )),
    };
    writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf-8');

    // 3. Upsert CSV summary row
    upsertCsvSummaryRow(budget);

    // 4. AuditLog entry
    try {
      await db.auditLog.create({
        data: {
          action: 'budget_auto_export',
          entity: 'budget',
          entityId: budget.id,
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          summary: `Auto-export presupuesto ${code} (JSON + CSV)`,
          result: 'success',
          appVersion: APP_VERSION,
          engineVersion: COST_ENGINE_VERSION,
        },
      });
    } catch (auditErr) {
      // Fallback to ConfigAuditLog
      try {
        await db.configAuditLog.create({
          data: {
            action: 'budget_auto_export',
            userEmail: user.id,
            userName: user.name,
            role: user.role,
            result: 'success',
          },
        });
      } catch {
        // Audit should never break main flow
      }
    }

    console.log(`[exportLightweight] ${code}: JSON + CSV exported`);
  } catch (err) {
    console.error(`[exportLightweight] Error for budget ${budgetId}:`, err);
    // Try to log the failure
    try {
      await db.auditLog.create({
        data: {
          action: 'budget_auto_export',
          entity: 'budget',
          entityId: budgetId,
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          summary: `Error auto-export presupuesto ${budgetId}`,
          result: 'error',
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
    } catch {
      // silent
    }
  }
}

// ─── CSV helpers (duplicated from exports/route.ts to avoid circular deps) ────

function csvEscape(value: string): string {
  if (!value) return '""';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function upsertCsvSummaryRow(budget: any): void {
  const csvPath = path.join(BASE, 'exports', 'presupuestos_resumen.csv');
  const csvDir = path.join(BASE, 'exports');
  mkdirSync(csvDir, { recursive: true });

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  // Collect warnings from blocks
  const allWarnings: string[] = [];
  for (const block of budget.serviceBlocks) {
    if (block.laborWarnings) {
      try {
        const warnings = JSON.parse(block.laborWarnings);
        for (const w of warnings) {
          allWarnings.push(w.message || w.type);
        }
      } catch {
        // ignore
      }
    }
  }
  const warningsStr = allWarnings.length > 0
    ? `"${allWarnings.map(w => w.replace(/"/g, '""')).join('; ')}"`
    : '';

  const row = [
    csvEscape(budget.code),
    csvEscape(budget.client?.businessName || ''),
    csvEscape(budget.createdAt?.toISOString() || ''),
    csvEscape(budget.updatedAt?.toISOString() || ''),
    csvEscape(budget.status),
    budget.totalFinal?.toFixed(2) || '0.00',
    csvEscape(budget.createdBy?.name || ''),
    String(budget.serviceBlocks?.length || 0),
    warningsStr,
    csvEscape(`exports/presupuestos/json/${budget.code}.json`),
  ].join(',');

  const header = 'código,cliente,fecha_creación,última_modificación,estado,total,comercial,num_bloques,advertencias,ruta_JSON';

  if (!existsSync(csvPath)) {
    writeFileSync(csvPath, header + '\n' + row + '\n', 'utf-8');
    return;
  }

  // Read existing, upsert by code
  const existing = readFileSync(csvPath, 'utf-8');
  const lines = existing.split('\n').filter(l => l.trim().length > 0);

  if (lines.length === 0) {
    writeFileSync(csvPath, header + '\n' + row + '\n', 'utf-8');
    return;
  }

  const headerLine = lines[0];
  const dataLines = lines.slice(1);
  let found = false;
  const updatedLines = dataLines.map(line => {
    if (line.startsWith(`"${budget.code}",`) || line.startsWith(`${budget.code},`)) {
      found = true;
      return row;
    }
    return line;
  });

  const output = headerLine + '\n' + (found ? updatedLines : [...updatedLines, row]).join('\n') + '\n';
  writeFileSync(csvPath, output, 'utf-8');
}
