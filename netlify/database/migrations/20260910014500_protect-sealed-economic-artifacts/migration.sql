-- Append-only protection for immutable economic snapshots.
-- Budget snapshots are stored in BudgetHistory with action='sealed_budget_artifact'.
-- Cost-audit snapshots are stored in AuditLog with action='sealed_cost_audit_artifact'.

CREATE OR REPLACE FUNCTION gasi_reject_sealed_budget_history_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD."action" = 'sealed_budget_artifact' THEN
    RAISE EXCEPTION 'sealed budget artifacts are immutable';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gasi_protect_sealed_budget_history ON "BudgetHistory";
CREATE TRIGGER gasi_protect_sealed_budget_history
BEFORE UPDATE OR DELETE ON "BudgetHistory"
FOR EACH ROW
EXECUTE FUNCTION gasi_reject_sealed_budget_history_mutation();

CREATE OR REPLACE FUNCTION gasi_reject_sealed_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD."action" = 'sealed_cost_audit_artifact' THEN
    RAISE EXCEPTION 'sealed cost audit artifacts are immutable';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gasi_protect_sealed_audit_log ON "AuditLog";
CREATE TRIGGER gasi_protect_sealed_audit_log
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION gasi_reject_sealed_audit_log_mutation();
