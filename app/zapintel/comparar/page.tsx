"use client";
import { useState, useMemo } from "react";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { comparePeriods, type PeriodComparison, type PeriodStats } from "@/lib/zapintel/insights/stats";
import { TrendingUp, TrendingDown, Minus, BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const TT = { contentStyle: { background:"var(--card)", border:"1px solid var(--brd)", borderRadius:8, color:"var(--txt)", fontSize:12 } };

function fmtCurrency(v: number) {
  if (v >= 1000000) return `R$ ${(v/1000000).toFixed(1)}M`;
  if (v >= 1000)    return `R$ ${(v/1000).toFixed(0)}k`;
  return `R$ ${v}`;
}

const METRICS: { key: keyof PeriodStats; label: string; fmt: (v:number)=>string; higherBetter: boolean }[] = [
  { key:"total",          label:"Total de Leads",    fmt: v=>`${v}`,               higherBetter:true  },
  { key:"customers",      label:"Clientes",           fmt: v=>`${v}`,               higherBetter:true  },
  { key:"hot",            label:"Leads Quentes",      fmt: v=>`${v}`,               higherBetter:true  },
  { key:"conversionRate", label:"Taxa de Conversão",  fmt: v=>`${v}%`,              higherBetter:true  },
  { key:"avgScore",       label:"Score Médio",        fmt: v=>`${v}/100`,           higherBetter:true  },
  { key:"pipelineValue",  label:"Pipeline Estimado",  fmt: v=>fmtCurrency(v),       higherBetter:true  },
  { key:"avgDaysInactive",label:"Inatividade Média",  fmt: v=>`${v}d`,              higherBetter:false },
];

type Preset = "7d" | "15d" | "30d" | "custom";

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate()+n); return r;
}
function toIso(d: Date) { return d.toISOString().split("T")[0]; }

