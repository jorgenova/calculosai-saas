# Semana 1 — Repositório, Estrutura e Banco

## 1. Estrutura do Projeto

```bash
# Entrar na pasta do projeto
cd saas_scaffolding

# Criar package.json raiz
npm init -y

# Criar estrutura de pastas
mkdir -p packages/shared packages/backend packages/frontend

# Criar package.json de cada pacote
cd packages/shared && npm init -y && cd ../..
cd packages/backend && npm init -y && cd ../..
cd packages/frontend && npm init -y && cd ../..

# Instalar TypeScript na raiz
npm install -D typescript --save-exact

# Abrir no VS Code
code .
```

---

## 2. Arquivos criados manualmente no VS Code

### `package.json` — raiz
```json
{
  "name": "saas-scaffolding",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev:backend": "npm run dev --workspace=packages/backend",
    "dev:frontend": "npm run dev --workspace=packages/frontend"
  }
}
```

### `tsconfig.json` — raiz
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "exclude": ["node_modules", "dist"]
}
```

### `tsconfig.json` — packages/backend
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

### `tsconfig.json` — packages/shared
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

### `.gitignore` — raiz
```
# Dependencies
node_modules/

# Build
dist/

# Environment — NUNCA sobe pro repositório
.env
.env.local
.env.production

# Logs
*.log
npm-debug.log*

# OS
.DS_Store

# IDE
.vscode/
.idea/
```

---

## 3. Git — Primeiro Commit

```bash
git add .
git commit -m "feat: monorepo structure with npm workspaces and typescript config"
git push origin main
```

---

## 4. Banco de Dados — Supabase

### Criar usuários
```sql
CREATE ROLE app_user WITH LOGIN PASSWORD 'sua-senha-aqui';
CREATE ROLE migration_user WITH LOGIN PASSWORD 'sua-senha-aqui';
```

### Permissões do app_user
```sql
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

### Permissões do migration_user
```sql
GRANT ALL PRIVILEGES ON SCHEMA public TO migration_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO migration_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO migration_user;
```

### Verificar BYPASSRLS do app_user — deve retornar false
```sql
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'app_user';
```

---

## 5. Queries Úteis

```sql
-- Verificar usuário atual
SELECT current_user;

-- Verificar banco atual
SELECT current_database();

-- Listar todos os usuários e permissões
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
FROM pg_roles
ORDER BY rolname;

-- Verificar RLS nas tabelas (disponível após semana 2)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

---

## Checklist Semana 1

- [x] Repositório Git criado
- [x] Monorepo com npm workspaces configurado
- [x] Pacotes `shared`, `backend` e `frontend` criados
- [x] TypeScript configurado em todos os pacotes
- [x] `.gitignore` configurado
- [x] PostgreSQL provisionado no Supabase (região São Paulo)
- [x] `app_user` criado sem `BYPASSRLS`
- [x] `migration_user` criado com privilégios de DDL
