# 📊 Dashboard Meta Ads v2 — Priscilla Dantas

Dashboard de performance com dados direto da **API do Meta Ads** + **Google Sheets (Kiwify)**.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS + JavaScript (vanilla) |
| Gráficos | Chart.js v4 |
| API Tráfego | Meta Ads API (Graph API v19.0) |
| API Vendas | Google Sheets CSV público |
| Serverless | Vercel Edge Functions (`/api`) |
| Hospedagem | Vercel |

---

## Variáveis de Ambiente (Vercel)

Configure no painel do Vercel → Settings → Environment Variables:

| Variável | Valor |
|---|---|
| `META_TOKEN` | Token de longa duração da Meta Ads API |

---

## Estrutura

```
/
├── index.html       # Dashboard (single file)
├── api/
│   ├── meta.js      # Serverless: busca insights do Meta Ads
│   └── sheets.js    # Serverless: busca vendas do Google Sheets
├── vercel.json      # Config de headers e runtime
└── README.md
```

---

## Fontes de Dados

### Tráfego → Meta Ads API
- Endpoint: `GET /api/meta?produto=KD26&since=2026-06-01&until=2026-07-06`
- Dados: investimento, impressões, cliques, LP views, checkouts — por dia e por anúncio
- Campanha KD26: `[KD26][VENDAS][FRIO][ADV][CBO] Vendas Perpétuo`
- Campanha PPRR26: `[PPRR26][VSL][VENDAS][HOT][ADV][CBO] Vendas Perpétuo`

### Vendas → Google Sheets (Kiwify)
- Endpoint: `GET /api/sheets?produto=KD26&since=2026-06-01&until=2026-07-06`
- Planilha: `1XN7oDDT48A39_CpeY1Lr8V-zcN4KmYO01YQNK0DC7gQ`
- KD26 GID: `591361303`
- PPRR26 GID: `1958580679`

---

## Deploy

1. Suba o repositório no GitHub
2. Conecte ao Vercel
3. Configure a variável de ambiente `META_TOKEN`
4. Deploy automático a cada push na `main`

```bash
git add .
git commit -m "init dashboard v2"
git push origin main
```

---

## Renovação do Token

O token Meta expira em ~60 dias. Para renovar:

1. Acesse o Graph API Explorer em developers.facebook.com
2. Gere novo token com permissões `ads_read` e `ads_management`
3. Converta para longa duração via URL de exchange
4. Atualize a variável `META_TOKEN` no Vercel

---

*Desenvolvido por Rafael Geiger · Gestão de Tráfego & Análise de Performance*
