-- Lote 8 das views (05/11/2026), passo 2 de 2: cai a view `clientes`. Só com o app novo no ar
-- (lib/clientes.ts lê e grava contatos; nenhum leitor da view no app, Edge e scripts).
--
--   1. copia de novo os cinco campos da marca dados._cliente para dados (o que o app antigo
--      gravou entre o passo 1 e o deploy) e tira essas chaves da marca, que fica só com
--      cpf_validado, cnpj_validado, lead_id, usuario_id (e ids, do corte);
--   2. derruba a view e o gatilho INSTEAD OF (compat_clientes / compat_clientes_iud);
--   3. derruba fundir_clientes: a tela de Clientes funde pela core_fundir_contatos, com foto
--      para desfazer (lib/fusao-contatos.ts). Ela lia clientes, leads e lead_mensagens;
--   4. marcar_cliente_proprietario (gatilho de imoveis_imoveis) vira lógica do módulo Imóveis: grava
--      só o campo personalizado `proprietario` em contatos.dados (nada em coluna do core), e só em
--      empresa com o módulo ligado e o campo ativo. Sem o módulo, não grava nada.
--
-- As funções do ZapIntel (posvenda, insights) só têm 'clientes' como chave de JSON.
-- Volta: supabase/scripts/volta/volta-views-lote8.sql, junto com o Instant Rollback do app.

do $$
declare v_n int;
begin
  -- 1. cópia (o mesmo update do passo 1) e limpeza da marca
  update public.contatos c
     set dados = c.dados || coalesce((
       select jsonb_object_agg(x.k, x.v)
         from jsonb_each(jsonb_strip_nulls(jsonb_build_object(
                'tipo_cliente', case lower(c.dados #>> '{_cliente,tipo_cliente}')
                                  when 'novo' then 'Novo' when 'ativo' then 'Ativo' when 'vip' then 'VIP'
                                  when 'recorrente' then 'Recorrente' when 'inativo' then 'Inativo' end,
                'origem_cliente', case c.dados #>> '{_cliente,origem_cliente}'
                                    when 'loja_fisica' then 'Loja física' else c.dados #>> '{_cliente,origem_cliente}' end,
                'status_aprovacao', c.dados #> '{_cliente,status_aprovacao}',
                'proprietario', c.dados #> '{_cliente,proprietario}',
                'corretor_id', c.dados #> '{_cliente,corretor_id}'))) x(k, v)
        where exists (select 1 from public.campos_personalizados cp
                       where cp.empresa_id = c.empresa_id and cp.entidade = 'contato' and cp.chave = x.k and cp.ativo)), '{}'::jsonb)
   where c.dados ? '_cliente'
     and (c.dados -> '_cliente') ?| array['tipo_cliente', 'origem_cliente', 'status_aprovacao', 'proprietario', 'corretor_id'];

  update public.contatos c
     set dados = jsonb_set(c.dados, '{_cliente}',
                           (c.dados -> '_cliente') - 'tipo_cliente' - 'origem_cliente' - 'status_aprovacao' - 'proprietario' - 'corretor_id')
   where c.dados ? '_cliente'
     and (c.dados -> '_cliente') ?| array['tipo_cliente', 'origem_cliente', 'status_aprovacao', 'proprietario', 'corretor_id'];
  get diagnostics v_n = row_count;
  raise notice 'marcas limpas: %', v_n;

  -- Nenhum objeto do banco além do gatilho e dos defaults depende da view (conferido na produção:
  -- pg_depend, views, políticas, cron, funções de todos os schemas).
  if exists (select 1 from pg_depend d join pg_rewrite r on r.oid = d.objid
              where d.refobjid = 'public.clientes'::regclass and r.ev_class <> 'public.clientes'::regclass) then
    raise exception 'outra view depende de clientes';
  end if;
end $$;

-- 2. view e gatilho
drop view public.clientes;
drop function public.compat_clientes_iud();

-- 3. fusão antiga
drop function public.fundir_clientes(bigint, bigint, bigint);

-- 4. proprietário do imóvel, em contatos
create or replace function public.marcar_cliente_proprietario()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Lógica do módulo Imóveis: o imóvel aponta para o contato e o papel vai para o campo
  -- personalizado `proprietario` do módulo (lib/clientes.ts). Empresa sem o módulo ligado:
  -- nada é gravado (e, sem o campo, core_validar_dados recusaria a chave).
  if new.proprietario_id is not null
     and exists (select 1 from empresa_modulos m
                  where m.empresa_id = new.empresa_id and m.modulo = 'imoveis' and m.ativo) then
    update contatos
       set dados = dados || '{"proprietario": true}'::jsonb
     where id = new.proprietario_id and empresa_id = new.empresa_id
       and dados ? '_cliente'
       and (dados ->> 'proprietario') is distinct from 'true'
       and exists (select 1 from campos_personalizados cp
                    where cp.empresa_id = new.empresa_id and cp.entidade = 'contato'
                      and cp.chave = 'proprietario' and cp.ativo);
  end if;
  return new;
end $function$;
