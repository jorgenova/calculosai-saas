# Guia de contribuição

## Branches

As branches devem seguir a especificação [Conventional Branch 1.1.0](https://conventionalbranch.org/):

```
<tipo>/<descricao-em-kebab-case>
```

Use apenas letras minúsculas, números, hífens e pontos (estes últimos, em geral, para versões). Não use espaços, underscores, letras maiúsculas, separadores duplicados ou descrição iniciada/terminada em hífen ou ponto.

Tipos aceitos:

| Tipo | Quando usar | Exemplo |
| --- | --- | --- |
| `feature/` ou `feat/` | Nova funcionalidade | `feature/adicionar-cliente` |
| `bugfix/` ou `fix/` | Correção não urgente | `fix/corrigir-login` |
| `hotfix/` | Correção urgente em produção | `hotfix/corrigir-vazamento-de-sessao` |
| `release/` | Preparação de uma versão | `release/v1.2.0` |
| `chore/` | Manutenção, dependências ou documentação | `chore/atualizar-dependencias` |

`main` é a branch de integração e não recebe prefixo. Toda tarefa deve começar a partir dela. Agentes de IA também usam o tipo que melhor descreve a tarefa, como `feature/` ou `fix/`.

O workflow **Branch name** valida automaticamente o nome da branch em todo pull request. Exemplos inválidos: `Feature/Adicionar-Cliente`, `feature/nome_com_underscore`, `feature/nome--duplicado` e `adicionar-cliente`.

## Commits

As mensagens de commit seguem [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>: <descricao curta no imperativo>
```

Use, conforme o caso, `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf` ou `style`.

Exemplos:

```
feat: adicionar cadastro de cliente
fix: corrigir validacao de slug
docs: documentar ambiente local de testes
```

## Idioma e nomenclatura

Use inglês em todos os novos arquivos e na programação: nomes de diretórios,
arquivos de código, variáveis, funções, classes, tipos, interfaces, módulos,
rotas, APIs, comentários técnicos e mensagens de erro internas. Não introduza
novos identificadores em português.

O conteúdo visível ao usuário (textos da interface, e-mails e documentação de
produto) pode ser em português quando for esse o idioma definido para o
produto.

No PostgreSQL, nomes de tabelas devem ser sempre em inglês, no singular e em
minúsculas. Nomes de colunas devem ser sempre em inglês, em minúsculas e no
formato `snake_case`. Exemplos: tabela `invoice`; colunas `created_at` e
`payment_status`. Não use maiúsculas, espaços, hífens, plural em tabelas ou
nomes em português no schema.

Esta convenção vale para novos desenvolvimentos; renomeações de estruturas
existentes devem ser planejadas separadamente para evitar migrações
desnecessárias ou incompatíveis.

## Pull requests

1. Atualize sua branch com `main` antes de abrir ou concluir o PR.
2. Mantenha o PR focado em uma tarefa e descreva a mudança e como ela foi validada.
3. Aguarde os checks obrigatórios e a revisão aplicável.
4. Integre PRs aprovados usando **Squash and merge**, com título no formato Conventional Commits.
5. Exclua a branch após o merge.

No GitHub, configure o check **Branch name** como obrigatório na proteção da branch `main`.
