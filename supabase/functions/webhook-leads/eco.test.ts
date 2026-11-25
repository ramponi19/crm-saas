// deno test supabase/functions/webhook-leads/eco.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { negocioArquivadoDoEco, negocioAtivoDoEco } from "./eco.ts";

Deno.test("ativo e aberto primeiro; senão o ativo; sem ativo, nenhum (passo 1, como sempre foi)", () => {
  assertEquals(negocioAtivoDoEco([{ id: 1, ativo: true, status: "ganho" }, { id: 2, ativo: true, status: "aberto" }]), 2);
  assertEquals(negocioAtivoDoEco([{ id: 1, ativo: false, status: "aberto" }, { id: 3, ativo: true, status: "ganho" }]), 3);
  assertEquals(negocioAtivoDoEco([{ id: 1, ativo: false, status: "ganho" }]), null);
  assertEquals(negocioAtivoDoEco([]), null);
});

Deno.test("só arquivados na loja: o mais recente, sem reabrir (passo 3, 24/11/2026)", () => {
  assertEquals(negocioArquivadoDoEco([{ id: 7, ativo: false, status: "ganho" }, { id: 12, ativo: false, status: "perdido" }]), 12);
  assertEquals(negocioArquivadoDoEco([{ id: 12, ativo: false, status: "ganho" }, { id: 7, ativo: false, status: "aberto" }]), 12);
  assertEquals(negocioArquivadoDoEco([]), null);  // sem negócio nesta loja: não grava (não cria negócio por eco)
});
