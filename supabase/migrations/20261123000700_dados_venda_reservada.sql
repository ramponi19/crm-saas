-- Entrega A do pós-venda, correção (23/11/2026): `negocios.dados.venda` é chave de SISTEMA.
--
-- O gatilho core_validar_dados recusa em `dados` toda chave que não seja campo personalizado ativo
-- (ou que não comece com "_"). A rota /api/leads/mover grava `dados.venda` ao entrar no ganho, então
-- marcar venda falhava com "campo personalizado desconhecido: negocio.venda" (achado antes de qualquer
-- uso: nenhuma chamada à rota entre o deploy e esta correção).
--
-- A correção: em negócio, `venda` passa a ser reservada. Não é campo personalizado (não aparece no
-- formulário de campos) e tem forma conferida aqui: objeto; `data` no formato AAAA-MM-DD;
-- `condicao` novo ou seminovo; `categoria_id` e `valor` numéricos. Contato e item seguem iguais.
--
-- Guarda: só troca se o corpo em produção for o conhecido (md5 abaixo).
-- Volta: supabase/scripts/volta/volta-dados-venda-reservada.sql
-- Teste: supabase/scripts/testes/teste-dados-venda-reservada.sql

do $$
begin
  if (select md5(prosrc) from pg_proc where proname = 'core_validar_dados' and pronamespace = 'public'::regnamespace)
     is distinct from 'fb1fdf869fdeb161f019edc4802e91e1' then
    raise exception 'core_validar_dados mudou desde a conferência de 23/11/2026; revise antes de aplicar';
  end if;
end $$;

create or replace function public.core_validar_dados() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_entidade text := tg_argv[0];
  r record;
  c record;
begin
  if new.dados is null or jsonb_typeof(new.dados) <> 'object' then
    raise exception 'dados precisa ser um objeto jsonb' using errcode = '22023';
  end if;
  for r in select key, value from jsonb_each(new.dados) loop
    continue when left(r.key, 1) = '_';
    -- Chave de sistema: os dados da venda (Entrega A do pós-venda). Forma conferida aqui.
    if v_entidade = 'negocio' and r.key = 'venda' then
      continue when jsonb_typeof(r.value) = 'null';
      if jsonb_typeof(r.value) <> 'object'
         or (r.value ? 'data' and jsonb_typeof(r.value -> 'data') <> 'null'
             and (jsonb_typeof(r.value -> 'data') <> 'string' or (r.value ->> 'data') !~ '^\d{4}-\d{2}-\d{2}$'))
         or (r.value ? 'condicao' and jsonb_typeof(r.value -> 'condicao') <> 'null'
             and (r.value ->> 'condicao') not in ('novo', 'seminovo'))
         or (r.value ? 'categoria_id' and jsonb_typeof(r.value -> 'categoria_id') not in ('number', 'null'))
         or (r.value ? 'valor' and jsonb_typeof(r.value -> 'valor') not in ('number', 'null')) then
        raise exception 'valor inválido para negocio.venda' using errcode = '22023';
      end if;
      continue;
    end if;
    select cp.tipo, cp.opcoes into c
      from campos_personalizados cp
     where cp.empresa_id = new.empresa_id and cp.entidade = v_entidade and cp.chave = r.key and cp.ativo;
    if not found then
      raise exception 'campo personalizado desconhecido: %.%', v_entidade, r.key using errcode = '22023';
    end if;
    continue when jsonb_typeof(r.value) = 'null';
    if (c.tipo in ('numero', 'moeda') and jsonb_typeof(r.value) <> 'number')
       or (c.tipo = 'booleano' and jsonb_typeof(r.value) <> 'boolean')
       or (c.tipo in ('texto', 'data', 'opcao') and jsonb_typeof(r.value) <> 'string')
       or (c.tipo = 'multi' and jsonb_typeof(r.value) <> 'array')
       or (c.tipo = 'data' and (r.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}')
       or (c.tipo = 'opcao' and jsonb_array_length(c.opcoes) > 0 and not c.opcoes @> jsonb_build_array(r.value))
       or (c.tipo = 'multi' and jsonb_array_length(c.opcoes) > 0 and not c.opcoes @> r.value) then
      raise exception 'valor inválido para %.% (tipo %)', v_entidade, r.key, c.tipo using errcode = '22023';
    end if;
  end loop;
  return new;
end
$$;
