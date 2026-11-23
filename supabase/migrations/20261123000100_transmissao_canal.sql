-- A TRANSMISSÃO GUARDA O NÚMERO QUE ENVIA (23/11/2026, item 5 do levantamento de multinúmero).
--
-- Até aqui a transmissão saía pelo "WhatsApp da loja" — o conectado por último naquela loja
-- (canalDaLoja na Edge, whatsapp_waba_da_loja aqui). Com dois números na MESMA loja, toda lista
-- sairia pelo mais recente e a aprovação do modelo seria conferida na WABA dele, não na do
-- número que o lojista tinha em mente.
--
-- Agora:
--   transmissoes.canal_id         o número escolhido na criação (nulo = transmissão antiga: a
--                                 regra de antes continua valendo para ela);
--   transmissoes_canal_valido     gatilho: o número é WhatsApp, ativo, desta empresa e da loja da
--                                 transmissão ou da rede — vale para qualquer caminho de gravação;
--   modelo_aprovado_no_canal      aprovado NA WABA daquele número;
--   transmissao_montar            com número: confere o número e a aprovação nele; sem número,
--                                 exatamente como antes (modelo_aprovado_na_loja).
-- A Edge (envioTransmissao) envia pelo canal_id, conferido de novo (empresa, loja do negócio,
-- WhatsApp, ativo).
--
-- Volta: supabase/scripts/volta/volta-transmissao-canal.sql (app antes da volta).

alter table public.transmissoes
  add column if not exists canal_id bigint references public.canais(id) on delete set null;
create index if not exists transmissoes_canal_idx on public.transmissoes (canal_id) where canal_id is not null;
comment on column public.transmissoes.canal_id is
  'Número de WhatsApp que envia (23/11/2026). Nulo = transmissão anterior: sai pelo WhatsApp da loja.';

create or replace function public.transmissoes_canal_valido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c canais%rowtype;
begin
  if new.canal_id is null then return new; end if;
  select * into c from canais where id = new.canal_id;
  if not found or c.empresa_id is distinct from new.empresa_id then
    raise exception 'este número não é desta empresa' using errcode = '42501';
  end if;
  if c.tipo <> 'whatsapp' then
    raise exception 'a transmissão sai por um número de WhatsApp' using errcode = '22023';
  end if;
  if c.filial_id is not null and new.filial_id is not null and c.filial_id <> new.filial_id then
    raise exception 'este número atende outra loja' using errcode = '22023';
  end if;
  -- Ativo só se exige ao ESCOLHER: o número cair depois não pode travar pausar/encerrar.
  if (tg_op = 'INSERT' or new.canal_id is distinct from old.canal_id) and c.status <> 'ativo' then
    raise exception 'este número está desconectado' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function public.transmissoes_canal_valido() from public, anon, authenticated;

drop trigger if exists transmissoes_canal_valido on public.transmissoes;
create trigger transmissoes_canal_valido before insert or update of canal_id, filial_id, empresa_id on public.transmissoes
  for each row execute function public.transmissoes_canal_valido();

create or replace function public.modelo_aprovado_no_canal(p_empresa bigint, p_modelo bigint, p_canal bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from canais c
      join modelos_mensagem_wabas w
        on w.empresa_id = c.empresa_id and w.waba_id = c.waba_id
     where c.id = p_canal and c.empresa_id = p_empresa and c.tipo = 'whatsapp'
       and w.modelo_id = p_modelo and w.status = 'aprovado');
$$;
revoke all on function public.modelo_aprovado_no_canal(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.modelo_aprovado_no_canal(bigint, bigint, bigint) to service_role;

-- Transmissão: a lista só congela se o modelo está aprovado NO NÚMERO que envia.
create or replace function public.transmissao_montar(p_transmissao bigint)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t transmissoes%rowtype;
  v_emp bigint := get_empresa_id();
  v_n int;
begin
  select * into t from transmissoes where id = p_transmissao for update;
  if not found or t.empresa_id is distinct from v_emp or not is_empresa_admin(v_emp) then
    raise exception 'transmissão não encontrada ou sem permissão' using errcode = '42501';
  end if;
  if t.status <> 'rascunho' then
    raise exception 'a transmissão já foi disparada' using errcode = '22023';
  end if;
  if not transmissao_loja_ok(v_emp, t.filial_id) then
    raise exception 'loja inválida para esta empresa' using errcode = '42501';
  end if;
  if t.canal_id is not null then
    if not exists (select 1 from canais where id = t.canal_id and empresa_id = v_emp and tipo = 'whatsapp' and status = 'ativo') then
      raise exception 'o número escolhido para esta transmissão está desconectado' using errcode = '22023';
    end if;
    if not modelo_aprovado_no_canal(v_emp, t.modelo_id, t.canal_id) then
      raise exception 'o modelo não está aprovado no número escolhido' using errcode = '22023';
    end if;
  elsif not modelo_aprovado_na_loja(v_emp, t.modelo_id, t.filial_id, false) then
    raise exception 'o modelo não está aprovado no WhatsApp desta loja' using errcode = '22023';
  end if;
  insert into transmissao_envios (empresa_id, filial_id, transmissao_id, contato_id, negocio_id, modelo_id, telefone, status, motivo)
  select v_emp, t.filial_id, t.id, p.contato_id, p.negocio_id, t.modelo_id, p.telefone,
         case when p.fora is null then 'pendente' else 'pulada' end,
         case p.fora when 'opt_out' then 'contato pediu para não receber (opt-out)'
                     when 'bloqueado' then 'contato bloqueado'
                     when 'sem_telefone' then 'contato sem telefone'
                     when 'modelo_7_dias' then 'este contato já recebeu este modelo nos últimos 7 dias' end
    from transmissao_publico(v_emp, t.filial_id, t.filtro, t.modelo_id) p
  on conflict (transmissao_id, contato_id) do nothing;
  get diagnostics v_n = row_count;
  -- Ninguém apto: não nasce transmissão vazia (o erro desfaz a lista inteira).
  if not exists (select 1 from transmissao_envios where transmissao_id = t.id and status = 'pendente') then
    raise exception 'ninguém na lista pode receber (todos fora ou lista vazia)' using errcode = '22023';
  end if;
  update transmissoes set total = v_n where id = t.id;
  return v_n;
end $$;
revoke all on function public.transmissao_montar(bigint) from public, anon;
grant execute on function public.transmissao_montar(bigint) to authenticated, service_role;

notify pgrst, 'reload schema';
