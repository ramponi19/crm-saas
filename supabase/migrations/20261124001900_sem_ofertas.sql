-- "NÃO QUERO RECEBER OFERTAS" (Lucas, 24/11/2026). Universal; separado do opt-out.
--
-- `contatos.opt_out_em` (Automatize, 05/11) desliga TUDO o que sai sozinho para o contato. `contatos.sem_ofertas_em`
-- desliga só o de MARKETING: o cliente continua recebendo os avisos da compra (Utilidade).
--
--   core_sem_ofertas_aplicar(empresa, contato, ligar, origem)  marca (ou desfaz) o contato e os outros contatos da
--       mesma empresa com o mesmo telefone (o cliente das duas lojas é o mesmo). Ao marcar, os passos PENDENTES do
--       pós-venda com modelo de Marketing desses contatos viram `pulado` ("cliente não quer ofertas").
--   gatilho posvenda_acompanhamentos_sem_ofertas  passo novo com modelo de Marketing para contato marcado já nasce
--       `pulado` (as jornadas seguintes não oferecem nada).
--   core_sem_ofertas_pelo_botao(mensagem)  a Edge chama logo depois de gravar a mensagem recebida: se é WhatsApp e o
--       texto é um dos botões configurados (`core.sem_ofertas.botoes`, padrão "Não quero receber ofertas"), marca e
--       devolve a confirmação (`core.sem_ofertas.confirmacao`, padrão do Nexus) para a Edge enviar na hora — a janela
--       de 24 h acabou de abrir com o toque. Só confirma na primeira vez.
--   contato_sem_ofertas(contato, ligar)  a equipe marca a pedido do cliente (qualquer pessoa da empresa); desfazer,
--       só dono ou administrador.
-- Transmissão e Automatize pulam o contato marcado quando o modelo é de Marketing (lib/transmissao/motor.ts,
-- lib/automacoes.ts).
--
-- Volta: supabase/scripts/volta/volta-sem-ofertas.sql
-- Teste: supabase/scripts/testes/teste-sem-ofertas.sql

alter table public.contatos add column if not exists sem_ofertas_em timestamptz;
alter table public.contatos add column if not exists sem_ofertas_origem text;
comment on column public.contatos.sem_ofertas_em is 'Pediu para não receber OFERTAS (modelos de Marketing). Avisos de Utilidade continuam. Nulo = recebe.';

-- O texto que o Nexus manda quando o cliente toca o botão (a empresa troca em Configurações › Pós-venda).
create or replace function public.core_sem_ofertas_confirmacao_padrao()
returns text language sql immutable as $$
  select 'Pronto, {{nome}}: você não vai mais receber ofertas da nossa loja. Os avisos sobre a sua compra continuam chegando.'
$$;

