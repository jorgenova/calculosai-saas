#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
PG_SOCKET="$PROJECT_ROOT/.test-data/postgresql-socket"
PG_PORT="${TEST_DB_PORT:-5433}"
DB_NAME="calculosai_migration_test"
DB_ADMIN="postgres"
LEGACY_SQL="$PROJECT_ROOT/scripts/test-db/legacy-office-snapshot.sql"
EXPANSION_SQL="$PROJECT_ROOT/packages/backend/prisma/migrations/0004_office_hierarchy_and_companies/migration.sql"
CONTRACTION_SQL="$PROJECT_ROOT/packages/backend/prisma/migrations/0005_remove_tenant_cnpj/migration.sql"

"$PROJECT_ROOT/scripts/test-db.sh" start >/dev/null

psql_admin() {
  "$PG_BIN/psql" \
    --host="$PG_SOCKET" \
    --port="$PG_PORT" \
    --username="$DB_ADMIN" \
    --set=ON_ERROR_STOP=1 \
    "$@"
}

psql_admin --dbname=postgres --command="DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE)" >/dev/null
"$PG_BIN/createdb" \
  --host="$PG_SOCKET" \
  --port="$PG_PORT" \
  --username="$DB_ADMIN" \
  --owner="$DB_ADMIN" \
  "$DB_NAME"
psql_admin --dbname="$DB_NAME" --file="$LEGACY_SQL" >/dev/null

# Rehearse the expansion inside a transaction and prove the pre-contract rollback.
psql_admin --dbname="$DB_NAME" \
  --command='BEGIN' \
  --file="$EXPANSION_SQL" \
  --command="DO \$verify\$ BEGIN
    IF (SELECT COUNT(*) FROM offices) <> (SELECT COUNT(*) FROM tenants) THEN
      RAISE EXCEPTION 'initial office count does not match tenant count';
    END IF;
    IF (SELECT COUNT(*) FROM office_accesses) <> 1 THEN
      RAISE EXCEPTION 'attendant backfill count is invalid';
    END IF;
    IF (SELECT COUNT(*) FROM invitation_offices) <> 1 THEN
      RAISE EXCEPTION 'pending invitation backfill count is invalid';
    END IF;
  END \$verify\$" \
  --command='ROLLBACK' >/dev/null

if [[ "$(psql_admin --dbname="$DB_NAME" --tuples-only --no-align --command="SELECT to_regclass('public.offices') IS NULL")" != "t" ]]; then
  echo 'Expansion rollback left Office structures behind.' >&2
  exit 1
fi

# Apply the expansion for real and validate all backfilled relationships.
psql_admin --dbname="$DB_NAME" --single-transaction --file="$EXPANSION_SQL" >/dev/null
psql_admin --dbname="$DB_NAME" --command="DO \$verify\$ BEGIN
  IF EXISTS (
    SELECT 1 FROM tenants t
    LEFT JOIN offices o ON o.tenant_id = t.id AND o.cnpj = t.cnpj
    WHERE o.id IS NULL
  ) THEN
    RAISE EXCEPTION 'tenant without matching initial office';
  END IF;
  IF EXISTS (
    SELECT 1 FROM office_accesses oa
    JOIN users u ON u.id = oa.user_id
    JOIN offices o ON o.id = oa.office_id
    WHERE oa.tenant_id <> u.tenant_id OR oa.tenant_id <> o.tenant_id OR u.role <> 'attendant'
  ) THEN
    RAISE EXCEPTION 'cross-tenant or owner office access was backfilled';
  END IF;
END \$verify\$" >/dev/null

# Apply the contract, then prove the documented recovery can restore Tenant CNPJ.
psql_admin --dbname="$DB_NAME" --single-transaction --file="$CONTRACTION_SQL" >/dev/null
if [[ "$(psql_admin --dbname="$DB_NAME" --tuples-only --no-align --command="SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'cnpj')")" != "f" ]]; then
  echo 'Tenant CNPJ still exists after the contract migration.' >&2
  exit 1
fi

psql_admin --dbname="$DB_NAME" \
  --command='BEGIN' \
  --command='ALTER TABLE tenants ADD COLUMN cnpj TEXT' \
  --command='UPDATE tenants t SET cnpj = o.cnpj FROM offices o WHERE o.tenant_id = t.id' \
  --command="DO \$verify\$ BEGIN
    IF EXISTS (SELECT 1 FROM tenants WHERE cnpj IS NULL) THEN
      RAISE EXCEPTION 'Tenant CNPJ recovery from initial Office failed';
    END IF;
  END \$verify\$" \
  --command='ROLLBACK' >/dev/null

echo 'OK: legacy snapshot, expansion rollback, backfill, contract, and CNPJ recovery were validated.'
