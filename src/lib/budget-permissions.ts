export type BudgetAccessUser = {
  id: string;
  role: string;
};

export type BudgetOwner = {
  createdById: string;
};

export function canManageAllBudgets(user: BudgetAccessUser): boolean {
  return user.role === 'maestro' || user.role === 'admin';
}

export function canWriteBudgets(user: BudgetAccessUser): boolean {
  return user.role === 'maestro' || user.role === 'admin' || user.role === 'comercial';
}

export function canAccessBudget(user: BudgetAccessUser, budget: BudgetOwner): boolean {
  if (canManageAllBudgets(user)) return true;
  return budget.createdById === user.id;
}

export function canModifyBudget(user: BudgetAccessUser, budget: BudgetOwner): boolean {
  if (!canWriteBudgets(user)) return false;
  return canAccessBudget(user, budget);
}

export function budgetListWhereForUser(user: BudgetAccessUser): Record<string, unknown> {
  if (canManageAllBudgets(user)) return {};
  return { createdById: user.id };
}