create or replace function public.core_sem_ofertas_aplicar(p_empresa bigint, p_contato bigint, p_ligar boolean, p_origem text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_tel text; v_ids bigint[]; v_pulados int := 0;
begin
  select telefone_e164 into v_tel from public.contatos where id = p_contato and empresa_id = p_empresa;
  if not found then raise exception using errcode = 'P0002', message = 'CONTATO_NAO_ENCONTRADO'; end if;
  select array_agg(id) into v_ids from public.contatos
   where empresa_id = p_empresa and (id = p_contato or (v_tel is not null and telefone_e164 = v_tel));

  if p_ligar then
    update public.contatos set sem_ofertas_em = now(), sem_ofertas_origem = left(p_origem, 200)
     where id = any(v_ids) and sem_ofertas_em is null;
    update public.posvenda_acompanhamentos a
       set status = 'pulado', motivo = 'cliente não quer ofertas', feito_em = now()
      from public.posvenda_cadencia_passos pp, public.modelos_mensagem m
     where a.empresa_id = p_empresa and a.contato_id = any(v_ids) and a.status = 'pendente'
       and pp.id = a.passo_id and m.id = pp.modelo_id and m.categoria = 'MARKETING';
    get diagnostics v_pulados = row_count;
  else
    update public.contatos set sem_ofertas_em = null, sem_ofertas_origem = left(p_origem, 200) where id = any(v_ids);
  end if;
  return jsonb_build_object('contatos', cardinality(v_ids), 'passos_pulados', v_pulados);
end $$;

-- Passo novo de Marketing para quem não quer ofertas já nasce pulado.
create or replace function public.posvenda_sem_ofertas_no_passo()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'pendente'
     and exists (select 1 from public.contatos c where c.id = new.contato_id and c.sem_ofertas_em is not null)
     and exists (select 1 from public.posvenda_cadencia_passos pp join public.modelos_mensagem m on m.id = pp.modelo_id
                  where pp.id = new.passo_id and m.categoria = 'MARKETING') then
    new.status := 'pulado'; new.motivo := 'cliente não quer ofertas'; new.feito_em := now();
  end if;
  return new;
end $$;
drop trigger if exists posvenda_acompanhamentos_sem_ofertas on public.posvenda_acompanhamentos;
create trigger posvenda_acompanhamentos_sem_ofertas before insert on public.posvenda_acompanhamentos
  for each row execute function public.posvenda_sem_ofertas_no_passo();

-- A Edge, depois de gravar a mensagem recebida. Texto comparado sem acento, caixa e espaços das pontas.
create or replace function public.core_sem_ofertas_pelo_botao(p_mensagem bigint)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  m record; cfg jsonb; v_botoes text[]; v_texto text; v_ja timestamptz; v_nome text; v_tel text; v_neg bigint; v_conf text;
  norm text;
begin
  select ms.id, ms.empresa_id, ms.contato_id, ms.conteudo, ms.direcao, k.tipo canal_tipo
    into m from public.mensagens ms left join public.canais k on k.id = ms.canal_id where ms.id = p_mensagem;
  if m.id is null or m.direcao <> 'recebida' or m.canal_tipo is distinct from 'whatsapp' or m.contato_id is null then
    return jsonb_build_object('marcado', false);
  end if;
  cfg := public.config_valor_emp(m.empresa_id, 'core', 'sem_ofertas');
  v_botoes := coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(cfg -> 'botoes') = 'array' then cfg -> 'botoes' end) x),
                       array['Não quero receber ofertas']);
  norm := lower(regexp_replace(translate(btrim(coalesce(m.conteudo, '')), 'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucAAAAEEIOOOUUC'), '\s+', ' ', 'g'));
  if not exists (select 1 from unnest(v_botoes) b
                  where lower(regexp_replace(translate(btrim(b), 'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucAAAAEEIOOOUUC'), '\s+', ' ', 'g')) = norm) then
    return jsonb_build_object('marcado', false);
  end if;

  select sem_ofertas_em, nome, coalesce(telefone_e164, telefone) into v_ja, v_nome, v_tel from public.contatos where id = m.contato_id;
  perform public.core_sem_ofertas_aplicar(m.empresa_id, m.contato_id, true, 'botão no WhatsApp (mensagem ' || m.id || ')');
  if v_ja is not null then return jsonb_build_object('marcado', true, 'ja_estava', true); end if;

  select id into v_neg from public.negocios where contato_id = m.contato_id and empresa_id = m.empresa_id order by updated_at desc nulls last, id desc limit 1;
  v_texto := coalesce(nullif(btrim(cfg ->> 'confirmacao'), ''), public.core_sem_ofertas_confirmacao_padrao());
  v_conf := btrim(regexp_replace(replace(v_texto, '{{nome}}', coalesce(split_part(btrim(coalesce(v_nome, '')), ' ', 1), '')), '\s+([,.!?:])', '\1', 'g'));
  return jsonb_build_object('marcado', true, 'ja_estava', false, 'confirmacao', v_conf, 'telefone', v_tel, 'negocio_id', v_neg);
end $$;

-- A equipe, a pedido do cliente. Marcar: qualquer pessoa da empresa. Desfazer: dono ou administrador.
create or replace function public.contato_sem_ofertas(p_contato bigint, p_ligar boolean)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_emp bigint := public.get_empresa_id();
begin
  if v_emp is null or not exists (select 1 from public.contatos where id = p_contato and empresa_id = v_emp) then
    raise exception using errcode = 'P0002', message = 'NAO_ENCONTRADO';
  end if;
  if not public.sessao_pode_escrever() then raise exception using errcode = '42501', message = 'SOMENTE_LEITURA'; end if;
  if not p_ligar and not public.is_empresa_admin(v_emp) then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO: só o dono ou um administrador volta a enviar ofertas.';
  end if;
  return public.core_sem_ofertas_aplicar(v_emp, p_contato, p_ligar,
    case when p_ligar then 'marcado pela equipe' else 'desfeito pela equipe' end || ' (' || coalesce(auth.uid()::text, 'servidor') || ')');
end $$;

do $$
declare f text;
begin
  foreach f in array array['core_sem_ofertas_aplicar(bigint,bigint,boolean,text)', 'posvenda_sem_ofertas_no_passo()',
                           'core_sem_ofertas_pelo_botao(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  execute 'revoke all on function public.contato_sem_ofertas(bigint,boolean) from public, anon';
  execute 'grant execute on function public.contato_sem_ofertas(bigint,boolean) to authenticated, service_role';
end $$;
