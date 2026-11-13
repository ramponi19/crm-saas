// deno test --no-lock supabase/functions/webhook-leads/canal-resposta.test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { conferirCanalDeResposta, destinoNaConta } from "./canal-resposta.ts";

const neg = { empresa_id: 1, filial_id: 6 };
const canal = (o: Partial<{ id: number; empresa_id: number; tipo: string; filial_id: number | null; status: string }>) =>
  ({ id: 28, empresa_id: 1, tipo: "whatsapp", filial_id: 6, status: "ativo", ...o });

Deno.test("canal da loja do negócio, ativo e do tipo: aceito", () => {
  assertEquals(conferirCanalDeResposta(canal({}), neg, "whatsapp"), { ok: true });
  // Canal da rede (filial nula) vale para qualquer loja.
  assertEquals(conferirCanalDeResposta(canal({ tipo: "messenger", filial_id: null }), neg, "messenger"), { ok: true });
});

Deno.test("canal passado à força: outra empresa, outra loja, outro tipo, inativo — recusado", () => {
  const c = (o: Parameters<typeof canal>[0], t: "whatsapp" | "instagram" = "whatsapp") => {
    const r = conferirCanalDeResposta(canal(o), neg, t);
    return r.ok ? "ok" : `${r.status} ${r.codigo}`;
  };
  assertEquals(c({ empresa_id: 2 }), "409 canal_de_outra_empresa");
  assertEquals(conferirCanalDeResposta(null, neg, "whatsapp").ok, false);
  assertEquals(c({ filial_id: 3 }), "409 canal_de_outra_loja");
  assertEquals(c({}, "instagram"), "409 canal_de_outro_tipo");
  assertEquals(c({ status: "expirado" }), "409 canal_inativo");
});

Deno.test("destino: a identidade da conta que envia; nunca a de outra conta", () => {
  const ids = [{ external_id: "igsid-mogi", canal_id: 25 }, { external_id: "igsid-jag", canal_id: 26 }];
  assertEquals(destinoNaConta(ids, 26), "igsid-jag");
  assertEquals(destinoNaConta(ids, 99), null);
  assertEquals(destinoNaConta([{ external_id: "antigo", canal_id: null }, ...ids], 99), "antigo");
});
