"use client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O CANAL AO VIVO DO ZAPINTEL — UM SÓ POR EMPRESA, COMPARTILHADO.
 *
 * O cliente do Supabase no navegador é único, e `supabase.channel(nome)`
 * DEVOLVE O CANAL QUE JÁ EXISTE quando o nome se repete (realtime-js 2.108).
 * Enquanto cada tela tinha uma consulta ao vivo, tanto fazia. Desde 15/10/2026
 * o menu do ZapIntel também escuta (o número de conversas por loja), e com
 * dois ouvintes no mesmo `zapintel:<empresa>`:
 *
 *   - o segundo chamaria `subscribe()` de novo no mesmo canal, o que a
 *     biblioteca recusa ("subscribe can only be called a single time");
 *   - o primeiro a sair da tela faria `removeChannel` e derrubaria o canal
 *     do outro, que ficaria "ao vivo" sem receber nada.
 *
 * Aqui o canal é aberto uma vez, os avisos são repassados a quem estiver
 * ouvindo, e ele só fecha quando o último ouvinte sai.
 */

export interface Ouvinte {
  /** Um aviso do banco: mensagens, análises ou vendas. */
  evento: (e: { event?: string }) => void;
  /** O estado da conexão ("SUBSCRIBED", "CLOSED", …). */
  status: (s: string) => void;
}

interface Registro {
  canal: ReturnType<SupabaseClient["channel"]>;
  ouvintes: Set<Ouvinte>;
  status: string;
}

const canais = new Map<number, Registro>();

export function ouvirZapintel(supabase: SupabaseClient, empresa: number, ouvinte: Ouvinte): () => void {
  let reg = canais.get(empresa);
  if (!reg) {
    const ouvintes = new Set<Ouvinte>();
    const canal = supabase.channel(`zapintel:${empresa}`, { config: { private: true } });
    const repassa = (e: { event?: string }) => ouvintes.forEach((o) => o.evento(e));
    canal
      .on("broadcast", { event: "mensagens" }, repassa)
      .on("broadcast", { event: "analises" }, repassa)
      .on("broadcast", { event: "vendas" }, repassa);
    const novo: Registro = { canal, ouvintes, status: "CONECTANDO" };
    canais.set(empresa, novo);
    canal.subscribe((s) => {
      novo.status = s;
      ouvintes.forEach((o) => o.status(s));
    });
    reg = novo;
  }
  const atual = reg;
  atual.ouvintes.add(ouvinte);
  // Quem chega depois da conexão precisa saber que ela já está de pé.
  if (atual.status !== "CONECTANDO") queueMicrotask(() => ouvinte.status(atual.status));
  return () => {
    atual.ouvintes.delete(ouvinte);
    if (atual.ouvintes.size === 0 && canais.get(empresa) === atual) {
      canais.delete(empresa);
      void supabase.removeChannel(atual.canal);
    }
  };
}
