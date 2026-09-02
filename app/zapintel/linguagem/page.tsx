"use client";
import { useMemo, useState } from "react";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { MessageSquare, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const TT = { contentStyle:{ background:"var(--card)", border:"1px solid var(--brd)", borderRadius:8, color:"var(--txt)", fontSize:12 } };

// Words/phrases that correlate with success
const POWER_WORDS = [
  "olha","perfeito","excelente","ótimo","bacana","certinho","show","manda","mandei","foto",
  "garantia","segurança","confiança","parcela","entrada","facilita","exclusivo","especial",
  "só pra você","reservei","último","chegou agora","zero km","aprovado",
];
// Words that correlate with loss
const WEAK_WORDS = [
  "não sei","qualquer coisa","qualquer dúvida","quando quiser","sem pressão","à vontade",
  "pode ser","talvez","se quiser","não tem problema","tudo bem se não","não precisa",
];
// Palavras que o vendedor deve evitar
const AVOID_WORDS = [
  "entendido","compreendido","certo","ok","okay","tá","né",
];

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\sàáâãäéêëíïóôõöúüçñ]/g,"").split(/\s+/).filter(Boolean);
}

function countPhrase(texts: string[], phrase: string): number {
  return texts.filter(t => t.toLowerCase().includes(phrase)).length;
}

interface WordStat { word: string; winCount: number; lossCount: number; totalCount: number; winRate: number }

