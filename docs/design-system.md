# Design System — Superior Contábil (Sistema para Escritórios de Contabilidade)

> Documento de referência do design system do produto. Cobre o site institucional e o sistema logado (área do escritório). Gerado em 2026-08-06 a partir de sessão de definição com o Owner.

## Contexto de decisão

| Pergunta | Decisão |
|---|---|
| Público-alvo | Escritórios de contabilidade (atendem múltiplas empresas/clientes) |
| Personalidade | Sério, corporativo, moderno, **premium** — referência "big four" (PwC, McKinsey), não "SaaS coloridão" |
| Dark mode | Não, por enquanto (v1 só light) |
| Acessibilidade | WCAG AA |
| Módulos previstos | Lançamentos contábeis / DRE / balancetes, notas fiscais, conciliação bancária/financeiro, gestão de clientes e equipe |
| Institucional vs App | Mesma identidade visual forte; institucional tem mais respiro/seções de marketing, app prioriza densidade e eficiência |
| Linguagem de UI | Termos técnicos internos (ex.: "tenant") **nunca** aparecem na interface — usar "empresa atendida" / "cliente" |

---

## 1. Princípios de design

1. **Confiança antes de conversão.** Todo elemento visual reforça solidez financeira — o usuário está confiando dados fiscais e contábeis sensíveis ao produto. Evitar qualquer elemento que pareça "startup brincando".
2. **Densidade com respiro.** O domínio contábil é orientado a tabelas e números. O sistema precisa suportar telas densas sem parecer poluído — espaçamento generoso nas margens, compacto dentro das tabelas.
3. **Cor com propósito, não decoração.** A paleta é predominantemente neutra (navy + cinzas). Cor só aparece para (a) hierarquia de ação, (b) estado semântico do dado (positivo/negativo/pendente), nunca como enfeite.
4. **Números nunca mentem visualmente.** Qualquer valor monetário, percentual ou status fiscal segue convenção de cor/ícone consistente em 100% do produto — o usuário nunca deve precisar ler o número pra saber se é bom ou ruim.
5. **Um sistema, duas velocidades.** Institucional vende confiança em ritmo pausado (storytelling, espaço, prova social); o app entrega eficiência em ritmo rápido (atalhos, densidade, feedback imediato). Mesmos tokens, composições diferentes.

---

## 2. Paleta de cores

### 2.1 Primária — `ink` (navy institucional)

Substitui o `brand` azul-vivo atual. Base de toda a identidade: headers, botões primários, navegação, textos de destaque institucional.

| Token | Hex | Uso | Contraste vs branco |
|---|---|---|---|
| `ink-50` | `#F4F6F9` | Fundos muito sutis, hover em superfícies claras | — |
| `ink-100` | `#E6EAF0` | Bordas suaves, divisores | — |
| `ink-200` | `#C9D2DE` | Bordas de inputs em estado default | — |
| `ink-300` | `#A3B1C4` | Ícones desabilitados, placeholders | — |
| `ink-400` | `#7186A3` | Texto terciário sobre fundo claro | 3.4:1 (não usar p/ texto de corpo) |
| `ink-500` | `#4C6483` | Texto secundário, ícones ativos | 6.1:1 (AA texto grande/normal) |
| `ink-600` | `#354965` | Botão primário (background), links | 9.2:1 |
| `ink-700` | `#24344C` | Texto de corpo sobre branco, botão primário hover | 12.6:1 |
| `ink-800` | `#172336` | Headers institucionais, seções escuras | 15.8:1 |
| `ink-900` | `#0D1523` | Hero do site institucional, sidebar do app, texto de máximo contraste | 18.3:1 |

### 2.2 Secundária/Accent — `aurum` (dourado premium)

Uso **restrito**: selo do "premium" da marca. Nunca em botões primários ou grandes áreas — só em detalhes (ícone ativo, borda de destaque, badge de plano, indicador de seleção).

| Token | Hex | Uso | Contraste |
|---|---|---|---|
| `aurum-50` | `#FBF7EE` | Fundo de badge/destaque sutil | — |
| `aurum-400` | `#C89A46` | Accent sobre fundo escuro (`ink-900`) | 7.1:1 sobre `ink-900` |
| `aurum-500` | `#AD7F2E` | Ícones, bordas, texto grande (≥18px) | 3.6:1 (só texto grande/ícone) |
| `aurum-600` | `#8C6522` | Texto normal sobre branco (links de destaque) | 5.3:1 |
| `aurum-700` | `#6B4C19` | Texto de máximo contraste com o dourado | 7.9:1 |

