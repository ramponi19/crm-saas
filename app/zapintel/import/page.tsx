"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLeads } from "@/hooks/zapintel/useLeads";
import { SEGMENTS, INSTAGRAM_EXPORT_GUIDE } from "@/lib/zapintel/segments/segments";
import { parseInstagramFile } from "@/lib/zapintel/parser/instagramParser";
import { Upload, CheckCircle, ChevronDown, Info, X } from "lucide-react";

type Source = "whatsapp" | "instagram";

export default function ImportPage() {
  const { loadWhatsapp, loadInstagram, setSegmentId, loading, hasWhatsapp } = useLeads();
  const [step, setStep] = useState<"segment"|"source"|"upload"|"done">("segment");
  const [selectedSegment, setSelectedSegment] = useState("");
  const [selectedSource, setSelectedSource] = useState<Source>("whatsapp");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [showIGGuide, setShowIGGuide] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const seg = SEGMENTS.find(s => s.id === selectedSegment);

  async function handleFile(file: File) {
    setError(""); setFileName(file.name);
    try {
      const text = await file.text();
      if (selectedSource === "instagram") {
        const isCSV = file.name.toLowerCase().endsWith(".csv") ||
                      text.trim().startsWith("Contato;") ||
                      text.trim().startsWith("﻿Contato;") ||
                      text.includes(";Arquivo;");
        if (isCSV) {
          // Pass "instagram" channel so leads get tagged correctly
          loadWhatsapp(text, "instagram");
        } else {
          const result = parseInstagramFile(text, file.name);
          if (!result) {
            setError("Não foi possível ler o arquivo. Para múltiplas conversas, use o instagram_combinadas.csv gerado pelo script.");
            return;
          }
          loadInstagram(text, file.name);
        }
      } else {
        loadWhatsapp(text, "whatsapp");
      }
      setStep("done");
      // If both sources loaded, go to merge page; otherwise go to dashboard
      const goMerge = selectedSource === "instagram" && hasWhatsapp;
      setTimeout(() => router.push(goMerge ? "/merge" : "/"), 1400);
    } catch { setError("Erro ao processar o arquivo. Tente novamente."); }
  }

  function onDrop(e: React.DragEvent) { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }
  function onInput(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (f) handleFile(f); }
  function handleSelectSegment(id: string) { setSelectedSegment(id); setSegmentId(id); setTimeout(() => setStep("source"), 200); }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", paddingTop: 20 }}>
      <div style={{ marginBottom: 28, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Importar Conversas</h1>
        <p style={{ color: "var(--dim)", fontSize: 13, lineHeight: 1.7 }}>Configure o segmento e importe conversas do WhatsApp ou Instagram</p>
      </div>

      {/* Steps indicator */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 36 }}>
        {[{key:"segment",label:"Segmento"},{key:"source",label:"Canal"},{key:"upload",label:"Arquivo"},{key:"done",label:"Pronto"}].map((s, i, arr) => {
          const steps = ["segment","source","upload","done"];
          const cur = steps.indexOf(step), thisIdx = steps.indexOf(s.key);
          const done = cur > thisIdx, active = cur === thisIdx;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: done ? "var(--green)" : active ? "var(--purple)" : "var(--card2)", border: `2px solid ${done ? "var(--green)" : active ? "var(--purple)" : "var(--brd2)"}`, color: done || active ? "#fff" : "var(--muted)", transition: "all .3s" }}>
                  {done ? "✓" : thisIdx + 1}
                </div>
                <span style={{ fontSize: 10, color: active ? "var(--txt)" : "var(--muted)", fontWeight: active ? 700 : 400 }}>{s.label}</span>
              </div>
              {i < arr.length - 1 && <div style={{ width: 56, height: 2, background: done ? "var(--green)" : "var(--brd2)", margin: "0 6px", marginBottom: 18, transition: "background .3s" }} />}
            </div>
          );
        })}
      </div>

      {/* STEP 1: SEGMENT */}
      {step === "segment" && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, textAlign: "center" }}>Qual é o segmento do negócio?</div>
          <div style={{ fontSize: 12, color: "var(--dim)", textAlign: "center", marginBottom: 20 }}>O ZapIntel vai calibrar sinais de compra e objeções para o seu mercado</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {SEGMENTS.map(s => (
              <button key={s.id} onClick={() => handleSelectSegment(s.id)} style={{ background: selectedSegment === s.id ? `${s.color}18` : "var(--card)", border: `2px solid ${selectedSegment === s.id ? s.color : "var(--brd)"}`, borderRadius: 12, padding: "16px 12px", cursor: "pointer", textAlign: "center", transition: "all .2s", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
                onMouseEnter={e => { if (selectedSegment !== s.id) e.currentTarget.style.borderColor = s.color; }}
                onMouseLeave={e => { if (selectedSegment !== s.id) e.currentTarget.style.borderColor = "var(--brd)"; }}
              >
                <div style={{ fontSize: 26 }}>{s.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--txt)" }}>{s.name}</div>
                <div style={{ fontSize: 10, color: "var(--dim)", lineHeight: 1.5 }}>{s.description}</div>
                <div style={{ fontSize: 10, color: s.color, fontWeight: 700 }}>Ticket médio: R$ {s.avgTicket.toLocaleString("pt-BR")}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: SOURCE */}
      {step === "source" && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, textAlign: "center" }}>{seg?.icon} {seg?.name} selecionado!</div>
          <div style={{ fontSize: 12, color: "var(--dim)", textAlign: "center", marginBottom: 24 }}>De onde vêm as conversas que você quer analisar?</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            <button onClick={() => { setSelectedSource("whatsapp"); setStep("upload"); }} style={{ background: "var(--card)", border: "2px solid var(--brd)", borderRadius: 14, padding: "24px 20px", cursor: "pointer", textAlign: "center", transition: "all .2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "var(--green)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--brd)"}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>💬</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "var(--txt)", marginBottom: 6 }}>WhatsApp</div>
              <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.6, marginBottom: 10 }}>Importe o CSV gerado pelo script <code style={{ background: "var(--card2)", padding: "1px 5px", borderRadius: 4 }}>combinar_csvs.py</code></div>
              <div style={{ background: "rgba(34,197,94,.15)", color: "var(--green)", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700 }}>✓ Formato .CSV</div>
            </button>
            <button onClick={() => { setSelectedSource("instagram"); setStep("upload"); }} style={{ background: "var(--card)", border: "2px solid var(--brd)", borderRadius: 14, padding: "24px 20px", cursor: "pointer", textAlign: "center", transition: "all .2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#ec4899"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--brd)"}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>📸</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "var(--txt)", marginBottom: 6 }}>Instagram Direct</div>
              <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.6, marginBottom: 10 }}>Exportação oficial do Instagram ou extensão do Chrome</div>
              <div style={{ background: "rgba(236,72,153,.15)", color: "#ec4899", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700 }}>📥 Formato .JSON ou .CSV</div>
            </button>
          </div>
          <button onClick={() => setStep("segment")} style={{ background: "transparent", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 5, margin: "0 auto" }}>← Voltar e trocar segmento</button>
        </div>
      )}

      {/* STEP 3: UPLOAD */}
      {step === "upload" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 22 }}>{selectedSource === "instagram" ? "📸" : "💬"}</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{selectedSource === "instagram" ? "Importar do Instagram" : "Importar do WhatsApp"}</div>
          </div>
          <div style={{ fontSize: 12, color: "var(--dim)", textAlign: "center", marginBottom: 20 }}>Segmento: {seg?.icon} {seg?.name}</div>

          {selectedSource === "instagram" && (
            <div style={{ marginBottom: 14 }}>
              <button onClick={() => setShowIGGuide(!showIGGuide)} style={{ width: "100%", background: "rgba(236,72,153,.08)", border: "1px solid rgba(236,72,153,.3)", borderRadius: 10, padding: "10px 16px", cursor: "pointer", color: "#ec4899", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Info size={14} />Como exportar conversas do Instagram?</div>
                <ChevronDown size={14} style={{ transform: showIGGuide ? "rotate(180deg)" : "none", transition: ".2s" }} />
              </button>
              {showIGGuide && (
                <div style={{ background: "var(--card)", border: "1px solid var(--brd)", borderRadius: 10, padding: 16, marginTop: 10 }}>
                  {INSTAGRAM_EXPORT_GUIDE.map((g, i) => (
                    <div key={i} style={{ marginBottom: i < INSTAGRAM_EXPORT_GUIDE.length - 1 ? 16 : 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#ec4899", marginBottom: 8 }}>
                        {i + 1}. {g.method}
                        <span style={{ fontSize: 10, background: "rgba(236,72,153,.15)", color: "#ec4899", borderRadius: 10, padding: "1px 7px", marginLeft: 8 }}>{g.time}</span>
                      </div>
                      <ol style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                        {g.steps.map((s, j) => <li key={j} style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.6 }}>{s}</li>)}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div onClick={() => inputRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} style={{ border: `2px dashed ${dragging ? "var(--purple)" : error ? "var(--red)" : "var(--brd2)"}`, borderRadius: 16, padding: "48px 32px", textAlign: "center", cursor: "pointer", background: dragging ? "rgba(124,92,252,.06)" : "var(--card)", transition: "all .2s", marginBottom: 12 }}>
            <input ref={inputRef} type="file" accept={selectedSource === "instagram" ? ".json,.csv" : ".csv,.txt"} style={{ display: "none" }} onChange={onInput} />
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 32 }}>⚙️</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Processando {fileName}...</div>
                <div style={{ fontSize: 12, color: "var(--dim)" }}>Classificando para {seg?.name}...</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <Upload size={36} color={selectedSource === "instagram" ? "#ec4899" : "var(--purple-l)"} />
                <div style={{ fontSize: 15, fontWeight: 700 }}>Arraste o arquivo aqui ou clique para selecionar</div>
                <div style={{ fontSize: 12, color: "var(--dim)" }}>{selectedSource === "instagram" ? "Aceita: message_1.json (de qualquer conversa da pasta inbox)" : "Aceita: conversas_combinadas.csv"}</div>
              </div>
            )}
          </div>

          {error && <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 9, padding: "10px 14px", fontSize: 12, color: "var(--red)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><X size={14} /> {error}</div>}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button onClick={() => setStep("source")} style={{ background: "transparent", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>← Voltar e trocar canal</button>
          </div>
        </div>
      )}

      {/* STEP 4: DONE */}
      {step === "done" && (
        <div style={{ textAlign: "center", paddingTop: 30 }}>
          <CheckCircle size={56} color="var(--green)" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--green)", marginBottom: 8 }}>Importado com sucesso!</div>
          <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 4 }}>{fileName}</div>
          <div style={{ fontSize: 12, color: "var(--dim)" }}>{seg?.icon} {seg?.name} · {selectedSource === "instagram" ? "Instagram" : "WhatsApp"}</div>
          <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 12 }}>{hasWhatsapp && selectedSource === "instagram" ? "Redirecionando para unificar perfis..." : "Redirecionando para o dashboard..."}</div>
        </div>
      )}
    </div>
  );
}