export default function ComparePage() {
  const { leads, loaded, agregados } = useLeads();
  const [preset, setPreset] = useState<Preset>("30d");

  const today = useMemo(() => new Date(), []);

  const ranges = useMemo(() => {
    const days = preset==="7d"?7:preset==="15d"?15:30;
    const curEnd   = today;
    const curStart = addDays(today, -days+1);
    const prevEnd  = addDays(curStart, -1);
    const prevStart= addDays(prevEnd, -days+1);
    return { curStart, curEnd, prevStart, prevEnd, days };
  }, [preset, today]);

  const [customCurStart,  setCustomCurStart]  = useState(toIso(addDays(today,-29)));
  const [customCurEnd,    setCustomCurEnd]    = useState(toIso(today));
  const [customPrevStart, setCustomPrevStart] = useState(toIso(addDays(today,-59)));
  const [customPrevEnd,   setCustomPrevEnd]   = useState(toIso(addDays(today,-30)));

  const comparison = useMemo((): PeriodComparison | null => {
    if (!loaded || !leads.length) return null;
    let cs, ce, ps, pe;
    if (preset === "custom") {
      cs = new Date(customCurStart); ce = new Date(customCurEnd);
      ps = new Date(customPrevStart); pe = new Date(customPrevEnd);
    } else {
      cs = ranges.curStart; ce = ranges.curEnd; ps = ranges.prevStart; pe = ranges.prevEnd;
    }
    // O pipeline do periodo usa o MESMO ticket medido do painel. Era 5200
    // escrito a mao aqui tambem; sem venda registrada agora da zero.
    return comparePeriods(leads, cs, ce, ps, pe,
      agregados?.stats.ticketMedido ?? 0,
      (agregados?.stats.taxaFechamentoHot ?? 0) / 100,
      (agregados?.stats.taxaFechamentoWarm ?? 0) / 100);
  }, [leads, loaded, preset, ranges, customCurStart, customCurEnd, customPrevStart, customPrevEnd, agregados]);

  if (!loaded) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:16}}>
      <BarChart2 size={40} color="var(--purple)"/>
      <h2 style={{fontSize:18,fontWeight:800}}>Comparação de Períodos</h2>
      <p style={{color:"var(--dim)",fontSize:13}}>Importe leads para comparar períodos.</p>
    </div>
  );

  const periodLabel = (s: Date, e: Date) => {
    const f = (d: Date) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
    return `${f(s)} → ${f(e)}`;
  };

  const curLabel  = preset==="custom" ? `${customCurStart} → ${customCurEnd}`  : periodLabel(ranges.curStart, ranges.curEnd);
  const prevLabel = preset==="custom" ? `${customPrevStart} → ${customPrevEnd}` : periodLabel(ranges.prevStart, ranges.prevEnd);

  return (
    <div style={{maxWidth:1040,margin:"0 auto"}}>
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:22,fontWeight:800,letterSpacing:-.5,marginBottom:4,display:"flex",alignItems:"center",gap:10}}>
          <BarChart2 size={22} color="var(--purple)"/> Comparação de Períodos
        </h1>
        <p style={{fontSize:12,color:"var(--dim)"}}>Veja se a operação evoluiu comparando dois períodos lado a lado</p>
      </div>

      {/* Period selector */}
      <div className="card" style={{padding:18,marginBottom:20}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:"var(--muted)",fontWeight:700,marginRight:4}}>PERÍODO:</span>
          {([["7d","7 dias"],["15d","15 dias"],["30d","30 dias"],["custom","Personalizado"]] as [Preset,string][]).map(([k,l]) => (
            <button key={k} onClick={() => setPreset(k)} style={{
              padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:preset===k?700:400,
              background:preset===k?"var(--purple)":"var(--card2)",
              border:`1px solid ${preset===k?"var(--purple)":"var(--brd2)"}`,
              color:preset===k?"#fff":"var(--dim)",cursor:"pointer",
            }}>{l}</button>
          ))}
        </div>

        {preset === "custom" && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:14}}>
            <div>
              <div style={{fontSize:10,color:"var(--purple-l)",fontWeight:700,letterSpacing:.7,marginBottom:6}}>PERÍODO ATUAL</div>
              <div style={{display:"flex",gap:8}}>
                <input type="date" value={customCurStart} onChange={e=>setCustomCurStart(e.target.value)}
                  style={{flex:1,background:"var(--card2)",border:"1px solid var(--brd2)",borderRadius:7,padding:"6px 10px",fontSize:12,color:"var(--txt)"}}/>
                <input type="date" value={customCurEnd} onChange={e=>setCustomCurEnd(e.target.value)}
                  style={{flex:1,background:"var(--card2)",border:"1px solid var(--brd2)",borderRadius:7,padding:"6px 10px",fontSize:12,color:"var(--txt)"}}/>
              </div>
            </div>
            <div>
              <div style={{fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:.7,marginBottom:6}}>PERÍODO ANTERIOR</div>
              <div style={{display:"flex",gap:8}}>
                <input type="date" value={customPrevStart} onChange={e=>setCustomPrevStart(e.target.value)}
                  style={{flex:1,background:"var(--card2)",border:"1px solid var(--brd2)",borderRadius:7,padding:"6px 10px",fontSize:12,color:"var(--txt)"}}/>
                <input type="date" value={customPrevEnd} onChange={e=>setCustomPrevEnd(e.target.value)}
                  style={{flex:1,background:"var(--card2)",border:"1px solid var(--brd2)",borderRadius:7,padding:"6px 10px",fontSize:12,color:"var(--txt)"}}/>
              </div>
            </div>
          </div>
        )}

        {preset !== "custom" && comparison && (
          <div style={{display:"flex",gap:20,marginTop:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:12,height:12,borderRadius:3,background:"var(--purple)"}}/>
              <span style={{fontSize:12,color:"var(--dim)"}}>Atual: <strong style={{color:"var(--txt)"}}>{curLabel}</strong></span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:12,height:12,borderRadius:3,background:"var(--brd2)"}}/>
              <span style={{fontSize:12,color:"var(--dim)"}}>Anterior: <strong style={{color:"var(--txt)"}}>{prevLabel}</strong></span>
            </div>
          </div>
        )}
      </div>

      {comparison && (
        <>
          {/* Metric delta cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
            {METRICS.map(m => {
              const delta  = comparison.deltas[m.key];
              const curVal = comparison.current[m.key] as number;
              const prevVal= comparison.previous[m.key] as number;
              const up     = m.higherBetter ? delta > 0 : delta > 0;
              const neutral= delta === 0;
              const color  = neutral ? "var(--muted)" : up ? "var(--green)" : "var(--red)";
              const pct    = prevVal > 0 ? Math.round((Math.abs(delta)/prevVal)*100) : 0;
              return (
                <div key={m.key} className="card" style={{padding:"14px 16px"}}>
                  <div style={{fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:.6,marginBottom:8}}>{m.label.toUpperCase()}</div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBottom:6}}>
                    <span style={{fontSize:22,fontWeight:800,color:"var(--txt)",letterSpacing:-1}}>{m.fmt(curVal)}</span>
                    {!neutral && (
                      <span style={{fontSize:11,fontWeight:700,color,marginBottom:3,display:"flex",alignItems:"center",gap:2}}>
                        {up?<TrendingUp size={11}/>:<TrendingDown size={11}/>}
                        {pct}%
                      </span>
                    )}
                    {neutral && <Minus size={11} color="var(--muted)" style={{marginBottom:4}}/>}
                  </div>
                  <div style={{fontSize:10,color:"var(--muted)"}}>
                    Anterior: <strong style={{color:"var(--dim)"}}>{m.fmt(prevVal)}</strong>
                  </div>
                  <div style={{height:3,background:"var(--brd)",borderRadius:2,marginTop:8}}>
                    <div style={{
                      width:`${Math.min(100, prevVal>0?(curVal/Math.max(curVal,prevVal))*100:0)}%`,
                      height:"100%",background:color,borderRadius:2,transition:"width .5s",
                    }}/>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Overall verdict */}
          {(() => {
            const improvements = Object.values(comparison.deltas).filter(d => d > 0).length;
            const total = Object.values(comparison.deltas).length;
            const score = Math.round((improvements / total) * 100);
            const good  = score >= 60;
            return (
              <div className="card" style={{
                padding:"16px 22px", marginBottom:20,
                background: good ? "rgba(34,197,94,.06)" : "rgba(239,68,68,.06)",
                border:`1px solid ${good?"rgba(34,197,94,.25)":"rgba(239,68,68,.25)"}`,
                display:"flex",alignItems:"center",gap:16,
              }}>
                <span style={{fontSize:32}}>{score>=80?"🚀":score>=60?"📈":score>=40?"➡️":"📉"}</span>
                <div>
                  <div style={{fontSize:14,fontWeight:800,color:good?"var(--green)":"var(--red)",marginBottom:4}}>
                    {score>=80?"Período excelente":score>=60?"Período positivo":score>=40?"Período estável":"Período abaixo do anterior"}
                  </div>
                  <div style={{fontSize:12,color:"var(--dim)"}}>
                    {improvements} de {total} métricas melhoraram em relação ao período anterior
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Bar chart comparison */}
          <div className="card" style={{padding:20,marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:16}}>📊 Comparativo Visual — Leads</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={[
                {name:"Leads", Atual:comparison.current.total, Anterior:comparison.previous.total},
                {name:"Clientes", Atual:comparison.current.customers, Anterior:comparison.previous.customers},
                {name:"Quentes", Atual:comparison.current.hot, Anterior:comparison.previous.hot},
                {name:"Score Médio", Atual:comparison.current.avgScore, Anterior:comparison.previous.avgScore},
              ]} barGap={4} barCategoryGap="30%">
                <CartesianGrid stroke="var(--brd)" strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="name" tick={{fill:"var(--dim)",fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"var(--muted)",fontSize:10}} axisLine={false} tickLine={false}/>
                <Tooltip {...TT}/>
                <Legend wrapperStyle={{fontSize:11,color:"var(--dim)"}}/>
                <Bar dataKey="Atual" fill="var(--purple)" radius={[4,4,0,0]} barSize={20}/>
                <Bar dataKey="Anterior" fill="var(--brd2)" radius={[4,4,0,0]} barSize={20}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* No data warning */}
          {comparison.current.total === 0 && comparison.previous.total === 0 && (
            <div className="card" style={{padding:32,textAlign:"center",color:"var(--muted)"}}>
              <div style={{fontSize:32,marginBottom:12}}>🗂️</div>
              <div style={{fontSize:13}}>
                Nenhum lead encontrado nos dois períodos.<br/>
                Os leads precisam ter <code>firstDate</code> preenchido no CSV para aparecer aqui.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