### 2.3 Neutros — `graphite`

Texto de corpo, fundos, bordas — o grosso da UI.

| Token | Hex | Uso |
|---|---|---|
| `graphite-50` | `#F8F9FA` | Fundo geral da aplicação (substitui `gray-50`) |
| `graphite-100` | `#F1F3F5` | Fundo de cards alternados, hover em linhas de tabela |
| `graphite-200` | `#E4E7EB` | Bordas padrão |
| `graphite-300` | `#D1D6DC` | Bordas em estado disabled |
| `graphite-400` | `#9AA5B1` | Placeholder, ícones inativos |
| `graphite-500` | `#6B7684` | Texto secundário/legenda (4.6:1 — AA ok) |
| `graphite-600` | `#4C5563` | Texto de corpo padrão (7.5:1) |
| `graphite-700` | `#364152` | Texto de ênfase, títulos de card (10.3:1) |
| `graphite-900` | `#121826` | Texto de título principal fora do navy |

### 2.4 Semânticas (estado do dado contábil/fiscal)

Cada cor semântica tem duas camadas: **-500** para ícone/borda/fundo de badge, **-600/700** para texto (garante AA em texto normal).

| Estado | Token texto | Token superfície | Significado no domínio |
|---|---|---|---|
| Sucesso / positivo | `success-700` `#1F6440` (7.1:1) | `success-50` `#EAF6EF` / ícone `success-500` `#2F8F5B` | Saldo positivo, conciliado, obrigação cumprida |
| Erro / negativo | `danger-600` `#A83525` (6.6:1) | `danger-50` `#FBEEEC` / ícone `danger-500` `#C6402F` | Saldo negativo, divergência, erro de validação |
| Alerta / pendência | `warning-700` `#8A5A11` (5.9:1) | `warning-50` `#FBF3E7` / ícone `warning-500` `#B8791A` | Prazo próximo, pendência fiscal, ação requerida |
| Informação | `info-700` `#24497D` (9.0:1) | `info-50` `#EEF3FA` / ícone `info-500` `#3568B0` | Conciliação em processamento, dica, status neutro |

> Números validados por cálculo de luminância relativa (fórmula WCAG). Antes do build final, confirmar com uma ferramenta de contraste (ex.: WebAIM Contrast Checker) — especialmente combinações fora das listadas aqui (ex.: cor sobre cor, não sobre branco/`ink-900`).

**Regra de aplicação para valores monetários:** positivo = `success-700` + nenhum ícone extra (o próprio verde já comunica); negativo = `danger-600` + sinal `-` explícito no número (nunca depender só da cor — regra de acessibilidade para daltonismo).

---

## 3. Tipografia, espaçamento e grid

### 3.1 Tipografia

Mantém `DM Sans` (já carregada no projeto) como fonte de UI — é geométrica, sóbria, lê bem em tabelas densas, e tem um peso "corporate-moderno" sem ser fria como Inter/Helvetica puro. `JetBrains Mono` fica reservada para valores tabulares (`tabular-nums`) quando precisar de alinhamento perfeito de dígitos (ex.: colunas de valores monetários lado a lado).

| Token | Tamanho | Peso | Uso |
|---|---|---|---|
| `text-display` | 36px / 44px lh | 600 | Hero institucional |
| `text-h1` | 28px / 36px lh | 600 | Título de página no app |
| `text-h2` | 22px / 30px lh | 600 | Título de seção/card |
| `text-h3` | 18px / 26px lh | 500 | Subtítulo, cabeçalho de tabela agrupado |
| `text-body` | 14px / 22px lh | 400 | Corpo padrão (densidade contábil pede base menor que os 16px "web comum") |
| `text-sm` | 13px / 18px lh | 400 | Legendas, labels de input, células de tabela |
| `text-xs` | 12px / 16px lh | 500 | Badges, metadados, timestamps |
| `text-mono` | 13px / 20px lh | 400 (JetBrains Mono, `tabular-nums`) | Valores monetários, CNPJ, códigos |

**Justificativa:** produtos financeiros densos (Bloomberg Terminal, QuickBooks, Xero) usam base menor que 16px porque a prioridade é caber mais dado por tela sem rolar — 14px é o ponto de equilíbrio que ainda passa em legibilidade AA quando combinado com `graphite-600`+.

