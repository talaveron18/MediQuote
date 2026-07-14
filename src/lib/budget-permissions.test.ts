import { describe, expect, it } from 'vitest';
import { budgetListWhereForUser, canAccessBudget, canManageAllBudgets, canModifyBudget, canWriteBudgets } from './budget-permissions';

const budget = { createdById: 'owner' };

describe('budget permissions', () => {
  it('lets maestro and admin work with all budgets', () => {
    for (const role of ['maestro', 'admin']) {
      const user = { id: 'someone', role };
      expect(canManageAllBudgets(user)).toBe(true);
      expect(canAccessBudget(user, budget)).toBe(true);
      expect(canModifyBudget(user, budget)).toBe(true);
      expect(budgetListWhereForUser(user)).toEqual({});
    }
  });

  it('limits comercial users by ownership', () => {
    const user = { id: 'owner', role: 'comercial' };
    expect(canWriteBudgets(user)).toBe(true);
    expect(canAccessBudget(user, budget)).toBe(true);
    expect(canAccessBudget(user, { createdById: 'someone' })).toBe(false);
    expect(canModifyBudget(user, budget)).toBe(true);
    expect(canModifyBudget(user, { createdById: 'someone' })).toBe(false);
    expect(budgetListWhereForUser(user)).toEqual({ createdById: 'owner' });
  });

  it('keeps gestor and readonly as non-writers', () => {
    for (const role of ['gestor', 'readonly']) {
      const user = { id: 'owner', role };
      expect(canWriteBudgets(user)).toBe(false);
      expect(canAccessBudget(user, budget)).toBe(true);
      expect(canModifyBudget(user, budget)).toBe(false);
    }
  });
});
