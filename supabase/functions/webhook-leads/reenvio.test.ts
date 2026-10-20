// deno test --no-lock supabase/functions/webhook-leads/reenvio.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { contaDoEvento, ErroDeBanco, esquecer, hashCorpo, jaRecebido, tamanhoCorpo } from "./reenvio.ts";

Deno.test("hash é do corpo exato: um byte diferente muda tudo", async () => {
  const a = await hashCorpo('{"a":1}');
  assertEquals(a, await hashCorpo('{"a":1}'));
  assert(a !== await hashCorpo('{"a":2}'));
  assertEquals(a.length, 64);
});

Deno.test("tamanho em bytes UTF-8", () => {
  assertEquals(tamanhoCorpo("ação"), 6);
});

Deno.test("conta do evento: WhatsApp pelo phone_number_id, Instagram/Página pelo entry.id", () => {
  assertEquals(contaDoEvento({ entry: [{ id: "WABA", changes: [{ value: { metadata: { phone_number_id: "139" } } }] }] }), "139");
  assertEquals(contaDoEvento({ entry: [{ id: "1784", messaging: [] }] }), "1784");
  assertEquals(contaDoEvento({}), null);
});

Deno.test("erro de banco não bloqueia: trata como pacote novo e processa", async () => {
  const rpc = () => Promise.resolve({ data: null, error: { message: "banco fora" } });
  assertEquals(await jaRecebido(rpc, "h", 1, null, true), false);
});

Deno.test("banco dizendo que já viu → reenvio", async () => {
  const rpc = () => Promise.resolve({ data: true, error: null });
  assertEquals(await jaRecebido(rpc, "h", 1, null, false), true);
});

Deno.test("esquecer apaga o hash pelo RPC próprio e não quebra se o banco estiver fora", async () => {
  const chamadas: unknown[] = [];
  const ok = (fn: string, args: Record<string, unknown>) => { chamadas.push([fn, args]); return Promise.resolve({ data: null, error: null }); };
  await esquecer(ok, "abc");
  assertEquals(chamadas, [["webhook_reenvio_esquecer", { p_hash: "abc" }]]);
  const fora = () => Promise.resolve({ data: null, error: { message: "PGRST002" } });
  await esquecer(fora, "abc");
});

Deno.test("ErroDeBanco é distinguível de erro de dado", () => {
  const e: unknown = new ErroDeBanco("canal whatsapp:1: PGRST002");
  assert(e instanceof ErroDeBanco);
  assert(e instanceof Error);
  assert(!(new Error("x") instanceof ErroDeBanco));
});
