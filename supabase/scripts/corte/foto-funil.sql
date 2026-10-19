-- =====================================================================================
-- CORTE: fotografia do funil, tirada no passo (b) e de novo no smoke (f) e na volta (g).
-- Tem de dar IGUAL antes e depois. Lê pela tabela/view leads, como as telas.
--
--   psql "<conexão>" -X -q -A -t -f foto-funil.sql -o funil-antes.txt   (e funil-depois.txt)
--   fc funil-antes.txt funil-depois.txt     (Windows)  /  diff (bash)
--
-- Agrupa por empresa e etapa, sem funil_id: no legado o funil padrão é funil_id nulo; no
-- core v1 vira o id do funil padrão — mesma tela, representação diferente.
-- Não lidas ficam de fora de propósito: no core v1 cada negócio de um contato fundido
-- mostra as não lidas do CONTATO (32 cards, 920 mensagens na cópia de 19/10) — decisão
-- pendente, ver 05-RUNBOOK-CORTE.md.
-- =====================================================================================
select l.empresa_id, l.kanban_status as etapa, count(*) as cards, sum(coalesce(l.valor_estimado, 0)) as valor
  from public.leads l
 where l.ativo
 group by 1, 2
 order by 1, 2;
