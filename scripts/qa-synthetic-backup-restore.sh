#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
backup="$workdir/mediquote-e2e.dump"
before="$workdir/before.tsv"
after="$workdir/after.tsv"

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

echo '[restore-drill] capturing synthetic pre-backup invariants'
snapshot_counts "$before"
[ -s "$before" ] || { echo 'No public tables found; refusing meaningless restore drill.' >&2; exit 1; }

echo '[restore-drill] creating custom-format backup'
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
if ! diff -u "$before" "$after"; then
  echo 'Restore invariant mismatch: table inventory or row counts differ.' >&2
  exit 1
fi

echo '[restore-drill] PASS: synthetic database restored with exact table/count invariants'
