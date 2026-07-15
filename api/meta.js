const TOKEN = process.env.META_TOKEN;

// ─── CONTAS ATIVAS ────────────────────────────────────────────────────────────
// Para pausar uma conta: comente ou remova a linha. Para reativar: adicione de volta.
const AD_ACCOUNTS = [
  'act_1519004369175892',   // conta principal — pausada temporariamente
  'act_1457463461835190',   // conta ativa
];

const CAMPAIGNS = {
  KD26: '[KD26][VENDAS][FRIO][ADV][CBO] Vendas Perpétuo',
  PPRR26: '[PPRR26][VSL][VENDAS][HOT][ADV][CBO] Vendas Perpétuo',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { produto, since, until } = req.query;

  if (!produto || !CAMPAIGNS[produto]) {
    return res.status(400).json({ error: 'Parâmetro produto inválido. Use KD26 ou PPRR26.' });
  }

  if (!TOKEN) {
    return res.status(500).json({ error: 'META_TOKEN não configurado.' });
  }

  const today = new Date();
  const defaultUntil = today.toISOString().split('T')[0];
  const defaultSince = new Date(today - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const sinceDate = since || defaultSince;
  const untilDate = until || defaultUntil;

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  const getAction = (actions, key) => {
    if (!actions) return 0;
    const found = actions.find(a => a.action_type === key);
    return found ? parseFloat(found.value) : 0;
  };

  // ─── BUSCA POR CONTA ──────────────────────────────────────────────────────
  // Roda em paralelo para todas as contas ativas e agrega os resultados
  const resultsPerAccount = await Promise.allSettled(
    AD_ACCOUNTS.map(account => fetchAccount(account, produto, sinceDate, untilDate, TOKEN, getAction))
  );

  // Filtra contas que retornaram com sucesso
  const successful = resultsPerAccount
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  if (successful.length === 0) {
    const errors = resultsPerAccount
      .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value))
      .map(r => r.reason?.message || 'Campanha não encontrada');
    return res.status(404).json({ error: 'Nenhuma conta retornou dados.', detalhes: errors });
  }

  // ─── AGREGA DIÁRIO (soma por data) ────────────────────────────────────────
  const diarioMap = {};
  for (const result of successful) {
    for (const r of result.diario) {
      if (!diarioMap[r.data]) {
        diarioMap[r.data] = { data: r.data, investimento: 0, impressoes: 0, cliques: 0, lp_views: 0, checkouts: 0 };
      }
      diarioMap[r.data].investimento += r.investimento;
      diarioMap[r.data].impressoes   += r.impressoes;
      diarioMap[r.data].cliques      += r.cliques;
      diarioMap[r.data].lp_views     += r.lp_views;
      diarioMap[r.data].checkouts    += r.checkouts;
    }
  }
  const diario = Object.values(diarioMap)
    .sort((a, b) => a.data.localeCompare(b.data))
    .map(r => ({
      ...r,
      cpm: r.impressoes > 0 ? (r.investimento / r.impressoes) * 1000 : 0,
      ctr: r.impressoes > 0 ? (r.cliques / r.impressoes) * 100 : 0,
      cpc: r.cliques > 0 ? r.investimento / r.cliques : 0,
    }));

  // ─── AGREGA POR ANÚNCIO (soma por ad_name) ────────────────────────────────
  const adMap = {};
  for (const result of successful) {
    for (const a of result.por_anuncio) {
      if (!adMap[a.ad_name]) {
        adMap[a.ad_name] = {
          ad_name: a.ad_name,
          ad_id: a.ad_id,
          instagram_permalink: a.instagram_permalink,
          investimento: 0, impressoes: 0, cliques: 0, lp_views: 0, checkouts: 0,
        };
      }
      adMap[a.ad_name].investimento += a.investimento;
      adMap[a.ad_name].impressoes   += a.impressoes;
      adMap[a.ad_name].cliques      += a.cliques;
      adMap[a.ad_name].lp_views     += a.lp_views;
      adMap[a.ad_name].checkouts    += a.checkouts;
      if (!adMap[a.ad_name].instagram_permalink && a.instagram_permalink) {
        adMap[a.ad_name].instagram_permalink = a.instagram_permalink;
      }
    }
  }
  const por_anuncio = Object.values(adMap)
    .map(a => ({
      ...a,
      ctr: a.impressoes > 0 ? (a.cliques / a.impressoes) * 100 : 0,
    }))
    .sort((a, b) => b.investimento - a.investimento);

  return res.status(200).json({
    produto,
    contas_ativas: successful.map(r => r.conta),
    campanhas: successful.map(r => r.campanha),
    periodo: { since: sinceDate, until: untilDate },
    diario,
    por_anuncio,
  });
}

