"use client";
import { useEffect, useState } from "react";

/**
 * O DIA DA LOJA — a primeira coisa que o dono lê ao abrir.
 *
 * ══ POR QUE ISTO EXISTE ════════════════════════════════════════════════════
 *
 * Do Lucas, em 12/10/2026: *"construiu construiu construiu mas olho a mesma
 * coisa"*. A reconstrução do ZapIntel tinha ido toda para a fundação — ponte
 * venda↔conversa, motores lendo o CRM direto, três tickets inventados mortos —
 * e a home continuava a mesma fileira de cartões.
 *
 * Um cartão escrito "2.097 conversas" não diz a ninguém o que fazer hoje.
 *
 * ══ POR QUE ELE CHEGA DEPOIS, E SOZINHO ════════════════════════════════════
 *
 * Porque depende de um provedor de fora. Costurado ao painel, a tela inteira
 * esperaria o Gemini, e num dia de instabilidade dele o CRM pareceria quebrado
 * por causa de um parágrafo. Aqui o painel desenha na hora e o texto entra
 * quando entra.
 *
 * ══ POR QUE O ERRO APARECE, EM VEZ DE SUMIR ════════════════════════════════
 *
 * Porque a IA deste CRM já passou meses morta e calada: `/zapintel/api/analyze`
 * exigia uma chave que não existia em ambiente nenhum, e cada clique devolvia
 * 500 sem que ninguém soubesse. Falha silenciosa é como se perde um recurso
 * inteiro sem perceber. A mensagem que aparece aqui já vem traduzida para o
 * balcão por `mensagemDoProvedor()` — nunca o erro cru do Google.
 */
export function ResumoDoDia() {
  const [texto, setTexto] = useState<string>("");
  const [erro, setErro] = useState<string>("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch("/zapintel/api/dia", { cache: "no-store" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (!ok) setErro(String(d?.erro || "O resumo do dia não está disponível agora."));
        else setTexto(String(d?.relato || ""));
      })
      .catch(() => { if (vivo) setErro("O resumo do dia não está disponível agora."); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  // Sem painel guardado ainda: a rota devolve `relato: null` e não há o que
  // narrar. Não é erro, e um aviso aqui só ocuparia espaço.
  if (!carregando && !texto && !erro) return null;

  return (
    <div
      className="card"
      style={{
        padding: "18px 22px",
        marginBottom: 18,
        borderLeft: "3px solid var(--purple)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: "var(--purple-l)",
          letterSpacing: 0.8,
          marginBottom: 9,
        }}
      >
        O DIA DA LOJA
      </div>

      {carregando && (
        <div
          style={{
            height: 15,
            width: "72%",
            borderRadius: 7,
            background:
              "linear-gradient(90deg, var(--card2) 0%, var(--brd) 50%, var(--card2) 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
      )}

      {texto && (
        <p style={{ fontSize: 14.5, color: "var(--txt)", lineHeight: 1.75 }}>
          {texto}
        </p>
      )}

      {erro && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
          {erro}
        </p>
      )}

      {texto && (
        <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.5 }}>
          Escrito pela IA a partir dos números desta tela — os mesmos, sem conta nova.
        </p>
      )}
    </div>
  );
}
