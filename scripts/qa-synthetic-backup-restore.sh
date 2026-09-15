#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
backup="$workdir/mediquote-e2e.dump"
before="$workdir/before.tsv"
after="$workdir/after.tsv"
schema_before="$workdir/schema-before.sql"
schema_after="$workdir/schema-after.sql"
seq_before="$workdir/sequences-before.tsv"
seq_after="$workdir/sequences-after.tsv"

snapshot_counts() {
  local output="$1"
  psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 <<'SQL' > "$output"
SELECT format('%I.%I', schemaname, tablename)
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
SQL
  while IFS= read -r table; do
    [ -n "$table" ] || continue
    count="$(psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM $table")"
    printf '%s\t%s\n' "$table" "$count"
  done < "$output" > "$output.counts"
  mv "$output.counts" "$output"
}

snapshot_schema() {
  pg_dump "$DATABASE_URL" --schema-only --no-owner --no-acl \
    | sed -E '/^--/d; /^SET /d; /^SELECT pg_catalog\.set_config/d; /^\\restrict /d; /^\\unrestrict /d; /^COMMENT ON SCHEMA public IS '\''\'\'';$/d; /^[[:space:]]*$/d'
}

snapshot_sequences() {
  psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -F $'\t' <<'SQL'
SELECT schemaname || '.' || sequencename, last_value, start_value, increment_by, cycle
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename;
SQL
}

echo '[restore-drill] capturing synthetic pre-backup invariants'
snapshot_counts "$before"
snapshot_schema > "$schema_before"
snapshot_sequences > "$seq_before"
[ -s "$before" ] || { echo 'No public tables found; refusing meaningless restore drill.' >&2; exit 1; }
[ -s "$schema_before" ] || { echo 'Schema snapshot is empty; refusing meaningless restore drill.' >&2; exit 1; }

echo '[restore-drill] creating and validating custom-format backup'
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$backup"
[ -s "$backup" ] || { echo 'Backup artifact is empty.' >&2; exit 1; }
pg_restore --list "$backup" >/dev/null

echo '[restore-drill] destroying isolated public schema to prove recovery is real'
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
remaining="$(psql "$DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'")"
[ "$remaining" = '0' ] || { echo 'Destructive reset did not empty public schema.' >&2; exit 1; }

echo '[restore-drill] restoring backup into empty schema'
pg_restore --dbname="$DATABASE_URL" --no-owner --no-acl --exit-on-error "$backup"

echo '[restore-drill] verifying exact table inventory and row counts'
snapshot_counts "$after"
diff -u "$before" "$after" || { echo 'Restore invariant mismatch: table inventory or row counts differ.' >&2; exit 1; }

echo '[restore-drill] verifying restored schema definition'
snapshot_schema > "$schema_after"
diff -u "$schema_before" "$schema_after" || { echo 'Restore invariant mismatch: schema definition differs.' >&2; exit 1; }

echo '[restore-drill] verifying sequence state'
snapshot_sequences > "$seq_after"
diff -u "$seq_before" "$seq_after" || { echo 'Restore invariant mismatch: sequence state differs.' >&2; exit 1; }

echo '[restore-drill] PASS: backup readable; destructive recovery succeeded; rows, schema and sequences match'
