// deno test supabase/functions/webhook-leads/historico.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { direcaoNoHistorico, numeroDoCanalNoEvento } from "./historico.ts";

// O formato real do evento `history` (cofre historico_bruto, Aletrini, 19/11/2026), com números fictícios.
const evento = {
  messaging_product: "whatsapp",
  metadata: { display_phone_number: "5519900000000", phone_number_id: "1234567890" },
  history: [{
    metadata: { phase: 0, progress: 0, chunk_order: 0 },
    threads: [{ id: "5519911112222", messages: [
      { from: "5519911112222", id: "wamid.A", timestamp: "1763500000", type: "text", text: { body: "Oi, tem o carro?" } },
      { from: "5519900000000", id: "wamid.B", timestamp: "1763500060", type: "text", text: { body: "Tem sim!" } },
    ] }],
  }],
};

Deno.test("o número do canal vem dos metadados do EVENTO, não dos do bloco", () => {
  assertEquals(numeroDoCanalNoEvento(evento), "5519900000000");
  // O bloco não tem o número: era daqui que o importador lia, e tudo virava "recebida".
  assertEquals(numeroDoCanalNoEvento(evento.history[0] as unknown as Record<string, unknown>), "");
});

Deno.test("from = número do canal → enviada; outro número → recebida", () => {
  const numero = numeroDoCanalNoEvento(evento);
  const [cliente, loja] = evento.history[0].threads[0].messages;
  assertEquals(direcaoNoHistorico(numero, cliente.from), "recebida");
  assertEquals(direcaoNoHistorico(numero, loja.from), "enviada");
});

Deno.test("sem número do canal, nada vira enviada por engano", () => {
  assertEquals(direcaoNoHistorico("", "5519900000000"), "recebida");
  assertEquals(direcaoNoHistorico("+55 (19) 90000-0000", "5519900000000"), "enviada");
});