// ─── FETCH POR CONTA ──────────────────────────────────────────────────────────
async function fetchAccount(account, produto, sinceDate, untilDate, TOKEN, getAction) {
  // 1. Buscar campanha
  const campaignUrl = new URL(`https://graph.facebook.com/v19.0/${account}/campaigns`);
  campaignUrl.searchParams.set('fields', 'id,name,status');
  campaignUrl.searchParams.set('access_token', TOKEN);
  campaignUrl.searchParams.set('limit', '100');

  const campaignRes = await fetch(campaignUrl.toString());
  const campaignData = await campaignRes.json();
  if (campaignData.error) throw new Error(campaignData.error.message);

  const campaign = campaignData.data?.find(c => c.name === CAMPAIGNS[produto]);
  if (!campaign) return null; // conta não tem essa campanha — ignora silenciosamente

  // 2. Insights diários
  const insightsUrl = new URL(`https://graph.facebook.com/v19.0/${campaign.id}/insights`);
  insightsUrl.searchParams.set('fields', 'date_start,spend,impressions,inline_link_clicks,cpm,actions');
  insightsUrl.searchParams.set('time_range', JSON.stringify({ since: sinceDate, until: untilDate }));
  insightsUrl.searchParams.set('time_increment', '1');
  insightsUrl.searchParams.set('access_token', TOKEN);
  insightsUrl.searchParams.set('limit', '500');

  const insightsRes = await fetch(insightsUrl.toString());
  const insightsText = await insightsRes.text();
  let insightsData;
  try { insightsData = JSON.parse(insightsText); } catch(e) { throw new Error('Parse error diario'); }
  if (insightsData.error) throw new Error(insightsData.error.message);

  // 3. Insights por anúncio
  const adInsightsUrl = new URL(`https://graph.facebook.com/v19.0/${campaign.id}/insights`);
  adInsightsUrl.searchParams.set('fields', 'ad_name,ad_id,spend,impressions,inline_link_clicks,cpm,actions');
  adInsightsUrl.searchParams.set('time_range', JSON.stringify({ since: sinceDate, until: untilDate }));
  adInsightsUrl.searchParams.set('level', 'ad');
  adInsightsUrl.searchParams.set('access_token', TOKEN);
  adInsightsUrl.searchParams.set('limit', '200');

  const adInsightsRes = await fetch(adInsightsUrl.toString());
  const adInsightsText = await adInsightsRes.text();
  let adInsightsData;
  try { adInsightsData = JSON.parse(adInsightsText); } catch(e) { throw new Error('Parse error ads'); }
  if (adInsightsData.error) throw new Error(adInsightsData.error.message);

  // 4. Permalinks
  const adIds = [...new Set((adInsightsData.data || []).map(a => a.ad_id).filter(Boolean))];
  const permalinkMap = {};
  if (adIds.length > 0) {
    const chunks = [];
    for (let i = 0; i < adIds.length; i += 50) chunks.push(adIds.slice(i, i + 50));
    const timeout = ms => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
    await Promise.allSettled(chunks.map(async chunk => {
      try {
        const batchUrl = new URL('https://graph.facebook.com/v19.0/');
        batchUrl.searchParams.set('ids', chunk.join(','));
        batchUrl.searchParams.set('fields', 'id,creative{instagram_permalink_url}');
        batchUrl.searchParams.set('access_token', TOKEN);
        const batchRes = await Promise.race([fetch(batchUrl.toString()), timeout(5000)]);
        const batchData = await batchRes.json();
        Object.entries(batchData).forEach(([id, ad]) => {
          if (ad?.creative?.instagram_permalink_url) permalinkMap[id] = ad.creative.instagram_permalink_url;
        });
      } catch(e) { /* ignora timeout */ }
    }));
  }

  // 5. Normaliza diário
  const diario = (insightsData.data || []).map(r => {
    const inv = parseFloat(r.spend || 0);
    const imp = parseInt(r.impressions || 0);
    const clk = parseInt(r.inline_link_clicks || 0);
    return {
      data: r.date_start,
      investimento: inv,
      impressoes: imp,
      cliques: clk,
      lp_views: getAction(r.actions, 'landing_page_view'),
      checkouts: getAction(r.actions, 'initiate_checkout'),
      cpm: parseFloat(r.cpm || 0),
      ctr: imp > 0 ? (clk / imp) * 100 : 0,
      cpc: clk > 0 ? inv / clk : 0,
    };
  });

  // 6. Agrega por anúncio
  const adMap = {};
  (adInsightsData.data || []).forEach(r => {
    const name = r.ad_name;
    const id = r.ad_id;
    if (!name) return;
    if (!adMap[name]) {
      adMap[name] = {
        ad_name: name, ad_id: id,
        instagram_permalink: permalinkMap[id] || '',
        investimento: 0, impressoes: 0, cliques: 0, lp_views: 0, checkouts: 0,
      };
    }
    adMap[name].investimento += parseFloat(r.spend || 0);
    adMap[name].impressoes   += parseInt(r.impressions || 0);
    adMap[name].cliques      += parseInt(r.inline_link_clicks || 0);
    adMap[name].lp_views     += getAction(r.actions, 'landing_page_view');
    adMap[name].checkouts    += getAction(r.actions, 'initiate_checkout');
    if (!adMap[name].instagram_permalink && permalinkMap[id]) {
      adMap[name].instagram_permalink = permalinkMap[id];
    }
  });

  const por_anuncio = Object.values(adMap)
    .map(a => ({
      ...a,
      ctr: a.impressoes > 0 ? (a.cliques / a.impressoes) * 100 : 0,
    }))
    .sort((a, b) => b.investimento - a.investimento);

  return { conta: account, campanha: campaign.name, diario, por_anuncio };
}
