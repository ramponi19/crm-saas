// Memória, swap, commitment e CPU (com IOwait) da última hora, minuto a minuto (10/11/2026).
// Rodar pelo javascript_tool do navegador do app na aba Observability > Database do Supabase,
// com a aba visível a 1280x1400 (mesma regra do iowait-recente.js: o gráfico só desenha quando aparece).
// Devolve uma linha por ponto: "HH:MM | cpu total% iowait% user% system% | ram usada MB, cache MB, swap MB | commit GB".
async () => {
  const ler = async (titulo, pontos) => {
    let card, svg;
    for (let t = 0; t < 20 && !svg; t++) {
      const h = [...document.querySelectorAll('h3')].find(e => e.textContent.trim().startsWith(titulo));
      if (h) h.scrollIntoView({ block: 'center' });
      await new Promise(s => setTimeout(s, 800));
      card = h; for (let i = 0; i < 8 && card && !card.querySelector('svg.recharts-surface'); i++) card = card.parentElement;
      svg = card?.querySelector('svg.recharts-surface');
    }
    if (!svg) return new Map();
    const wrap = svg.closest('.recharts-wrapper') || svg.parentElement;
    const r = svg.getBoundingClientRect(); const res = new Map();
    for (let k = 0; k <= pontos; k++) {
      const x = r.left + r.width * (0.005 + 0.99 * k / pontos), y = r.top + r.height / 2;
      wrap.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
      await new Promise(s => setTimeout(s, 70));
      const tip = card.querySelector('.recharts-tooltip-wrapper');
      const t = tip ? tip.innerText.replace(/\n/g, ' ') : '';
      const m = t.match(/(\d\d):(\d\d):\d\d\s*(am|pm)/);
      if (!m) continue;
      let hh = Number(m[1]) % 12; if (m[3] === 'pm') hh += 12;
      res.set(`${String(hh).padStart(2, '0')}:${m[2]}`, t);
    }
    return res;
  };
  const n = (t, re) => { const m = t?.match(re); return m ? m[1] : '?'; };
  const cpu = await ler('CPU usage', 90), mem = await ler('Memory usage', 90), com = await ler('Memory commitment', 90);
  const horas = [...new Set([...cpu.keys(), ...mem.keys()])].sort();
  return horas.map(h => {
    const c = cpu.get(h), m = mem.get(h), k = com.get(h);
    return `${h} | cpu ${n(c, /Total\s*([\d.]+)%/)} iowait ${n(c, /IOwait\s*([\d.<]+)\s*%/)} user ${n(c, /User\s*([\d.<]+)\s*%/)} sys ${n(c, /System\s*([\d.<]+)\s*%/)}`
      + ` | ram ${n(m, /Total RAM\s*([\d.]+)/)} usada ${n(m, /Used\s*([\d.]+)/)} cache ${n(m, /Buffers\s*([\d.]+)/)} swap ${n(m, /Swap\s*([\d.]+)/)}`
      + ` | commit ${n(k, /Committed\s*([\d.]+)/)}`;
  }).join('\n');
}
