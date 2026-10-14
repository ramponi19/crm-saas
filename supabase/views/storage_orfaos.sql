-- ARQUIVOS NO BUCKET QUE NENHUMA COLUNA DO SISTEMA APONTA.
--
-- ⚠ ESTE ARQUIVO EXISTE PORQUE A VIEW SÓ VIVE NO BANCO.
--
-- Ela foi criada por migration e não tem representação em código. Sem esta
-- cópia, a única forma de saber o que ela faz seria abrir o Supabase — e a
-- regra que ela guarda é destrutiva. Mexeu na view? Atualize aqui também.
--
-- ══ A ARMADILHA, PAGA EM 14/10/2026 ═════════════════════════════════════════
--
-- A primeira versão olhava só `lead_mensagens.midia_url` e devolveu 454
-- "órfãos". Conferindo os exemplos ANTES de apagar, eram
-- `1/avatares/instagram-*.jpg`: as FOTOS DE PERFIL dos leads do Instagram,
-- apontadas por `leads.foto_url`. Apagar teria sumido com o rosto de todo
-- lead de Instagram do CRM.
--
-- Com as duas colunas, sobraram 48 órfãos reais (0,72 MB) — avatares de leads
-- que tinham sido apagados no mesmo dia.
--
-- ⚠ REGRA: toda coluna nova que passar a guardar mídia no bucket PRECISA
-- entrar no `not exists` abaixo. Senão esta conta volta a chamar de lixo o
-- que está em uso, e o erro é silencioso — ele se parece com uma limpeza
-- bem-sucedida.
--
-- Colunas que apontam para o bucket hoje:
--   lead_mensagens.midia_url .. anexo de conversa
--   leads.foto_url ............ avatar do contato
--
-- Prova de que a proteção está de pé: `npx tsx scripts/provar-retencao.mts`,
-- que roda a retenção com janela de zero dias e confere que nenhum avatar
-- aparece em nenhum caminho.

create or replace view public.storage_orfaos as
select
  o.name,
  o.created_at,
  (o.metadata->>'size')::bigint as bytes
from storage.objects o
where o.bucket_id = 'chat-midia'
  and not exists (
    select 1 from public.lead_mensagens m
    where m.midia_url like '%/chat-midia/%'
      and split_part(m.midia_url, '/chat-midia/', 2) = o.name
  )
  and not exists (
    select 1 from public.leads l
    where l.foto_url like '%/chat-midia/%'
      and split_part(l.foto_url, '/chat-midia/', 2) = o.name
  );

-- Nenhuma tela do CRM lê isto: só o service role, no servidor.
revoke all on public.storage_orfaos from anon, authenticated;