export default function LinguagemPage() {
  const { leads, loaded, loadSample, sellerName } = useLeads();
  const vend = sellerName.toLowerCase();
  const [tab, setTab] = useState<"words"|"phrases"|"patterns">("words");

  const analysis = useMemo(() => {
    if (!leads.length) return null;

    const winLeads  = leads.filter(l => l.classification === "customer" || l.classification === "hot");
    const lossLeads = leads.filter(l => l.classification === "lost" || l.classification === "stalled");

    // Somente mensagens da loja (linguagem do vendedor)
    const winMsgs  = winLeads.flatMap(l => l.messages.filter(m => m.isStore).map(m => m.body || ""));
    const lossMsgs = lossLeads.flatMap(l => l.messages.filter(m => m.isStore).map(m => m.body || ""));
    const allStoreMsgs = leads.flatMap(l => l.messages.filter(m => m.isStore).map(m => m.body || ""));

    // Word frequency per category
    const winTokens  = winMsgs.flatMap(tokenize);
    const lossTokens = lossMsgs.flatMap(tokenize);

    // Build word stats for power/weak words
    const powerStats: WordStat[] = POWER_WORDS.map(w => {
      const wc = winTokens.filter(t => t.includes(w)).length;
      const lc = lossTokens.filter(t => t.includes(w)).length;
      const total = wc + lc;
      return { word:w, winCount:wc, lossCount:lc, totalCount:total, winRate:total>0?Math.round((wc/total)*100):0 };
    }).filter(s => s.totalCount > 0).sort((a,b) => b.winRate - a.winRate).slice(0,12);

    const weakStats: WordStat[] = WEAK_WORDS.map(w => {
      const wc = winTokens.filter(t => t.includes(w)).length;
      const lc = lossTokens.filter(t => t.includes(w)).length;
      const total = wc + lc;
      return { word:w, winCount:wc, lossCount:lc, totalCount:total, winRate:total>0?Math.round((wc/total)*100):0 };
    }).filter(s => s.totalCount > 0).sort((a,b) => a.winRate - b.winRate).slice(0,8);

    // Avoid words usage
    const avoidUsage = AVOID_WORDS.map(w => ({
      word:w,
      count: allStoreMsgs.filter(m => m.toLowerCase().includes(w)).length,
    })).filter(s => s.count > 0).sort((a,b) => b.count - a.count);

    // Patterns: questions, emojis, response length
    const avgWinMsgLen  = winMsgs.length  > 0 ? Math.round(winMsgs.reduce((s,m) => s+m.length,0) / winMsgs.length) : 0;
    const avgLossMsgLen = lossMsgs.length > 0 ? Math.round(lossMsgs.reduce((s,m) => s+m.length,0) / lossMsgs.length) : 0;

    const emojiRx = /[\u{1F300}-\u{1FFFF}]/u;
    const winWithEmoji  = winMsgs.filter(m => emojiRx.test(m)).length;
    const lossWithEmoji = lossMsgs.filter(m => emojiRx.test(m)).length;
    const winEmojiPct  = winMsgs.length  > 0 ? Math.round((winWithEmoji/winMsgs.length)*100) : 0;
    const lossEmojiPct = lossMsgs.length > 0 ? Math.round((lossWithEmoji/lossMsgs.length)*100) : 0;

    const winWithQ  = winMsgs.filter(m => m.includes("?")).length;
    const lossWithQ = lossMsgs.filter(m => m.includes("?")).length;
    const winQPct  = winMsgs.length  > 0 ? Math.round((winWithQ/winMsgs.length)*100) : 0;
    const lossQPct = lossMsgs.length > 0 ? Math.round((lossWithQ/lossMsgs.length)*100) : 0;

    // Top phrases in winning conversations
    const TOP_PHRASES = [
      "garantia de","aceita como entrada","parcela em","só restou","reservar pra você",
      "mandei a foto","chegou agora","posso ver","vou verificar","tô te mandando",
      "aqui na jm","melhor custo","você confia","já atendi","cliente meu",
    ];
    const phraseStats = TOP_PHRASES.map(p => ({
      phrase: p,
      winCount: countPhrase(winMsgs, p),
      lossCount: countPhrase(lossMsgs, p),
    })).filter(s => s.winCount + s.lossCount > 0)
      .sort((a,b) => (b.winCount - b.lossCount) - (a.winCount - a.lossCount))
      .slice(0,10);

    return {
      winLeads: winLeads.length, lossLeads: lossLeads.length,
      winMsgs: winMsgs.length,  lossMsgs: lossMsgs.length,
      powerStats, weakStats, avoidUsage,
      avgWinMsgLen, avgLossMsgLen, winEmojiPct, lossEmojiPct, winQPct, lossQPct,
      phraseStats,
    };
  }, [leads]);

  if (!loaded) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:16}}>
      <MessageSquare size={40} color="var(--purple)"/>
      <h2 style={{fontSize:18,fontWeight:800}}>Análise de Linguagem</h2>
      <p style={{color:"var(--dim)",fontSize:13}}>Importe leads para analisar o padrão de linguagem.</p>
      <button onClick={loadSample} style={{background:"var(--purple)",color:"#fff",border:"none",borderRadius:10,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
        Carregar dados de exemplo
      </button>
    </div>
  );

  if (!analysis) return null;

  return (
    <div style={{maxWidth:1040,margin:"0 auto"}}>
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:22,fontWeight:800,letterSpacing:-.5,marginBottom:4,display:"flex",alignItems:"center",gap:10}}>
          <MessageSquare size={22} color="var(--purple)"/> Análise de Linguagem
        </h1>
        <p style={{fontSize:12,color:"var(--dim)"}}>
          Palavras e padrões do {vend} em conversas que <strong style={{color:"var(--green)"}}>fecharam</strong> vs. que <strong style={{color:"var(--red)"}}>perderam</strong>
        </p>
      </div>

      {/* Context */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
        {[
          {l:"Conversas Ganhas",   v:analysis.winLeads,   c:"var(--green)",  e:"✅"},
          {l:"Conversas Perdidas", v:analysis.lossLeads,  c:"var(--red)",    e:"❌"},
          {l:`Msgs do ${sellerName} (ganhas)`, v:analysis.winMsgs,  c:"var(--blue)",   e:"💬"},
          {l:`Msgs do ${sellerName} (perdidas)`,v:analysis.lossMsgs, c:"var(--muted)", e:"💬"},
        ].map(({l,v,c,e}) => (
          <div key={l} className="card" style={{padding:"12px 16px"}}>
            <div style={{fontSize:18,marginBottom:6}}>{e}</div>
            <div style={{fontSize:22,fontWeight:800,color:c,letterSpacing:-1}}>{v}</div>
            <div style={{fontSize:10,color:"var(--muted)"}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {([["words","🔤 Palavras"],["phrases","💬 Frases"],["patterns","📊 Padrões"]] as const).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding:"8px 16px",borderRadius:9,fontSize:12,fontWeight:tab===k?700:400,
            background:tab===k?"var(--purple)":"var(--card2)",
            border:`1px solid ${tab===k?"var(--purple)":"var(--brd2)"}`,
            color:tab===k?"#fff":"var(--dim)",cursor:"pointer",
          }}>{l}</button>
        ))}
      </div>

      {/* Words tab */}
      {tab === "words" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {/* Power words */}
          <div className="card" style={{padding:20}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:16}}>
              <TrendingUp size={14} color="var(--green)"/>
              <span style={{fontSize:13,fontWeight:700}}>Palavras que ajudam a fechar</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {analysis.powerStats.slice(0,10).map(s => (
                <div key={s.word}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,alignItems:"center"}}>
                    <span style={{fontSize:12,color:"var(--txt)",fontWeight:600}}>{s.word}</span>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:10,color:"var(--green)"}}>✅ {s.winCount}</span>
                      <span style={{fontSize:10,color:"var(--red)"}}>❌ {s.lossCount}</span>
                      <span style={{fontSize:11,fontWeight:800,color:"var(--green)",minWidth:36,textAlign:"right"}}>{s.winRate}%</span>
                    </div>
                  </div>
                  <div style={{height:4,background:"var(--brd)",borderRadius:2}}>
                    <div style={{width:`${s.winRate}%`,height:"100%",background:"var(--green)",borderRadius:2,transition:"width .5s"}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Weak words + avoid */}
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="card" style={{padding:20}}>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:16}}>
                <TrendingDown size={14} color="var(--yellow)"/>
                <span style={{fontSize:13,fontWeight:700}}>Palavras que enfraquecem</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {analysis.weakStats.map(s => (
                  <div key={s.word} style={{
                    background:"rgba(234,179,8,.08)",border:"1px solid rgba(234,179,8,.3)",
                    borderRadius:20,padding:"4px 12px",
                    display:"flex",alignItems:"center",gap:6,
                  }}>
                    <span style={{fontSize:12,color:"var(--yellow)"}}>⚠ {s.word}</span>
                    <span style={{fontSize:10,color:"var(--muted)"}}>{s.totalCount}x</span>
                  </div>
                ))}
              </div>
              <div style={{fontSize:11,color:"var(--muted)",marginTop:12,lineHeight:1.6}}>
                Palavras passivas e sem urgência aparecem mais nas conversas perdidas.
              </div>
            </div>

            {analysis.avoidUsage.length > 0 && (
              <div className="card" style={{padding:20,border:"1px solid rgba(239,68,68,.25)"}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:14}}>
                  <AlertTriangle size={14} color="var(--red)"/>
                  <span style={{fontSize:13,fontWeight:700}}>Palavras para evitar</span>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                  {analysis.avoidUsage.map(s => (
                    <div key={s.word} style={{
                      background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.25)",
                      borderRadius:20,padding:"4px 12px",
                      display:"flex",alignItems:"center",gap:6,
                    }}>
                      <span style={{fontSize:12,color:"var(--red)"}}>✕ {s.word}</span>
                      <span style={{fontSize:10,color:"var(--muted)"}}>{s.count}x</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:12,lineHeight:1.6}}>
                  Respostas robóticas quebram o vínculo humano. Prefira linguagem natural.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Phrases tab */}
      {tab === "phrases" && (
        <div className="card" style={{padding:22}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:16}}>Frases com maior correlação com fechamento</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {analysis.phraseStats.map(s => {
              const total = s.winCount + s.lossCount;
              const winPct = total > 0 ? Math.round((s.winCount/total)*100) : 0;
              return (
                <div key={s.phrase}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:600,color:"var(--txt)"}}>“{s.phrase}...”</span>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <span style={{fontSize:11,color:"var(--green)"}}>✅ {s.winCount}</span>
                      <span style={{fontSize:11,color:"var(--red)"}}>❌ {s.lossCount}</span>
                      <span style={{fontSize:12,fontWeight:800,color:winPct>=60?"var(--green)":winPct>=40?"var(--yellow)":"var(--red)",minWidth:38,textAlign:"right"}}>{winPct}%</span>
                    </div>
                  </div>
                  <div style={{height:5,background:"var(--brd)",borderRadius:3,overflow:"hidden"}}>
                    <div style={{display:"flex",height:"100%"}}>
                      <div style={{width:`${winPct}%`,background:"var(--green)",transition:"width .5s"}}/>
                      <div style={{flex:1,background:"var(--brd2)"}}/>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Patterns tab */}
      {tab === "patterns" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div className="card" style={{padding:20}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:16}}>📏 Tamanho médio das mensagens do {vend}</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={[
                {name:"Conversas ganhas", chars:analysis.avgWinMsgLen},
                {name:"Conversas perdidas",chars:analysis.avgLossMsgLen},
              ]} barSize={40}>
                <XAxis dataKey="name" tick={{fill:"var(--dim)",fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"var(--muted)",fontSize:9}} axisLine={false} tickLine={false}/>
                <Tooltip {...TT} formatter={(v:any) => [`${v} caracteres`,"Média"]}/>
                <Bar dataKey="chars" fill="var(--purple)" radius={[4,4,0,0]}>
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{fontSize:11,color:"var(--muted)",marginTop:8,lineHeight:1.6}}>
              {analysis.avgWinMsgLen > analysis.avgLossMsgLen
                ? `✅ O ${vend} escreve mais nas conversas que fecham — detalhe e atenção fazem diferença.`
                : `⚠ O ${vend} escreve mais nas conversas perdidas — pode indicar excesso de explicação.`}
            </div>
          </div>

          <div className="card" style={{padding:20}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:16}}>😊 Emojis & Perguntas</div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {[
                {label:"Mensagens com emoji", win:analysis.winEmojiPct, loss:analysis.lossEmojiPct, tip:"Emojis humanizam a conversa"},
                {label:"Mensagens com pergunta (?)", win:analysis.winQPct, loss:analysis.lossQPct, tip:"Perguntas mantêm o diálogo ativo"},
              ].map(({label,win,loss,tip}) => {
                const good = win >= loss;
                return (
                  <div key={label}>
                    <div style={{fontSize:12,fontWeight:600,marginBottom:8}}>{label}</div>
                    <div style={{display:"flex",gap:12,marginBottom:6}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10,color:"var(--green)",marginBottom:3}}>✅ Ganhas</div>
                        <div style={{height:8,background:"var(--brd)",borderRadius:4}}>
                          <div style={{width:`${win}%`,height:"100%",background:"var(--green)",borderRadius:4}}/>
                        </div>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--green)",marginTop:2}}>{win}%</div>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10,color:"var(--red)",marginBottom:3}}>❌ Perdidas</div>
                        <div style={{height:8,background:"var(--brd)",borderRadius:4}}>
                          <div style={{width:`${loss}%`,height:"100%",background:"var(--red)",borderRadius:4}}/>
                        </div>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--red)",marginTop:2}}>{loss}%</div>
                      </div>
                    </div>
                    <div style={{fontSize:11,color:"var(--muted)",lineHeight:1.5}}>
                      {good?<CheckCircle2 size={11} color="var(--green)" style={{display:"inline",marginRight:4}}/>:<AlertTriangle size={11} color="var(--yellow)" style={{display:"inline",marginRight:4}}/>}
                      {tip}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
