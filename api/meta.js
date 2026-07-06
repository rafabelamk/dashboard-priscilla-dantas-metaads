const TOKEN = process.env.META_TOKEN;
const AD_ACCOUNT = 'act_1519004369175892';

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

  try {
    // 1. Buscar campanha pelo nome
    const campaignUrl = new URL(`https://graph.facebook.com/v19.0/${AD_ACCOUNT}/campaigns`);
    campaignUrl.searchParams.set('fields', 'id,name,status');
    campaignUrl.searchParams.set('access_token', TOKEN);
    campaignUrl.searchParams.set('limit', '100');

    const campaignRes = await fetch(campaignUrl.toString());
    const campaignData = await campaignRes.json();

    if (campaignData.error) return res.status(400).json({ error: campaignData.error.message });

    const campaign = campaignData.data?.find(c => c.name === CAMPAIGNS[produto]);
    if (!campaign) {
      return res.status(404).json({
        error: `Campanha não encontrada: ${CAMPAIGNS[produto]}`,
        campanhas_disponiveis: campaignData.data?.map(c => c.name),
      });
    }

    // 2. Insights diários da campanha
    const insightsUrl = new URL(`https://graph.facebook.com/v19.0/${campaign.id}/insights`);
    insightsUrl.searchParams.set('fields', 'date_start,spend,impressions,clicks,actions,cpm,ctr,cpc');
    insightsUrl.searchParams.set('time_range', JSON.stringify({ since: sinceDate, until: untilDate }));
    insightsUrl.searchParams.set('time_increment', '1');
    insightsUrl.searchParams.set('access_token', TOKEN);
    insightsUrl.searchParams.set('limit', '100');

    const insightsRes = await fetch(insightsUrl.toString());
    const insightsData = await insightsRes.json();
    if (insightsData.error) return res.status(400).json({ error: insightsData.error.message });

    // 3. Insights por anúncio (level=ad) — inclui instagram_permalink via ad criativo
    const adInsightsUrl = new URL(`https://graph.facebook.com/v19.0/${campaign.id}/insights`);
    adInsightsUrl.searchParams.set('fields', 'ad_name,ad_id,spend,impressions,clicks,actions,cpm,ctr,cpc');
    adInsightsUrl.searchParams.set('time_range', JSON.stringify({ since: sinceDate, until: untilDate }));
    adInsightsUrl.searchParams.set('level', 'ad');
    adInsightsUrl.searchParams.set('access_token', TOKEN);
    adInsightsUrl.searchParams.set('limit', '200');

    const adInsightsRes = await fetch(adInsightsUrl.toString());
    const adInsightsData = await adInsightsRes.json();
    if (adInsightsData.error) return res.status(400).json({ error: adInsightsData.error.message });

    // 4. Buscar instagram_permalink dos anúncios
    const adIds = [...new Set((adInsightsData.data || []).map(a => a.ad_id).filter(Boolean))];
    const permalinkMap = {};

    if (adIds.length > 0) {
      // Busca em lotes de 50
      const chunks = [];
      for (let i = 0; i < adIds.length; i += 50) chunks.push(adIds.slice(i, i + 50));

      for (const chunk of chunks) {
        const batchUrl = new URL('https://graph.facebook.com/v19.0/');
        batchUrl.searchParams.set('ids', chunk.join(','));
        batchUrl.searchParams.set('fields', 'id,name,creative{instagram_permalink_url}');
        batchUrl.searchParams.set('access_token', TOKEN);
        try {
          const batchRes = await fetch(batchUrl.toString());
          const batchData = await batchRes.json();
          Object.entries(batchData).forEach(([id, ad]) => {
            if (ad?.creative?.instagram_permalink_url) {
              permalinkMap[id] = ad.creative.instagram_permalink_url;
            }
          });
        } catch (e) { /* ignora erros de permalink */ }
      }
    }

    // 5. Processar ação por tipo
    const getAction = (actions, key) => {
      if (!actions) return 0;
      const found = actions.find(a => a.action_type === key);
      return found ? parseFloat(found.value) : 0;
    };

    // 6. Normalizar diário
    const diario = (insightsData.data || []).map(r => ({
      data: r.date_start,
      investimento: parseFloat(r.spend || 0),
      impressoes: parseInt(r.impressions || 0),
      cliques: parseInt(r.clicks || 0),
      lp_views: getAction(r.actions, 'landing_page_view'),
      checkouts: getAction(r.actions, 'initiate_checkout'),
      cpm: parseFloat(r.cpm || 0),
      ctr: parseFloat(r.ctr || 0),
      cpc: parseFloat(r.cpc || 0),
    }));

    // 7. Agregar por nome do anúncio (mesmo anúncio pode rodar em múltiplos adsets)
    // Usa ad_name como chave — soma tráfego de todos os adsets do mesmo criativo
    const adMap = {};
    (adInsightsData.data || []).forEach(r => {
      const name = r.ad_name;
      const id = r.ad_id;
      if (!name) return;
      if (!adMap[name]) {
        adMap[name] = {
          ad_name: name,
          ad_id: id,
          instagram_permalink: permalinkMap[id] || '',
          investimento: 0, impressoes: 0, cliques: 0,
          lp_views: 0, checkouts: 0,
          ctr_imp: 0, ctr_clk: 0, // para calcular CTR ponderado por impressões
        };
      }
      const inv = parseFloat(r.spend || 0);
      const imp = parseInt(r.impressions || 0);
      const clk = parseInt(r.clicks || 0);
      adMap[name].investimento += inv;
      adMap[name].impressoes += imp;
      adMap[name].cliques += clk;
      adMap[name].lp_views += getAction(r.actions, 'landing_page_view');
      adMap[name].checkouts += getAction(r.actions, 'initiate_checkout');
      adMap[name].ctr_imp += imp;
      adMap[name].ctr_clk += clk;
      // Atualiza permalink se ainda não tiver
      if (!adMap[name].instagram_permalink && permalinkMap[id]) {
        adMap[name].instagram_permalink = permalinkMap[id];
      }
    });

    const por_anuncio = Object.values(adMap).map(a => ({
      ad_name: a.ad_name,
      ad_id: a.ad_id,
      instagram_permalink: a.instagram_permalink,
      investimento: a.investimento,
      impressoes: a.impressoes,
      cliques: a.cliques,
      lp_views: a.lp_views,
      checkouts: a.checkouts,
      // CTR calculado diretamente: cliques totais / impressões totais
      ctr: a.ctr_imp > 0 ? (a.ctr_clk / a.ctr_imp) * 100 : 0,
    })).sort((a, b) => b.investimento - a.investimento);

    return res.status(200).json({
      produto,
      campanha: campaign.name,
      campanha_id: campaign.id,
      periodo: { since: sinceDate, until: untilDate },
      diario,
      por_anuncio,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
