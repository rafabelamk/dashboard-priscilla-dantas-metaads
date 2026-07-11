# 📊 Dashboard Meta Ads — Priscilla Dantas

Dashboard de performance Meta Ads para **KD26 — Kit de Documento** e **PPRR26 — Primeiros Passos da Regularização Rural**.

🔗 **[Acessar Dashboard](https://dashboard-priscilla-dantas-metaads.vercel.app)**

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS + JavaScript (vanilla) |
| Gráficos | Chart.js v4 |
| Parse de CSV | PapaParse v5 |
| Hospedagem | Vercel (static + serverless) |
| Tráfego | Meta Ads API (Graph API v19.0) |
| Vendas | Google Sheets (CSV público via PapaParse) |

---

## Fontes de Dados

### Tráfego — Meta Ads API (`/api/meta`)
- **Conta:** `act_1519004369175892`
- **Campanha KD26:** `[KD26][VENDAS][FRIO][ADV][CBO] Vendas Perpétuo`
- **Campanha PPRR26:** `[PPRR26][VSL][VENDAS][HOT][ADV][CBO] Vendas Perpétuo`
- **Dados:** Investimento, Impressões, Link Clicks, LP Views, Checkouts, CPM, CTR, CPC — por dia e por anúncio
- **Campos API:** `spend`, `impressions`, `inline_link_clicks`, `actions`, `cpm`
- **CTR/CPC:** calculados manualmente (`inline_link_clicks / impressions`)

### KD26 — Vendas + Order Bump por Anúncio
- **Planilha:** `1toosBhz-oiZhy3sZ9bpI9edPisq8XRkYnhaUBurRKBE`
- **GID:** `704030411` (aba "Cópia de KD26")
- **Filtros:**
  - `rawKD26All` = linhas onde `campaign` NÃO contém `[PPRR26]`
  - `rawOB` = linhas com `OrderBump = TRUE` e `campaign` não contém `[PPRR26]`
- **Colunas usadas:** `data corrigida`, `campaign`, `content` (utm_content), `medium`, `OrderBump`
- **Atribuição:** por `utm_content` (não pelo Meta) — cruzado com `ad_name` da API
- **OB iniciou em:** 07/07/2026

### KD26 — KPIs Gerais (Consolidado)
- **Planilha:** `1XN7oDDT48A39_CpeY1Lr8V-zcN4KmYO01YQNK0DC7gQ`
- **GID:** `710709317` (aba "Consolidado KD26")
- **Colunas usadas:** `Venda KD26`, `Faturamento KD26`, `Venda OB GPPRROB`, `Faturamento OB GPPRROB`

### PPRR26 — Vendas por Anúncio
- **Planilha:** `1toosBhz-oiZhy3sZ9bpI9edPisq8XRkYnhaUBurRKBE`
- **GID:** `2135483138` (aba "Cópia de PPRR26")
- **Colunas usadas:** `data corrigida`, `content` (utm_content), `medium` (teste A/B de páginas)
- **Atribuição:** por `utm_content`, cruzado com `ad_name` da API

### Links dos Anúncios — Instagram Permalink
- **Planilha:** `1XN7oDDT48A39_CpeY1Lr8V-zcN4KmYO01YQNK0DC7gQ`
- **GID:** `384375254`
- **Cruzamento:** coluna `Ad Name` (D) × coluna `Instagram Permalink URL` (R)
- **Prioridade:** planilha → API do Meta (fallback)

---

## Preços dos Produtos

| Produto | Preço |
|---|---|
| KD26 | R$ 47,00 |
| PPRR26 | R$ 297,00 |
| OB GPPRROB | R$ 29,00 |

---

## Lógicas de Negócio

### KD26
- **Checkouts:** pixel não computava antes de 02/07/2026 — métricas LP→Chk e Chk→Venda mostram `—` antes dessa data
- **TX OB:** calculada só a partir de 07/07/2026 = `Vendas OB / Vendas KD26 (desde 07/07)`
- **CAC KD26:** Investimento / Vendas KD26
- **CAC Geral:** Investimento / (Vendas KD26 + Vendas OB)
- **ROAS:** Faturamento Total (KD26 + OB) / Investimento

### PPRR26
- **Teste A/B de páginas** via `utm_medium`:
  - `PAG V0 (curta)` → medium contém `PAG V0`
  - `PAG V0-2 (longa)` → medium contém `PAG V0-2`
- **CAC:** Investimento PPRR26 / Vendas PPRR26
- **ROAS:** Faturamento PPRR26 / Investimento PPRR26

### Alerta de CPA
Na tabela de Performance por Anúncio, o CPA fica em **vermelho ⚠** quando ultrapassa o preço do produto:
- KD26 → alerta se CPA > R$ 47,00
- PPRR26 → alerta se CPA > R$ 297,00

### Métricas Calculadas

```
CPM           = (Investimento / Impressões) × 1000
CTR           = inline_link_clicks / Impressões × 100
CPC           = Investimento / inline_link_clicks
Connect Rate  = LP Views / Cliques × 100
LP → Checkout = Checkouts / LP Views × 100   [KD26: só desde 02/07]
Chk → Venda   = Vendas / Checkouts × 100     [KD26: só desde 02/07]
Conv. Pg Venda= Vendas / LP Views × 100
CAC           = Investimento / Vendas
ROAS          = Faturamento Total / Investimento
TX OB         = Vendas OB / Vendas KD26 (desde 07/07) × 100
```

---

## Filtros de Período

| Botão | Lógica |
|---|---|
| Hoje | Só hoje |
| Ontem | Só ontem |
| Últimos X dias | X dias fechados **antes** de hoje (exclui hoje) |
| Período Total | 30/06/2026 até hoje |
| Personalizar | Datas livres |

---

## Variável de Ambiente (Vercel)

| Variável | Descrição |
|---|---|
| `META_TOKEN` | Token de longa duração da Meta Ads API (~60 dias) |

### Renovação do Token (a cada ~50 dias)
1. [developers.facebook.com](https://developers.facebook.com) → Tools → Graph API Explorer
2. App: **Dash Priscilla Dantas** (ID: `999378593085861`)
3. Permissões: `ads_read` + `ads_management`
4. Gera token curto → converte para longo via URL:
```
https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=999378593085861&client_secret=02379cb62b09eb971ad8faa9317b978b&fb_exchange_token={TOKEN_CURTO}
```
5. Atualiza `META_TOKEN` no Vercel → redeploy

---

## Estrutura do Projeto

```
/
├── index.html          # Dashboard completo (single file)
├── api/
│   └── meta.js         # Serverless: busca insights Meta Ads API
├── vercel.json         # Config headers CORS
└── README.md
```

---

## Deploy

Automático a cada push na branch `main` via Vercel.

```bash
git add index.html
git commit -m "update dashboard"
git push origin main
```

---

*Desenvolvido por Rafaela Geiger · Gestão de Tráfego & Análise de Performance*
