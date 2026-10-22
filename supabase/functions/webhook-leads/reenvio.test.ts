// deno test --no-lock supabase/functions/webhook-leads/reenvio.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { chaveMid, contaDoEvento, ErroDeBanco, esquecer, hashCorpo, jaRecebido, primeiraEntrega, tamanhoCorpo } from "./reenvio.ts";

Deno.test("mesmo Direct: só a primeira entrega processa; a chave leva o prefixo mid:", async () => {
  const chamadas: unknown[] = [];
  const vistos = new Set<string>();
  const rpc = (fn: string, args: Record<string, unknown>) => {
    chamadas.push([fn, args]);
    const novo = !vistos.has(String(args.p_mid));
    vistos.add(String(args.p_mid));
    return Promise.resolve({ data: novo, error: null });
  };
  assertEquals(await primeiraEntrega(rpc, "m1", "1784"), true);
  assertEquals(await primeiraEntrega(rpc, "m1", "1784"), false);
  assertEquals(await primeiraEntrega(rpc, "m2", "1784"), true);
  assertEquals(chamadas[0], ["webhook_mid_novo", { p_mid: "m1", p_conta: "1784" }]);
  assertEquals(chaveMid("m1"), "mid:m1");
});

Deno.test("mesmo Direct: erro de banco processa (duplicar é melhor que perder)", async () => {
  const fora = () => Promise.resolve({ data: null, error: { message: "PGRST002" } });
  assertEquals(await primeiraEntrega(fora, "m1", null), true);
});

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
