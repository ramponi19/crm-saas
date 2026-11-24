-- core_validar_dados CONFERE SÓ O QUE MUDOU (prioridade 2 do Lucas, 23/11/2026; docs/design-pos-venda.md §8.7).
--
-- Antes: a cada gravação de `dados` o gatilho conferia TODAS as chaves. Um campo personalizado desligado ou
-- apagado (o aplicarPreset com `substituir` apaga os campos de módulo) com valor já gravado travava QUALQUER
-- gravação daquele negócio ou contato — inclusive marcar a venda, que regrava o `dados` inteiro.
-- Agora:
--   - UPDATE na mesma empresa: só as chaves NOVAS ou com valor DIFERENTE do anterior são conferidas; a que
--     ficou igual passa (já foi conferida quando entrou);
--   - INSERT, ou troca de empresa_id: tudo é conferido, como antes (os campos são os da empresa nova);
--   - `negocio.produto_interessado`: campo do core que várias rotas gravam sem perguntar se ele está ligado
--     (criar lead, reserva, portais). Com o campo ativo, vale a regra dele; desligado ou ausente, aceita
--     texto (ou nulo) em vez de derrubar a criação do lead, e recusa outro tipo;
--   - `negocio.venda` (0700) e as chaves com "_" seguem iguais.
--
-- Guarda: só troca se o corpo em produção for o da 0700 (md5 sem \r).
-- Volta: supabase/scripts/volta/volta-validar-dados-so-o-que-mudou.sql
-- Teste: supabase/scripts/testes/teste-validar-dados-so-o-que-mudou.sql (+ esperado em supabase/scripts/teste-local/esperado)

do $$
begin
  if (select md5(replace(prosrc, E'\r', '')) from pg_proc where proname = 'core_validar_dados' and pronamespace = 'public'::regnamespace)
     is distinct from '4fb49d55a4f77243564c4933d9f99669' then
    raise exception 'core_validar_dados não é o da 0700 (dados_venda_reservada); revise antes de aplicar';
  end if;
end $$;

create or replace function public.core_validar_dados() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_entidade text := tg_argv[0];
  v_so_mudou boolean;
  r record;
  c record;
begin
  if new.dados is null or jsonb_typeof(new.dados) <> 'object' then
    raise exception 'dados precisa ser um objeto jsonb' using errcode = '22023';
  end if;
  -- Só o que mudou: UPDATE na mesma empresa, com o dados anterior em forma de objeto.
  v_so_mudou := tg_op = 'UPDATE' and old.empresa_id is not distinct from new.empresa_id
                and old.dados is not null and jsonb_typeof(old.dados) = 'object';
  for r in select key, value from jsonb_each(new.dados) loop
    continue when left(r.key, 1) = '_';
    continue when v_so_mudou and (old.dados -> r.key) is not distinct from r.value;
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
      -- Produto de interesse com o campo desligado ou ausente: texto livre, não derruba quem grava.
      if v_entidade = 'negocio' and r.key = 'produto_interessado' then
        if jsonb_typeof(r.value) not in ('string', 'null') then
          raise exception 'valor inválido para negocio.produto_interessado (texto)' using errcode = '22023';
        end if;
        continue;
      end if;
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
