"use client";
import { useState, useMemo } from "react";
import { Copy, CheckCircle2, Plus, Trash2, BookOpen, Search, TrendingUp } from "lucide-react";

type Category = "price" | "reconnect" | "closing" | "referral" | "followup" | "objection" | "custom";

interface Script {
  id: string; title: string; category: Category;
  situation: string; message: string; usageCount: number; createdAt: string;
}

const CATEGORY_META: Record<Category, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  price:     { label: "Objeção de Preço",   color: "#ef4444", bg: "rgba(239,68,68,.1)",    border: "rgba(239,68,68,.3)",    emoji: "💰" },
  reconnect: { label: "Reconexão",          color: "#60a5fa", bg: "rgba(96,165,250,.1)",   border: "rgba(96,165,250,.3)",   emoji: "👋" },
  closing:   { label: "Fechamento",         color: "#22c55e", bg: "rgba(34,197,94,.1)",    border: "rgba(34,197,94,.3)",    emoji: "🤝" },
  referral:  { label: "Indicação",          color: "#14b8a6", bg: "rgba(20,184,166,.1)",   border: "rgba(20,184,166,.3)",   emoji: "🎁" },
  followup:  { label: "Follow-up Geral",    color: "#f97316", bg: "rgba(249,115,22,.1)",   border: "rgba(249,115,22,.3)",   emoji: "⚡" },
  objection: { label: "Quebrar Objeção",    color: "#a78bfa", bg: "rgba(167,139,250,.1)",  border: "rgba(167,139,250,.3)",  emoji: "🎯" },
  custom:    { label: "Personalizado",       color: "#9ca3af", bg: "rgba(156,163,175,.1)",  border: "rgba(156,163,175,.3)",  emoji: "✏️" },
};

const DEFAULT_SCRIPTS: Script[] = [
  {
    id: "1", category: "price", usageCount: 0, createdAt: "2026-01-01",
    title: "Comparação com marketplace",
    situation: "Lead diz que está mais barato num marketplace",
    message: `Entendo, {nome}! Só que num marketplace você compra de um estranho, sem saber a real procedência 😅\n\nAqui com a gente você tem: garantia, produto/serviço conferido pessoalmente, e se tiver qualquer problema você fala direto comigo.\n\nNão tem como comparar 👊`,
  },
  {
    id: "2", category: "price", usageCount: 0, createdAt: "2026-01-01",
    title: "Parcelamento como argumento",
    situation: "Lead acha caro, não quer pagar à vista",
    message: `{nome}, pode parcelar em até 18x! Fica menos de R$ X por mês — menos que uma academia 😂\n\nE um bom produto dura anos sem problema. Divide o valor pelo tempo de uso e é um baita investimento.`,
  },
  {
    id: "3", category: "reconnect", usageCount: 0, createdAt: "2026-01-01",
    title: "Reativar após sumiço",
    situation: "Lead parou de responder há +5 dias",
    message: `Oi {nome}! Tudo bem? 😊\n\nPassei aqui pra ver se você ainda tá pensando na compra ou se já resolveu de outro jeito. Sem pressão nenhuma — só quero garantir que você faça a melhor escolha!`,
  },
  {
    id: "4", category: "reconnect", usageCount: 0, createdAt: "2026-01-01",
    title: "Reconexão com novidade",
    situation: "Lead frio — usar uma notícia/produto novo como gancho",
    message: `{nome}! Sumiu hein 😄\n\nPassei aqui porque acabou de chegar um {modelo} muito bom aqui — lembrei de você porque você tinha perguntado sobre ele. Quer ver as fotos?`,
  },
  {
    id: "5", category: "closing", usageCount: 0, createdAt: "2026-01-01",
    title: "Urgência real — último estoque",
    situation: "Lead quente mas procrastinando",
    message: `{nome}, preciso te falar uma coisa: só sobrou 1 unidade desse {modelo} aqui. Quando sai, leva um tempão pra chegar outro igual.\n\nConsegue definir hoje? Posso reservar pra você até amanhã de manhã.`,
  },
  {
    id: "6", category: "closing", usageCount: 0, createdAt: "2026-01-01",
    title: "Entrada com produto usado",
    situation: "Lead hesitando por causa do valor total",
    message: `{nome}, você tem algo pra dar de entrada? Porque a gente aceita usado como parte do pagamento!\n\nDepois eu avalio aqui e abate direto no valor — às vezes muda bastante a conta final 😉`,
  },
  {
    id: "7", category: "referral", usageCount: 0, createdAt: "2026-01-01",
    title: "Pedir indicação a cliente",
    situation: "Cliente acabou de comprar — momento ideal",
    message: `{nome}! Fico muito feliz que deu certo! 🎉\n\nSe você conhecer alguém interessado, me manda o contato — tenho uma condição especial pra quem chega por indicação sua. Valeu demais!`,
  },
  {
    id: "8", category: "objection", usageCount: 0, createdAt: "2026-01-01",
    title: "Objeção de prazo — precisa consultar cônjuge",
    situation: "Lead diz que precisa falar com esposa/marido",
    message: `Claro {nome}, faz sentido! Decisão assim é pra tomar junto mesmo 😊\n\nQuer que eu monte um resuminho com tudo — modelo, valor, condições — pra você mostrar pra ela/ele? Facilita bastante a conversa!`,
  },
  {
    id: "9", category: "followup", usageCount: 0, createdAt: "2026-01-01",
    title: "Follow-up depois de proposta enviada",
    situation: "Mandou preço e não recebeu resposta",
    message: `{nome}, oi! Só passando pra ver se chegou o valor que mandei e se ficou alguma dúvida 😊\n\nQualquer coisa é só falar — tô aqui!`,
  },
];

