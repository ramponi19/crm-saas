// Cole no console da página Observability > Database do Supabase (ou rode pelo javascript_tool do navegador).
// A aba precisa estar visível e com altura: o gráfico só renderiza quando aparece na tela.
// O painel mostra "IOwait 0.22 %" (com espaço antes do %): por isso o "\s*" na regex (09/11/2026).
async () => {
  let card, svg;
  for (let t = 0; t < 45 && !svg; t++) {
    await new Promise(s => setTimeout(s, 1000));
    const h = [...document.querySelectorAll('h3')].find(e => e.textContent.trim().startsWith('CPU usage'));
    card = h; for (let i = 0; i < 8 && card && !card.querySelector('svg.recharts-surface'); i++) card = card.parentElement;
    svg = card?.querySelector('svg.recharts-surface');
  }
  const range = [...document.querySelectorAll('button')].map(x => x.innerText.trim()).filter(t => /Oct|days/.test(t))[0];
  if (!svg) return { range, erro: 'sem grafico' };
  const wrap = svg.closest('.recharts-wrapper') || svg.parentElement;
  const r = svg.getBoundingClientRect(); const pts = new Map();
  for (let k = 0; k <= 420; k++) {
    const x = r.left + r.width * (0.003 + 0.994 * k / 420), y = r.top + r.height / 2;
    wrap.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
    await new Promise(s => setTimeout(s, 12));
    const tip = card.querySelector('.recharts-tooltip-wrapper') || document.querySelector('.recharts-tooltip-wrapper');
    const t = tip ? tip.innerText.replace(/\n/g, ' ') : '';
    const m = t.match(/(\w{3} \d+), (\d\d:\d\d):\d\d\s*(am|pm).*?IOwait\s*([\d.<]+)\s*%.*?User\s*([\d.<]+)\s*%/);
    if (m) pts.set(m[1] + ' ' + m[2] + m[3], { io: parseFloat(m[4].replace('<', '')), user: parseFloat(m[5].replace('<', '')) });
  }
  const v = [...pts.values()].map(p => p.io); const u = [...pts.values()].map(p => p.user);
  const med = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const ord = [...v].sort((a, b) => a - b); const p50 = ord[Math.floor(ord.length / 2)];
  const top = [...pts.entries()].sort((a, b) => b[1].io - a[1].io).slice(0, 4).map(([k, p]) => `${k.split(' ').slice(2).join(' ')} ${p.io}%`);
  return { range, pontos: v.length, io_medio: +med(v).toFixed(2), io_mediana: p50, acima20: v.filter(x => x > 20).length, acima30: v.filter(x => x > 30).length, io_max: Math.max(...v), user_medio: +med(u).toFixed(2), maiores: top };
}
