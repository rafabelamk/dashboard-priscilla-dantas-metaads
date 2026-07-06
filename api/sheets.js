const SHEET_ID = '1XN7oDDT48A39_CpeY1Lr8V-zcN4KmYO01YQNK0DC7gQ';

const GIDS = {
  KD26: '591361303',
  PPRR26: '1958580679',
};

const PRECOS = {
  KD26: 47,
  PPRR26: 297,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { produto, since, until } = req.query;

  if (!produto || !GIDS[produto]) {
    return res.status(400).json({ error: 'Parâmetro produto inválido. Use KD26 ou PPRR26.' });
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GIDS[produto]}`;

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error(`Erro ao buscar planilha: ${response.status}`);

    const text = await response.text();
    const rows = text.trim().split('\n').map(r => r.split(',').map(c => c.replace(/^"|"$/g, '').trim()));

    if (rows.length < 2) {
      return res.status(200).json({ produto, vendas: [], total_vendas: 0, faturamento: 0 });
    }

    const headers = rows[0].map(h => h.toLowerCase());
    const dataIdx = headers.findIndex(h => h.includes('data corrigida') || h.includes('data'));
    const contentIdx = headers.findIndex(h => h === 'content');
    const mediumIdx = headers.findIndex(h => h === 'medium');

    // Filtro de datas
    const today = new Date();
    const defaultUntil = today.toISOString().split('T')[0];
    const defaultSince = new Date(today - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const sinceDate = since || defaultSince;
    const untilDate = until || defaultUntil;

    const vendas = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      const dataRaw = dataIdx >= 0 ? row[dataIdx] : '';
      if (!dataRaw) continue;

      // Normalizar data para YYYY-MM-DD
      let dataVenda = '';
      if (dataRaw.match(/^\d{4}-\d{2}-\d{2}/)) {
        dataVenda = dataRaw.substring(0, 10);
      } else if (dataRaw.match(/^\d{2}\/\d{2}\/\d{4}/)) {
        const [d, m, y] = dataRaw.split('/');
        dataVenda = `${y}-${m}-${d}`;
      } else {
        continue;
      }

      if (dataVenda < sinceDate || dataVenda > untilDate) continue;

      const content = contentIdx >= 0 ? row[contentIdx] : '';
      const medium = mediumIdx >= 0 ? row[mediumIdx] : '';

      vendas.push({
        data: dataVenda,
        content: content || null,
        medium: medium || null,
      });
    }

    // Agregar por anúncio (utm_content)
    const porAnuncio = {};
    vendas.forEach(v => {
      const key = v.content || '(sem utm_content)';
      if (!porAnuncio[key]) porAnuncio[key] = { ad_name: key, vendas: 0, faturamento: 0 };
      porAnuncio[key].vendas += 1;
      porAnuncio[key].faturamento += PRECOS[produto];
    });

    // Agregar por página (PPRR26 — utm_medium)
    const porPagina = {};
    if (produto === 'PPRR26') {
      vendas.forEach(v => {
        let pagina = 'Sem página';
        if (v.medium && v.medium.includes('PAG V0-2')) pagina = 'PAG V0-2 (longa)';
        else if (v.medium && v.medium.includes('PAG V0')) pagina = 'PAG V0 (curta)';

        if (!porPagina[pagina]) porPagina[pagina] = { pagina, vendas: 0, faturamento: 0 };
        porPagina[pagina].vendas += 1;
        porPagina[pagina].faturamento += PRECOS[produto];
      });
    }

    // Agregar por dia
    const porDia = {};
    vendas.forEach(v => {
      if (!porDia[v.data]) porDia[v.data] = { data: v.data, vendas: 0, faturamento: 0 };
      porDia[v.data].vendas += 1;
      porDia[v.data].faturamento += PRECOS[produto];
    });

    return res.status(200).json({
      produto,
      periodo: { since: sinceDate, until: untilDate },
      total_vendas: vendas.length,
      faturamento: vendas.length * PRECOS[produto],
      por_dia: Object.values(porDia).sort((a, b) => a.data.localeCompare(b.data)),
      por_anuncio: Object.values(porAnuncio).sort((a, b) => b.vendas - a.vendas),
      por_pagina: produto === 'PPRR26' ? Object.values(porPagina) : undefined,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