### 3.2 Espaçamento

Escala em base 4px (padrão Tailwind, já compatível com o projeto) — não precisa customizar `spacing`, só documentar o uso:

| Contexto | Espaçamento |
|---|---|
| Padding interno de célula de tabela | `8px` (`py-2 px-3`) |
| Padding de card | `24px` (`p-6`) |
| Gap entre campos de formulário | `16px` (`space-y-4`) |
| Gap entre seções de página | `48px` (`space-y-12`) |
| Margem de seção institucional (landing) | `96–128px` vertical (`py-24`/`py-32`) — aqui sim, respiro generoso |

### 3.3 Grid

- **App (sistema logado):** container fluido com sidebar fixa (`240px` expandida / `72px` colapsada) + conteúdo em grid de 12 colunas, `max-width: 1440px`, gutter `24px`.
- **Institucional:** container centralizado `max-width: 1200px`, grid de 12 colunas, gutter `32px`, mais generoso que o app.

---

## 4. Tokens — `tailwind.config.ts`

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        display: ['36px', { lineHeight: '44px', fontWeight: '600' }],
        h1: ['28px', { lineHeight: '36px', fontWeight: '600' }],
        h2: ['22px', { lineHeight: '30px', fontWeight: '600' }],
        h3: ['18px', { lineHeight: '26px', fontWeight: '500' }],
        body: ['14px', { lineHeight: '22px', fontWeight: '400' }],
        sm: ['13px', { lineHeight: '18px', fontWeight: '400' }],
        xs: ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },
      colors: {
        ink: {
          50: '#F4F6F9',
          100: '#E6EAF0',
          200: '#C9D2DE',
          300: '#A3B1C4',
          400: '#7186A3',
          500: '#4C6483',
          600: '#354965',
          700: '#24344C',
          800: '#172336',
          900: '#0D1523',
        },
        aurum: {
          50: '#FBF7EE',
          100: '#F3E8CC',
          200: '#E6CE99',
          300: '#D6B36B',
          400: '#C89A46',
          500: '#AD7F2E',
          600: '#8C6522',
          700: '#6B4C19',
          800: '#4A3411',
          900: '#2E200A',
        },
        graphite: {
          50: '#F8F9FA',
          100: '#F1F3F5',
          200: '#E4E7EB',
          300: '#D1D6DC',
          400: '#9AA5B1',
          500: '#6B7684',
          600: '#4C5563',
          700: '#364152',
          800: '#202B3B',
          900: '#121826',
        },
        success: {
          50: '#EAF6EF', 500: '#2F8F5B', 600: '#26794D', 700: '#1F6440',
        },
        danger: {
          50: '#FBEEEC', 500: '#C6402F', 600: '#A83525', 700: '#922A1E',
        },
        warning: {
          50: '#FBF3E7', 500: '#B8791A', 600: '#9C6614', 700: '#8A5A11',
        },
        info: {
          50: '#EEF3FA', 500: '#3568B0', 600: '#2C589A', 700: '#24497D',
        },
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
    },
  },
  plugins: [],
} satisfies Config
```

> Nota: o `brand` azul atual (`#3b6ef8`) fica descontinuado. Ao aplicar, os componentes que usam `brand-600`/`bg-brand-*` precisam migrar para `ink-*` (ação primária) — ver seção 9 (aplicação real).

---

## 5. Componentes-base (React + TypeScript)

Convenção: cada componente aceita `variant`, `size` e, quando fizer sentido no domínio, `status`. Sem biblioteca externa de componentes — só Tailwind + `clsx` (leve, sem overhead).

### 5.1 Button

```tsx
// src/design-system/Button.tsx
import { type ButtonHTMLAttributes, forwardRef } from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-ink-600 hover:bg-ink-700 active:bg-ink-900 text-white',
  secondary: 'bg-white hover:bg-graphite-50 active:bg-graphite-100 text-graphite-700 border border-graphite-200',
  ghost: 'bg-transparent hover:bg-graphite-100 text-graphite-700',
  danger: 'bg-danger-600 hover:bg-danger-700 text-white',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-300 focus-visible:ring-offset-2',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'
```

### 5.2 Input

