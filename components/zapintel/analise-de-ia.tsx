import { RefreshCw, Sparkles, AlertTriangle, Bot } from "lucide-react";
import type { PerfilIA } from "@/lib/zapintel/perfil";

/**
 * O BLOCO "ANÁLISE DE IA" DA FICHA DO LEAD — e quando ele NÃO oferece gerar.
 *
 * Saiu de `app/zapintel/leads/[id]/page.tsx` em 16/10/2026 para poder ser
 * testado sozinho (`tests/zapintel-tela.test.ts`).
 *
 * ══ FUNIL INTERNO: SEM BOTÃO ══════════════════════════════════════════════
 *
 * Conversa de funil interno (equipe, candidatos) fica fora das análises: a
 * rota `/zapintel/api/perfil` responde 422 com `leadDeFunilInterno`. Até
 * 16/10 a tela mostrava "Gerar análise" mesmo assim, e o clique só servia
 * para devolver o erro (visto em produção no lead do funil "Time JM"). Agora
 * `/zapintel/api/conversa` manda `funilInterno` calculado pela MESMA função,
 * e nenhum dos três botões aparece — nem "Gerar análise", nem "Gerar nova
 * análise", nem "Refazer análise". Ficha antiga de um lead que depois foi
 * movido para o funil interno continua visível; só não se gera outra.
 *
 * Sem "use client" de propósito: só é usado dentro da ficha, que já é
 * componente de cliente — e assim pode receber funções como props.
 */

export interface GuardadoNaTela { perfil: PerfilIA; atual: boolean; geradoEm: string; mensagensNaFicha?: number }

export function AnaliseDeIA({ guardado, analisando, novas, leadMessages, storeMessages, iaLigada, funilInterno, erroIA, onAnalisar }: {
  guardado: GuardadoNaTela | null;
  analisando: boolean;
  /** Mensagens que chegaram depois da ficha guardada. */
  novas: number;
  leadMessages: number;
  storeMessages: number;
  iaLigada: boolean;
  funilInterno: boolean;
  erroIA: string;
  onAnalisar: (forcar: boolean) => void;
}) {
  const ia = guardado?.perfil ?? null;
  const podeGerar = iaLigada && !funilInterno;

  return (
    <section className={`card fc-analise ${ia ? "" : "vazia"}`}>
      <div className="fc-cab">
        <h2><Sparkles size={14} /> Análise de IA</h2>
        {analisando && <span className="fc-andando"><RefreshCw size={12} style={{ animation: "zi-spin 1s linear infinite" }} /> lendo a conversa…</span>}
      </div>
      {ia ? (
        <>
          <p className="fc-diag">{ia.diagnostico}</p>
          {!guardado?.atual && !analisando && !funilInterno && (
            <div className="fc-aviso">
              <span><b>Nova análise disponível</b> · {novas > 0 ? `${novas} ${novas === 1 ? "mensagem nova" : "mensagens novas"} desde esta análise` : "a conversa mudou desde esta análise"}</span>
              {podeGerar && <button className="fc-botao" onClick={() => onAnalisar(false)}><Bot size={13} /> Gerar nova análise</button>}
            </div>
          )}
          <div className="fc-rodape">
            <span>Análise de {new Date(guardado!.geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}</span>
            {podeGerar && guardado?.atual && (
              <button className="fc-link" onClick={() => onAnalisar(true)} disabled={analisando}><RefreshCw size={11} /> Refazer análise</button>
            )}
          </div>
        </>
      ) : funilInterno ? (
        <div className="fc-sem">
          <p>Conversa de funil interno (equipe ou candidatos): fica fora das análises do ZapIntel.</p>
        </div>
      ) : leadMessages === 0 ? (
        <div className="fc-sem">
          <p>Sem resposta do cliente: só a loja escreveu até agora ({storeMessages} {storeMessages === 1 ? "mensagem" : "mensagens"}). A análise fica disponível quando o cliente responder.</p>
        </div>
      ) : (
        <div className="fc-sem">
          <p>Este lead ainda não tem análise de IA. Ela lê a conversa inteira — inclusive os áudios transcritos — e escreve o diagnóstico, os sinais, as objeções e a próxima ação, com a frase do cliente como prova.</p>
          {iaLigada
            ? <button className="fc-botao" onClick={() => onAnalisar(false)} disabled={analisando}><Bot size={13} /> {analisando ? "Analisando…" : "Gerar análise"}</button>
            : <span className="fc-mudo">A IA do CRM está desligada.</span>}
        </div>
      )}
      {erroIA && <p className="fc-erro"><AlertTriangle size={12} /> {erroIA}</p>}
    </section>
  );
}
