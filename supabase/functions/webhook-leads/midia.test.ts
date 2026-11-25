// deno test supabase/functions/webhook-leads/midia.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  comNovasTentativas, erroDeStorageTransitorio, prazoDaMidia, statusTransitorio, type Tentativa,
} from "./midia.ts";

const semEspera = () => Promise.resolve();

/** Uma sequência de respostas, uma por tentativa; conta quantas vezes foi chamada. */
function roteiro<T>(respostas: (Tentativa<T> | Error)[]) {
  let i = 0;
  const f = () => {
    const r = respostas[Math.min(i++, respostas.length - 1)];
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  return { f, chamadas: () => i };
}

Deno.test("520 duas vezes e depois ok: grava na terceira (o caso de 25/11)", async () => {
  const r = roteiro<string>([
    { ok: false, transitorio: true, motivo: "HTTP 520" },
    { ok: false, transitorio: true, motivo: "HTTP 520" },
    { ok: true, valor: "1/m/wa-1.ogg" },
  ]);
  const fim = await comNovasTentativas(r.f, [500, 1500], semEspera);
  assertEquals(fim.ok, true);
  assertEquals(fim.tentativas, 3);
});

Deno.test("até 2 novas tentativas: na quarta não tenta mais", async () => {
  const r = roteiro<string>([{ ok: false, transitorio: true, motivo: "HTTP 503" }]);
  const fim = await comNovasTentativas(r.f, [500, 1500], semEspera);
  assertEquals(fim.ok, false);
  assertEquals(r.chamadas(), 3);
  assertEquals(fim.ok === false && fim.transitorio, true);
});

Deno.test("4xx não repete", async () => {
  const r = roteiro<string>([{ ok: false, transitorio: false, motivo: "HTTP 404" }]);
  const fim = await comNovasTentativas(r.f, [500, 1500], semEspera);
  assertEquals(r.chamadas(), 1);
  assertEquals(fim.ok, false);
});

Deno.test("tempo esgotado (fetch abortado) conta como passageiro e repete", async () => {
  const abort = new Error("aborted"); abort.name = "AbortError";
  const r = roteiro<string>([abort, { ok: true, valor: "ok" }]);
  const fim = await comNovasTentativas(r.f, [500, 1500], semEspera);
  assertEquals(fim.ok, true);
  assertEquals(r.chamadas(), 2);
});

Deno.test("esperas de 0,5 s e 1,5 s, nessa ordem", async () => {
  const esperou: number[] = [];
  const r = roteiro<string>([{ ok: false, transitorio: true, motivo: "429" }]);
  await comNovasTentativas(r.f, [500, 1500], (ms) => { esperou.push(ms); return Promise.resolve(); });
  assertEquals(esperou, [500, 1500]);
});

Deno.test("o que é passageiro: 5xx e 429; 4xx não", () => {
  assertEquals([520, 500, 503, 429].map(statusTransitorio), [true, true, true, true]);
  assertEquals([400, 401, 404, 413].map(statusTransitorio), [false, false, false, false]);
});

Deno.test("erro do Storage: pela mensagem 'HTTP 520 error', pelo status, e sem número = passageiro", () => {
  assertEquals(erroDeStorageTransitorio({ message: "HTTP 520 error" }), true);
  assertEquals(erroDeStorageTransitorio({ statusCode: "413", message: "Payload too large" }), false);
  assertEquals(erroDeStorageTransitorio({ status: 503 }), true);
  assertEquals(erroDeStorageTransitorio({ message: "Invalid key" , status: 400 }), false);
  assertEquals(erroDeStorageTransitorio({ message: "fetch failed" }), true);
});

Deno.test("prazo da Meta: 7 dias a partir do timestamp do webhook", () => {
  // 25/11/2026 14:31:58 UTC
  assertEquals(prazoDaMidia("1795617118"), new Date((1795617118 + 7 * 86400) * 1000).toISOString());
  const agora = new Date("2026-11-25T15:00:00.000Z");
  assertEquals(prazoDaMidia(undefined, agora), "2026-12-02T15:00:00.000Z");
});