```tsx
// src/design-system/Input.tsx
import { type InputHTMLAttributes, forwardRef, useId } from 'react'
import clsx from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className, ...props }, ref) => {
    const autoId = useId()
    const inputId = id ?? autoId

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-graphite-600 mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={clsx(
            'w-full h-10 px-3 text-sm bg-white border rounded-lg transition-all duration-150',
            'placeholder:text-graphite-400 focus:outline-none focus:ring-2 focus:ring-offset-0',
            error
              ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-100'
              : 'border-graphite-200 focus:border-ink-500 focus:ring-ink-100',
            className,
          )}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-danger-600 mt-1.5">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${inputId}-hint`} className="text-xs text-graphite-500 mt-1.5">
            {hint}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'
```

### 5.3 Badge (status semântico — pendência fiscal, conciliação)

```tsx
// src/design-system/Badge.tsx
import clsx from 'clsx'

type Status = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

const statusClasses: Record<Status, string> = {
  success: 'bg-success-50 text-success-700',
  danger: 'bg-danger-50 text-danger-600',
  warning: 'bg-warning-50 text-warning-700',
  info: 'bg-info-50 text-info-700',
  neutral: 'bg-graphite-100 text-graphite-600',
}

export function Badge({ status = 'neutral', children }: { status?: Status; children: React.ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusClasses[status])}>
      {children}
    </span>
  )
}
```

*Uso no domínio:* `<Badge status="success">Conciliado</Badge>`, `<Badge status="warning">Vence em 3 dias</Badge>`, `<Badge status="danger">Divergência</Badge>`.

### 5.4 Card

```tsx
// src/design-system/Card.tsx
import clsx from 'clsx'

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={clsx('bg-white border border-graphite-200 rounded-xl shadow-sm', className)}>
      {children}
    </div>
  )
}

Card.Header = function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-4 border-b border-graphite-100">{children}</div>
}
Card.Body = function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="p-6">{children}</div>
}
```

### 5.5 Table (densa, orientada a dado contábil)

```tsx
// src/design-system/Table.tsx
import clsx from 'clsx'

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto border border-graphite-200 rounded-xl">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

Table.Head = function TableHead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-graphite-50 text-xs font-medium text-graphite-500 uppercase tracking-wide">{children}</thead>
}
Table.Row = function TableRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={clsx('border-t border-graphite-100 hover:bg-graphite-50/60', className)}>{children}</tr>
}
Table.Cell = function TableCell({ children, align = 'left', mono = false }: { children: React.ReactNode; align?: 'left' | 'right'; mono?: boolean }) {
  return (
    <td className={clsx('px-3 py-2', align === 'right' && 'text-right', mono && 'font-mono tabular-nums')}>
      {children}
    </td>
  )
}
```

*Valor monetário:* `<Table.Cell align="right" mono><span className="text-success-700">+ R$ 12.430,00</span></Table.Cell>` — sempre com sinal explícito, nunca só cor.

### 5.6 Modal

```tsx
// src/design-system/Modal.tsx
import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg mx-4">
        <div className="px-6 py-4 border-b border-graphite-100">
          <h2 id="modal-title" className="text-h3 text-graphite-900">{title}</h2>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
```

---

## 6. Estados assíncronos (loading / erro / vazio)

O projeto atualmente usa `fetch` (via `src/api/client.ts`), **não Axios** — o prompt original assumia Axios, mas o padrão abaixo funciona igual, o formato de erro só muda (`error.message` já normalizado no `client.ts`). Não recomendo adicionar Axios como dependência só pra seguir o prompt à risca — seria uma dependência a mais sem ganho real dado que o client atual já resolve os mesmos problemas (token, headers, erro tratado).

```tsx
// padrão de hook de dados — src/hooks/useAsync.ts
import { useEffect, useState } from 'react'

