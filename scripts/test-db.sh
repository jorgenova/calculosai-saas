#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
TEST_ROOT="$PROJECT_ROOT/.test-data"
PG_DATA="$TEST_ROOT/postgresql"
PG_SOCKET="$TEST_ROOT/postgresql-socket"
PG_LOG="$TEST_ROOT/postgresql.log"
PG_PORT="${TEST_DB_PORT:-5433}"
DB_NAME="calculosai_test"
DB_ADMIN="postgres"
BOOTSTRAP_SQL="$PROJECT_ROOT/scripts/test-db/bootstrap.sql"

require_postgres() {
  if [[ ! -x "$PG_BIN/pg_ctl" ]]; then
    echo "PostgreSQL 16 nao encontrado em $PG_BIN." >&2
    echo "Instale com: brew install postgresql@16" >&2
    exit 1
  fi
}

initialize_cluster() {
  mkdir -p "$TEST_ROOT" "$PG_SOCKET"
  chmod 700 "$PG_SOCKET"

  if [[ -s "$PG_DATA/PG_VERSION" ]]; then
    return
  fi

  local password_file
  password_file="$(mktemp "$TEST_ROOT/postgres-password.XXXXXX")"
  chmod 600 "$password_file"
  printf '%s\n' 'postgres_test_only' > "$password_file"

  "$PG_BIN/initdb" \
    --pgdata="$PG_DATA" \
    --username="$DB_ADMIN" \
    --pwfile="$password_file" \
    --auth-local=trust \
    --auth-host=scram-sha-256 \
    --encoding=UTF8 \
    --locale=en_US.UTF-8

  rm -f "$password_file"
}

is_running() {
  "$PG_BIN/pg_ctl" --pgdata="$PG_DATA" status >/dev/null 2>&1
}

start_server() {
  initialize_cluster

  if ! is_running; then
    "$PG_BIN/pg_ctl" \
      --pgdata="$PG_DATA" \
      --log="$PG_LOG" \
      --options="-p $PG_PORT -k $PG_SOCKET -c listen_addresses=127.0.0.1" \
      --wait start
  fi

  ensure_roles_and_database
}

psql_admin() {
  "$PG_BIN/psql" \
    --host="$PG_SOCKET" \
    --port="$PG_PORT" \
    --username="$DB_ADMIN" \
    --set=ON_ERROR_STOP=1 \
    "$@"
}

ensure_roles_and_database() {
  psql_admin --dbname=postgres <<'SQL'
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_test_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSE
    ALTER ROLE app_user WITH LOGIN PASSWORD 'app_test_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_user') THEN
    CREATE ROLE migration_user LOGIN PASSWORD 'migration_test_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSE
    ALTER ROLE migration_user WITH LOGIN PASSWORD 'migration_test_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$roles$;
SQL

  if [[ "$(psql_admin --dbname=postgres --tuples-only --no-align --command="SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")" != "1" ]]; then
    "$PG_BIN/createdb" \
      --host="$PG_SOCKET" \
      --port="$PG_PORT" \
      --username="$DB_ADMIN" \
      --owner="$DB_ADMIN" \
      "$DB_NAME"
  fi

  psql_admin --dbname="$DB_NAME" --command="GRANT CONNECT ON DATABASE $DB_NAME TO app_user, migration_user" >/dev/null

  if [[ "$(psql_admin --dbname="$DB_NAME" --tuples-only --no-align --command="SELECT to_regclass('public.\"Tenant\"') IS NOT NULL")" != "t" ]]; then
    psql_admin --dbname="$DB_NAME" --file="$BOOTSTRAP_SQL"
  fi

  mark_baseline_migrations
}

migration_is_applied() {
  local migration_name="$1"

  if [[ "$(psql_admin --dbname="$DB_NAME" --tuples-only --no-align --command="SELECT to_regclass('public._prisma_migrations') IS NOT NULL")" != "t" ]]; then
    return 1
  fi

  [[ "$(psql_admin --dbname="$DB_NAME" --tuples-only --no-align --command="SELECT 1 FROM _prisma_migrations WHERE migration_name = '$migration_name' AND finished_at IS NOT NULL LIMIT 1")" == "1" ]]
}

mark_baseline_migrations() {
  local prisma_bin="$PROJECT_ROOT/node_modules/.bin/prisma"
  local database_url="postgresql://postgres:postgres_test_only@127.0.0.1:$PG_PORT/$DB_NAME"

  if [[ ! -x "$prisma_bin" ]]; then
    echo "Aviso: Prisma nao instalado; migrations baseline nao foram registradas." >&2
    return
  fi

  for migration_name in 0001_baseline 0002_tenant_status_convite; do
    if ! migration_is_applied "$migration_name"; then
      (
        cd "$PROJECT_ROOT/packages/backend"
        DATABASE_URL="$database_url" "$prisma_bin" migrate resolve --applied "$migration_name"
      )
    fi
  done
}

stop_server() {
  if [[ ! -s "$PG_DATA/PG_VERSION" ]]; then
    echo "Banco de testes ainda nao foi inicializado."
    return
  fi

  if is_running; then
    "$PG_BIN/pg_ctl" --pgdata="$PG_DATA" --wait stop
  else
    echo "Banco de testes ja esta parado."
  fi
}

reset_database() {
  start_server
  psql_admin --dbname=postgres --command="DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE)"
  "$PG_BIN/createdb" \
    --host="$PG_SOCKET" \
    --port="$PG_PORT" \
    --username="$DB_ADMIN" \
    --owner="$DB_ADMIN" \
    "$DB_NAME"
  psql_admin --dbname="$DB_NAME" --command="GRANT CONNECT ON DATABASE $DB_NAME TO app_user, migration_user" >/dev/null
  psql_admin --dbname="$DB_NAME" --file="$BOOTSTRAP_SQL"
  mark_baseline_migrations
}

show_status() {
  if [[ -s "$PG_DATA/PG_VERSION" ]] && is_running; then
    echo "PostgreSQL de testes: ativo"
    echo "Banco: $DB_NAME"
    echo "Host: 127.0.0.1"
    echo "Porta: $PG_PORT"
    echo "Dados: $PG_DATA"
  else
    echo "PostgreSQL de testes: parado"
    return 1
  fi
}

require_postgres

case "${1:-}" in
  start)
    start_server
    show_status
    ;;
  stop)
    stop_server
    ;;
  status)
    show_status
    ;;
  reset)
    reset_database
    show_status
    ;;
  *)
    echo "Uso: $0 {start|stop|status|reset}" >&2
    exit 2
    ;;
esac
