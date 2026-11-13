# Instruções para agentes

Leia [CONTRIBUTING.md](CONTRIBUTING.md) antes de criar branches, commits ou
pull requests. Ele é a fonte completa das convenções de colaboração do
projeto.

## Git e branches

- Nunca trabalhe diretamente em `main`; crie uma branch a partir dela.
- Use [Conventional Branch 1.1.0](https://conventionalbranch.org/), no formato
  `<tipo>/<descricao-em-kebab-case>`, sempre em letras minúsculas.
- Escolha o prefixo pela natureza da tarefa, inclusive quando o trabalho for
  feito por IA: `feature/` ou `feat/`, `bugfix/` ou `fix/`, `hotfix/`,
  `release/` ou `chore/`.
- Exemplos válidos: `feature/adicionar-cliente`, `fix/corrigir-login` e
  `chore/atualizar-dependencias`.
- Não use prefixos que identifiquem o agente, como `codex/` ou `ai/`; neste
  projeto a branch descreve a tarefa.

## Commits e pull requests

- Escreva commits no padrão Conventional Commits, por exemplo
  `feat: adicionar cadastro de cliente` ou `fix: corrigir validacao de slug`.
- Mantenha cada pull request focado, execute as verificações adequadas e
  informe no PR como a mudança foi validada.
- Pull requests aprovados são integrados por **Squash and merge**; use um
  título no padrão Conventional Commits.

## Idioma e nomenclatura

- Crie arquivos e escreva código em inglês: paths, nomes de arquivos, variáveis,
  funções, classes, tipos, interfaces, módulos, rotas, APIs, comentários
  técnicos e mensagens de erro internas.
- Não crie novos identificadores em português. Textos visíveis ao usuário
  podem ficar em português quando isso for requerido pelo produto.
- Em PostgreSQL, use tabelas em inglês, no singular e em minúsculas, como
  `invoice`. Use colunas em inglês, minúsculas e `snake_case`, como
  `created_at` e `payment_status`.
- Não renomeie estruturas existentes só para adequá-las a esta regra sem uma
  mudança planejada e uma migração compatível.
