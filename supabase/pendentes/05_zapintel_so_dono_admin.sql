-- PENDENTE — APLICAR SÓ COM AUTORIZAÇÃO DO LUCAS.
--
-- Decisão de 15/10/2026: *"vendedor deve ser bloqueado, só dono, admin e
-- superadmin"*. As telas do ZapIntel chamam as funções do banco DIRETO do
-- navegador (zapintel_dashboard, _leads_lista, _insights, _atendimento,
-- _posvenda, _resumo, _conversa, _dashboard_lista) — todas passam por
-- `zapintel_escopo`. Hoje, para quem não é dono/admin, ela devolve as lojas do
-- usuário (filiais_visiveis); passa a recusar com o mesmo código de "sem
-- acesso" (42501) que as telas já tratam.
--
-- O código (app/zapintel/layout.tsx e lib/zapintel/ctx.ts) já bloqueia sem
-- depender disto; esta migração fecha o caminho de quem chamar a API do banco
-- com a própria sessão.
--
-- Pré-condição: a função ainda tem o ramo antigo (`v_lojas := filiais_visiveis();`).
-- VOLTA ATRÁS: 05_zapintel_so_dono_admin.volta.sql.
set local lock_timeout = '5s';

do $$
declare d text;
  o text := $q$  else
    v_lojas := filiais_visiveis();
  end if;$q$;
  n text := $q$  else
    -- 15/10/2026: o ZapIntel é do dono, do admin e do superadmin.
    raise exception 'ZapIntel restrito ao dono e aos administradores' using errcode = '42501';
  end if;$q$;
begin
  d := pg_get_functiondef('public.zapintel_escopo(bigint,bigint)'::regprocedure);
  if position(o in d) = 0 then raise exception '05: zapintel_escopo não está no estado esperado — nada foi alterado'; end if;
  execute replace(d, o, n);
end $$;