function newId() { return Math.random().toString(36).slice(2); }

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<Script[]>(DEFAULT_SCRIPTS);
  const [search, setSearch]   = useState("");
  const [catFilter, setCatFilter] = useState<Category | "all">("all");
  const [copiedId, setCopiedId]   = useState<string | null>(null);
  const [creating, setCreating]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);

  // Form state
  const [fTitle, setFTitle]       = useState("");
  const [fCat, setFCat]           = useState<Category>("followup");
  const [fSituation, setFSituation] = useState("");
  const [fMessage, setFMessage]   = useState("");

  const filtered = useMemo(() => scripts.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.title.toLowerCase().includes(q) || s.message.toLowerCase().includes(q) || s.situation.toLowerCase().includes(q);
    const matchCat = catFilter === "all" || s.category === catFilter;
    return matchSearch && matchCat;
  }).sort((a,b) => b.usageCount - a.usageCount), [scripts, search, catFilter]);

  async function copyScript(s: Script) {
    const text = s.message;
    await navigator.clipboard.writeText(text);
    setCopiedId(s.id);
    setScripts(prev => prev.map(x => x.id===s.id ? {...x, usageCount: x.usageCount+1} : x));
    setTimeout(() => setCopiedId(null), 2000);
  }

  function saveScript() {
    if (!fTitle.trim() || !fMessage.trim()) return;
    if (editId) {
      setScripts(prev => prev.map(s => s.id===editId ? {...s,title:fTitle,category:fCat,situation:fSituation,message:fMessage} : s));
      setEditId(null);
    } else {
      setScripts(prev => [...prev, {id:newId(),title:fTitle,category:fCat,situation:fSituation,message:fMessage,usageCount:0,createdAt:new Date().toISOString().split("T")[0]}]);
    }
    setCreating(false); setFTitle(""); setFCat("followup"); setFSituation(""); setFMessage("");
  }

  function startEdit(s: Script) {
    setFTitle(s.title); setFCat(s.category); setFSituation(s.situation); setFMessage(s.message);
    setEditId(s.id); setCreating(true);
  }

  function deleteScript(id: string) {
    setScripts(prev => prev.filter(s => s.id !== id));
  }

  const catCounts = useMemo(() => {
    const c: Record<string,number> = {all: scripts.length};
    scripts.forEach(s => { c[s.category] = (c[s.category]||0)+1; });
    return c;
  }, [scripts]);

  return (
    <div style={{maxWidth:1080,margin:"0 auto"}}>
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:22,fontWeight:800,letterSpacing:-.5,marginBottom:4,display:"flex",alignItems:"center",gap:10}}>
          <BookOpen size={22} color="var(--purple)"/> Biblioteca de Scripts
        </h1>
        <p style={{fontSize:12,color:"var(--dim)"}}>Mensagens prontas para cada situação — copie e adapte com 1 clique</p>
      </div>

      {/* Top bar */}
      <div style={{display:"flex",gap:10,marginBottom:18,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{position:"relative",flex:1,minWidth:200}}>
          <Search size={13} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"var(--muted)"}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar scripts..."
            style={{width:"100%",background:"var(--card2)",border:"1px solid var(--brd2)",borderRadius:9,padding:"8px 12px 8px 30px",fontSize:13,color:"var(--txt)"}}/>
        </div>
        <button onClick={() => {setCreating(true);setEditId(null);setFTitle("");setFCat("custom");setFSituation("");setFMessage("");}} style={{
          display:"flex",alignItems:"center",gap:6,background:"var(--purple)",border:"none",borderRadius:9,
          padding:"9px 16px",fontSize:13,fontWeight:700,color:"#fff",cursor:"pointer",
        }}>
          <Plus size={14}/> Novo Script
        </button>
      </div>

      {/* Category filters */}
      <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
        {([["all","Todos","#6b7280","📋"], ...Object.entries(CATEGORY_META).map(([k,v]) => [k,v.label,v.color,v.emoji])] as [string,string,string,string][]).map(([k,label,color,emoji]) => (
          <button key={k} onClick={() => setCatFilter(k as Category | "all")} style={{
            display:"flex",alignItems:"center",gap:5,
            padding:"6px 12px",borderRadius:8,fontSize:11,fontWeight:catFilter===k?700:400,
            background:catFilter===k?`${color}20`:"var(--card2)",
            border:`1px solid ${catFilter===k?color:"var(--brd2)"}`,
            color:catFilter===k?color:"var(--dim)",cursor:"pointer",
          }}>
            <span>{emoji}</span> {label}
            <span style={{fontSize:10,opacity:.7}}>({catCounts[k]||0})</span>
          </button>
        ))}
      </div>

      {/* Create/Edit form */}
      {creating && (
        <div className="card" style={{padding:22,marginBottom:18,border:"1px solid var(--purple)",background:"rgba(124,92,252,.04)"}}>
          <div style={{fontSize:14,fontWeight:800,marginBottom:16}}>{editId?"✏️ Editar Script":"✨ Novo Script"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div>
              <label style={{fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:.7,display:"block",marginBottom:5}}>TÍTULO *</label>
              <input value={fTitle} onChange={e=>setFTitle(e.target.value)} placeholder="Ex: Objeção de preço vs ML"
                style={{width:"100%",background:"var(--card2)",border:"1px solid var(--brd2)",borderRadius:8,padding:"8px 12px",fontSize:13,color:"var(--txt)"}}/>
            </div>
            <div>
              <label style={{fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:.7,display:"block",marginBottom:5}}>CATEGORIA</label>
              <select value={fCat} onChange={e=>setFCat(e.target.value as Category)}
                style={{width:"100%",background:"var(--card2)",border:"1px solid var(--brd2)",borderRadius:8,padding:"8px 12px",fontSize:13,color:"var(--txt)",cursor:"pointer"}}>
                {Object.entries(CATEGORY_META).map(([k,v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:.7,display:"block",marginBottom:5}}>SITUAÇÃO (quando usar)</label>
            <input value={fSituation} onChange={e=>setFSituation(e.target.value)} placeholder="Ex: Lead disse que está caro demais"
              style={{width:"100%",background:"var(--card2)",border:"1px solid var(--brd2)",borderRadius:8,padding:"8px 12px",fontSize:13,color:"var(--txt)"}}/>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:10,color:"var(--muted)",fontWeight:700,letterSpacing:.7,display:"block",marginBottom:5}}>
              MENSAGEM * <span style={{color:"var(--muted)",fontWeight:400}}>— use {"{nome}"}, {"{modelo}"} como variáveis</span>
            </label>
            <textarea value={fMessage} onChange={e=>setFMessage(e.target.value)} rows={5}
              placeholder="Digite a mensagem pronta aqui..."
              style={{width:"100%",background:"var(--card2)",border:"1px solid var(--brd2)",borderRadius:8,padding:"8px 12px",fontSize:13,color:"var(--txt)",resize:"vertical"}}/>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={() => {setCreating(false);setEditId(null);}} style={{flex:1,background:"var(--card2)",border:"1px solid var(--brd2)",borderRadius:8,padding:"9px 0",fontSize:13,color:"var(--dim)",cursor:"pointer"}}>Cancelar</button>
            <button onClick={saveScript} disabled={!fTitle.trim()||!fMessage.trim()} style={{
              flex:2,background:"var(--purple)",border:"none",borderRadius:8,padding:"9px 0",fontSize:13,fontWeight:700,color:"#fff",
              cursor:!fTitle.trim()||!fMessage.trim()?"not-allowed":"pointer",opacity:!fTitle.trim()||!fMessage.trim()?.5:1,
            }}>
              {editId?"💾 Salvar alterações":"✓ Criar Script"}
            </button>
          </div>
        </div>
      )}

      {/* Scripts grid */}
      {filtered.length === 0 ? (
        <div className="card" style={{padding:40,textAlign:"center",color:"var(--muted)"}}>
          <div style={{fontSize:32,marginBottom:12}}>📭</div>
          <div style={{fontSize:13}}>Nenhum script encontrado. Crie o primeiro!</div>
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:14}}>
          {filtered.map(s => {
            const meta = CATEGORY_META[s.category];
            const isCopied = copiedId === s.id;
            return (
              <div key={s.id} className="card" style={{padding:18,display:"flex",flexDirection:"column",gap:12,border:`1px solid ${meta.border}`,background:meta.bg}}>
                {/* Header */}
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <span style={{fontSize:20,lineHeight:1}}>{meta.emoji}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{s.title}</div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:10,fontWeight:700,color:meta.color,background:"rgba(0,0,0,.2)",border:`1px solid ${meta.border}`,borderRadius:20,padding:"1px 8px"}}>
                        {meta.label}
                      </span>
                      {s.usageCount > 0 && (
                        <span style={{fontSize:10,color:"var(--muted)",display:"flex",alignItems:"center",gap:3}}>
                          <TrendingUp size={9}/> {s.usageCount}x usado
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Situation */}
                {s.situation && (
                  <div style={{fontSize:11,color:"var(--muted)",fontStyle:"italic",lineHeight:1.5}}>
                    📌 {s.situation}
                  </div>
                )}

                {/* Message preview */}
                <div style={{background:"var(--card)",border:"1px solid var(--brd2)",borderRadius:8,padding:"10px 12px",flex:1}}>
                  <p style={{fontSize:12,color:"var(--dim)",lineHeight:1.8,whiteSpace:"pre-wrap",margin:0}}>{s.message}</p>
                </div>

                {/* Actions */}
                <div style={{display:"flex",gap:7}}>
                  <button onClick={() => copyScript(s)} style={{
                    flex:2,display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                    background:isCopied?"rgba(34,197,94,.15)":meta.color+"25",
                    border:`1px solid ${isCopied?"rgba(34,197,94,.4)":meta.border}`,
                    borderRadius:8,color:isCopied?"var(--green)":meta.color,
                    fontSize:12,fontWeight:700,padding:"8px 0",cursor:"pointer",transition:"all .2s",
                  }}>
                    {isCopied?<><CheckCircle2 size={13}/> Copiado!</>:<><Copy size={13}/> Copiar</>}
                  </button>
                  <button onClick={() => startEdit(s)} style={{
                    flex:1,background:"transparent",border:"1px solid var(--brd2)",borderRadius:8,
                    color:"var(--muted)",fontSize:11,padding:"8px 0",cursor:"pointer",
                  }}>Editar</button>
                  <button onClick={() => deleteScript(s.id)} style={{
                    background:"transparent",border:"1px solid var(--brd2)",borderRadius:8,
                    color:"var(--muted)",padding:"8px 10px",cursor:"pointer",
                  }}><Trash2 size={12}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
