// Cole no console da página Observability > Database do Supabase (ou rode pelo javascript_tool do navegador).
// A aba precisa estar visível e com altura: o gráfico só renderiza quando aparece na tela.
// O painel mostra "IOwait 0.22 %" (com espaço antes do %): por isso o "\s*" na regex (09/11/2026).
async () => {
  let card, svg;
  for (let t = 0; t < 40 && !svg; t++) {
    await new Promise(s => setTimeout(s, 1000));
    const h = [...document.querySelectorAll('h3')].find(e => e.textContent.trim().startsWith('CPU usage'));
    card = h; for (let i = 0; i < 8 && card && !card.querySelector('svg.recharts-surface'); i++) card = card.parentElement;
    svg = card?.querySelector('svg.recharts-surface');
  }
  if (!svg) return 'sem grafico';
  const wrap = svg.closest('.recharts-wrapper') || svg.parentElement;
  const r = svg.getBoundingClientRect(); const res = [];
  for (let k = 0; k <= 30; k++) {
    const x = r.left + r.width * (0.03 + 0.96 * k / 30), y = r.top + r.height / 2;
    wrap.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
    await new Promise(s => setTimeout(s, 80));
    const tip = card.querySelector('.recharts-tooltip-wrapper') || document.querySelector('.recharts-tooltip-wrapper');
    const t = tip ? tip.innerText.replace(/\n/g, ' ') : '';
    const m = t.match(/(\d\d:\d\d):\d\d\s*(am|pm).*?IOwait\s*([\d.<]+)\s*%/);
    const s = m ? `${m[1]} ${m[3]}` : '';
    if (s && res[res.length - 1] !== s) res.push(s);
  }
  return res.join(' | ');
}
