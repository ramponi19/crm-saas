"use client";
import { useState, useMemo } from "react";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { FileText, Sparkles, RefreshCw, Copy, CheckCircle2 } from "lucide-react";

function fmtCurrency(v: number) {
  if (v >= 1000000) return `R$ ${(v/1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v/1000).toFixed(0)}k`;
  return `R$ ${v}`;
}

export default function RelatorioPage() {
  const { leads, stats, loaded, loadSample, storeName, segment } = useLeads();
  const loja = storeName || "sua empresa";
  const [report, setReport]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [copied, setCopied]     = useState(false);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week

  const weekLabel = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() + 1 - weekOffset * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const f = (d: Date) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
    return `${f(start)} – ${f(end)}`;
  }, [weekOffset]);

  async function generateReport() {
    if (!stats || !leads.length) return;
    setLoading(true); setError(""); setReport("");

    const top5 = leads
      .filter(l => l.classification === "hot" || l.urgency === "critical")
      .sort((a,b) => b.score - a.score)
      .slice(0,5)
      .map(l => `- ${l.contact} (score ${l.score}, ${l.daysInactive}d inativo): ${l.nextAction}`)
      .join("\n");

    const topObjections = stats.topObjections.slice(0,3).map(o => `${o.label} (${o.count}x)`).join(", ");
    const topModels     = stats.topModels.slice(0,3).map(m => `${m.model} (${m.count})`).join(", ");

    const prompt = `Você é um consultor comercial sênior. Gere um **relatório semanal executivo** para a equipe de vendas da ${loja} (segmento: ${segment.name}), sobre a semana ${weekLabel}. Contexto do negócio: ${segment.followupContext}

Tom: profissional mas direto, em português brasileiro. Use emojis moderadamente. Estruture com seções claras usando markdown (##, **negrito**, listas).

Dados da semana:
- Total de leads: ${stats.total}
- Clientes fechados: ${stats.customer}
- Taxa de conversão: ${stats.conversionRate}%
- Leads quentes (fechar agora): ${stats.hot}
- Leads mornos (nutrir): ${stats.warm}
- Estagnados (risco): ${stats.stalled}
- Perdidos: ${stats.lost}
- Score médio: ${stats.avgScore}/100
- Inatividade média: ${stats.avgDaysInactive} dias
- Pipeline estimado: ${fmtCurrency(stats.pipelineValue)}
- Taxa de ghost (sumiu): ${stats.ghostRate}%
- Indicações recebidas: ${stats.referralCount}
- Taxa de reativação: ${stats.reactivationRate}%
- Modelos mais pedidos: ${topModels}
- Principais objeções: ${topObjections}

Leads prioritários da semana:
${top5 || "Nenhum lead crítico identificado"}

Gere um relatório com estas seções:
1. **Resumo Executivo** (3-4 linhas: o que foi essa semana)
2. **Números que importam** (destaques positivos e negativos)
3. **Alertas** (o que precisa de atenção imediata)
4. **Top leads para focar** (mencione os 3 mais importantes)
5. **Ação da semana que vem** (3 prioridades concretas e acionáveis para a equipe)
6. **Palavra do consultor** (1 parágrafo motivacional mas honesto)`;

    try {
      const res = await fetch("/zapintel/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 1500,
          system: "Você é um consultor comercial especialista em vendas de celulares e produtos premium no Brasil. Seja direto, específico e acionável. Use markdown.",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReport(data.text?.trim() || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar. Verifique a chave da API.");
    }
    setLoading(false);
  }

  async function copyReport() {
    await navigator.clipboard.writeText(report);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  // Simple markdown renderer
  function renderMd(md: string) {
    const lines = md.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("## "))  return <h3 key={i} style={{fontSize:15,fontWeight:800,color:"var(--purple-l)",marginTop:20,marginBottom:8,letterSpacing:-.3}}>{line.slice(3)}</h3>;
      if (line.startsWith("### ")) return <h4 key={i} style={{fontSize:13,fontWeight:700,color:"var(--txt)",marginTop:14,marginBottom:6}}>{line.slice(4)}</h4>;
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const content = renderInline(line.slice(2));
        return <div key={i} style={{display:"flex",gap:8,marginBottom:4}}><span style={{color:"var(--purple)",marginTop:1}}>•</span><span style={{fontSize:13,color:"var(--dim)",lineHeight:1.7}}>{content}</span></div>;
      }
      if (line.match(/^\d+\. /)) {
        const content = renderInline(line.replace(/^\d+\. /,""));
        return <div key={i} style={{display:"flex",gap:8,marginBottom:4}}><span style={{color:"var(--purple-l)",fontWeight:700,fontSize:12,marginTop:2}}>{line.match(/^\d+/)![0]}.</span><span style={{fontSize:13,color:"var(--dim)",lineHeight:1.7}}>{content}</span></div>;
      }
      if (line.trim() === "") return <div key={i} style={{height:6}}/>;
      return <p key={i} style={{fontSize:13,color:"var(--dim)",lineHeight:1.8,marginBottom:2}}>{renderInline(line)}</p>;
    });
  }

  function renderInline(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} style={{color:"var(--txt)",fontWeight:700}}>{part.slice(2,-2)}</strong>;
      }
      return part;
    });
  }

  if (!loaded) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:16}}>
      <FileText size={40} color="var(--purple)"/>
      <h2 style={{fontSize:18,fontWeight:800}}>Relatório Semanal</h2>
      <p style={{color:"var(--dim)",fontSize:13}}>Importe leads para gerar o relatório.</p>
      <button onClick={loadSample} style={{background:"var(--purple)",color:"#fff",border:"none",borderRadius:10,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
        Carregar dados de exemplo
      </button>
    </div>
  );

  return (
    <div style={{maxWidth:780,margin:"0 auto"}}>
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:22,fontWeight:800,letterSpacing:-.5,marginBottom:4,display:"flex",alignItems:"center",gap:10}}>
          <FileText size={22} color="var(--purple)"/> Relatório Semanal com IA
        </h1>
        <p style={{fontSize:12,color:"var(--dim)"}}>Resumo executivo gerado pela IA com análise da operação e próximos passos</p>
      </div>

      {/* Controls */}
      <div className="card" style={{padding:18,marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:.7,marginBottom:4}}>SEMANA DE REFERÊNCIA</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <button onClick={() => setWeekOffset(o => o+1)} style={{background:"var(--card2)",border:"1px solid var(--brd2)",borderRadius:7,padding:"5px 10px",color:"var(--dim)",cursor:"pointer",fontSize:12}}>←</button>
              <span style={{fontSize:13,fontWeight:700,color:"var(--txt)",minWidth:130,textAlign:"center"}}>{weekLabel}</span>
              <button onClick={() => setWeekOffset(o => Math.max(0,o-1))} disabled={weekOffset===0} style={{background:"var(--card2)",border:"1px solid var(--brd2)",borderRadius:7,padding:"5px 10px",color:weekOffset===0?"var(--muted)":"var(--dim)",cursor:weekOffset===0?"not-allowed":"pointer",fontSize:12}}>→</button>
            </div>
          </div>

          <button onClick={generateReport} disabled={loading} style={{
            marginLeft:"auto",display:"flex",alignItems:"center",gap:7,
            background:loading?"var(--brd)":"linear-gradient(135deg,var(--purple),#4338ca)",
            border:"none",borderRadius:10,padding:"10px 20px",
            color:"#fff",fontSize:13,fontWeight:700,cursor:loading?"not-allowed":"pointer",
            transition:"opacity .15s",
          }}>
            {loading
              ? <><RefreshCw size={14} style={{animation:"spin 1s linear infinite"}}/> Gerando...</>
              : <><Sparkles size={14}/> {report ? "Regen​erar" : "Gerar Relatório"}</>
            }
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.3)",borderRadius:12,padding:"14px 18px",marginBottom:16,fontSize:13,color:"var(--red)"}}>
          ⚠ {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="card" style={{padding:28}}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{
              height: i===1?20:13, borderRadius:6, marginBottom:i===1?20:8,
              width: i===1?"60%":["100%","90%","95%","75%"][i%4],
              background:"linear-gradient(90deg,var(--card2) 0%,var(--brd) 50%,var(--card2) 100%)",
              backgroundSize:"200% 100%",
              animation:"shimmer 1.4s infinite",
            }}/>
          ))}
          <div style={{textAlign:"center",fontSize:12,color:"var(--muted)",marginTop:16}}>
            IA analisando {leads.length} leads da semana {weekLabel}...
          </div>
        </div>
      )}

      {/* Report */}
      {report && !loading && (
        <div className="card" style={{padding:28}}>
          {/* Header */}
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,paddingBottom:18,borderBottom:"1px solid var(--brd)"}}>
            <div>
              <div style={{fontSize:16,fontWeight:800,letterSpacing:-.3,marginBottom:4}}>📋 Relatório Semanal — {loja}</div>
              <div style={{fontSize:12,color:"var(--muted)"}}>Semana {weekLabel} · {segment.name} · Gerado por IA</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={copyReport} style={{
                display:"flex",alignItems:"center",gap:5,
                background:copied?"rgba(34,197,94,.15)":"var(--card2)",
                border:`1px solid ${copied?"rgba(34,197,94,.4)":"var(--brd2)"}`,
                borderRadius:8,color:copied?"var(--green)":"var(--muted)",
                fontSize:11,padding:"6px 12px",cursor:"pointer",
              }}>
                {copied?<><CheckCircle2 size={12}/> Copiado!</>:<><Copy size={12}/> Copiar</>}
              </button>
            </div>
          </div>

          {/* Rendered report */}
          <div>{renderMd(report)}</div>

          {/* Footer */}
          <div style={{marginTop:28,paddingTop:16,borderTop:"1px solid var(--brd)",display:"flex",alignItems:"center",gap:8}}>
            <Sparkles size={12} color="var(--purple)"/>
            <span style={{fontSize:11,color:"var(--muted)"}}>Gerado com Claude · ZapIntel — {loja}</span>
          </div>
        </div>
      )}

      {!report && !loading && !error && (
        <div className="card" style={{padding:40,textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:16}}>📊</div>
          <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>Pronto para gerar seu relatório</div>
          <div style={{fontSize:13,color:"var(--dim)",maxWidth:420,margin:"0 auto",lineHeight:1.7}}>
            Clique em <strong style={{color:"var(--purple-l)"}}>Gerar Relatório</strong> e a IA vai analisar toda a operação da semana e produzir um resumo executivo com próximas ações.
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
      `}</style>
    </div>
  );
}