type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'empty' }
  | { status: 'success'; data: T }

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], isEmpty?: (data: T) => boolean): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    fn()
      .then((data) => {
        if (!active) return
        setState(isEmpty?.(data) ? { status: 'empty' } : { status: 'success', data })
      })
      .catch((err: Error) => {
        if (!active) return
        setState({ status: 'error', error: err.message })
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
```

**Regra de UI para cada estado:**
- `loading` → skeleton (não spinner de tela cheia) para tabelas/listas; spinner só em ações pontuais (botão de submit).
- `error` → mensagem em `danger-600` + ação de retry, nunca troca a tela inteira por um erro genérico.
- `empty` → ilustração leve/ícone + texto orientando a próxima ação (ex.: "Nenhum cliente cadastrado ainda — adicionar o primeiro").
- `success` → conteúdo normal.

---

## 7. Estrutura de pastas sugerida

Adaptada ao que já existe no repo (`packages/frontend/src/{pages,components,api,contexts}`):

```
packages/frontend/src/
├── design-system/          # componentes-base reutilizáveis (este documento, seção 5)
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Badge.tsx
│   ├── Card.tsx
│   ├── Table.tsx
│   ├── Modal.tsx
│   ├── Spinner.tsx
│   └── index.ts             # barrel export
├── components/              # composições específicas de domínio (não genéricas)
│   └── ProtectedRoute.tsx
├── hooks/
│   └── useAsync.ts
├── pages/
│   ├── institucional/       # site institucional (rotas públicas, fora do app logado)
│   │   ├── Home.tsx
│   │   ├── Sobre.tsx
│   │   └── Contato.tsx
│   ├── Login.tsx
│   ├── Onboarding.tsx
│   ├── AceitarConvite.tsx
│   ├── OwnerDashboard.tsx
│   ├── AttendantDashboard.tsx
│   └── app/                 # próximas seções do sistema logado (lançamentos, DRE, etc.)
├── api/
│   └── client.ts
└── contexts/
```

---

## 8. Diretrizes de acessibilidade

1. **Contraste:** todo texto de corpo usa `graphite-600` ou mais escuro sobre branco (nunca `graphite-400`/`500` pra texto de leitura, só pra legendas grandes ou ícones).
2. **Nunca só cor:** status financeiro sempre tem cor **+ texto/ícone/sinal** (ex.: `-` explícito em negativo, palavra "Pendente" no badge, não só a cor).
3. **Foco visível:** todo elemento interativo tem `focus-visible:ring-2` (já no Button/Input acima) — nunca `outline: none` sem substituto.
4. **Tamanho de alvo de toque:** botões e campos com `min-height: 40px` (`h-10`), mínimo 32px (`h-8`) só em ações secundárias densas dentro de tabela.
5. **Rótulos:** todo `input` tem `label` associado via `htmlFor`/`id` (padrão já no componente `Input`); ícones-only precisam de `aria-label`.
6. **Modais:** `role="dialog"`, `aria-modal="true"`, fecha com `Esc`, foco preso dentro do modal (trap de foco — a implementar quando o modal ganhar formulários complexos).
7. **Tabelas:** `<th scope="col">` nos headers, nunca depender só de cor de linha pra indicar seleção/erro.

---

## 9. UX Writing — tom de voz

**Princípio geral:** direto, profissional, sem gírias, mas nunca burocrático a ponto de intimidar. O usuário é um profissional de contabilidade, não precisa de explicações básicas — mas também não é dev, então erros técnicos nunca aparecem crus.

| Contexto | Faça | Evite |
|---|---|---|
| Termos internos | "empresa atendida", "cliente", "equipe" | "tenant", "workspace", "org" |
| Erro de sistema | "Não foi possível salvar. Tente novamente." | "Erro 500: Internal Server Error" |
| Confirmação de ação destrutiva | "Excluir este lançamento? Essa ação não pode ser desfeita." | "Tem certeza?" (vago demais) |
| Estado vazio | Orientar a próxima ação concreta ("Cadastre a primeira empresa atendida") | Mensagem genérica ("Nenhum dado encontrado") |
| Prazo/pendência fiscal | Specific e acionável ("Vence em 3 dias — 09/08") | Vago ("Atenção necessária") |
| Botões | Verbo + objeto ("Salvar lançamento", "Convidar membro") | Genérico ("OK", "Enviar") |

---

## 10. Próximos passos sugeridos

1. Aplicar os tokens novos (`ink`/`aurum`/`graphite`/semânticas) no `tailwind.config.js` real do projeto — feito nesta sessão (ver commit).
2. Criar os componentes de `design-system/` (seção 5) como arquivos reais.
3. Migrar `Login.tsx` e `Onboarding.tsx` pros novos componentes/tokens (hoje usam `brand-*` e classes soltas em `index.css`).
4. Construir o site institucional (`pages/institucional/`) já em cima da nova paleta.
5. Adicionar guard de contraste (ex.: rodar os pares reais no WebAIM Contrast Checker) antes de qualquer ship pra produção.
