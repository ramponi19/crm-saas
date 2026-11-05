-- Volta da 20261105001100_drop_view_clientes (lote 8): recria a view `clientes`, o gatilho
-- compat_clientes_iud, a fundir_clientes e a marcar_cliente_proprietario como estavam na
-- produção em 05/11/2026 (corpos lidos do banco; defaults e grants da view inclusos), e
-- devolve à marca dados._cliente os cinco campos que o app antigo lê de lá.
-- Junto: Instant Rollback do app para antes do lote 8. A 20261105001000 (campos) não precisa
-- voltar: o app antigo ignora os campos novos de dados.
begin;

-- 1. a marca volta a ter os cinco (os valores ficam também em dados; o gatilho antigo não os apaga)
update public.contatos c
   set dados = jsonb_set(c.dados, '{_cliente}', (c.dados -> '_cliente') || jsonb_strip_nulls(jsonb_build_object(
         'tipo_cliente', coalesce(c.dados ->> 'tipo_cliente', 'novo'),
         'origem_cliente', c.dados ->> 'origem_cliente',
         'status_aprovacao', coalesce(c.dados ->> 'status_aprovacao', 'pendente'),
         'proprietario', coalesce((c.dados ->> 'proprietario')::boolean, false),
         'corretor_id', c.dados ->> 'corretor_id')))
 where c.dados ? '_cliente';

-- 2. a view, com os defaults e os grants da produção
create view public.clientes with (security_invoker = true) as
 SELECT id,
    nome,
    email,
    telefone,
    cpf_cnpj,
    ((dados -> '_cliente'::text) ->> 'cpf_validado'::text)::boolean AS cpf_validado,
    ((dados -> '_cliente'::text) ->> 'cnpj_validado'::text)::boolean AS cnpj_validado,
    (dados ->> 'data_nascimento'::text)::date AS data_nascimento,
    endereco ->> 'logradouro'::text AS endereco,
    endereco ->> 'cidade'::text AS cidade,
    endereco ->> 'estado'::text AS estado,
    endereco ->> 'cep'::text AS cep,
    (dados -> '_cliente'::text) ->> 'tipo_cliente'::text AS tipo_cliente,
    instagram,
    (dados -> '_cliente'::text) ->> 'origem_cliente'::text AS origem_cliente,
    observacoes,
    ativo,
    ((dados -> '_cliente'::text) ->> 'usuario_id'::text)::uuid AS usuario_id,
    created_at,
    dados ->> 'estado_civil'::text AS estado_civil,
    dados ->> 'profissao'::text AS profissao,
    dados ->> 'nacionalidade'::text AS nacionalidade,
    endereco ->> 'numero'::text AS numero,
    endereco ->> 'complemento'::text AS complemento,
    endereco ->> 'bairro'::text AS bairro,
    empresa_id,
    ((dados -> '_cliente'::text) ->> 'lead_id'::text)::bigint AS lead_id,
    dados ->> 'tipo_negocio'::text AS tipo_negocio,
    COALESCE((dados -> '_cliente'::text) ->> 'status_aprovacao'::text, 'pendente'::text) AS status_aprovacao,
    ((dados -> '_cliente'::text) ->> 'corretor_id'::text)::uuid AS corretor_id,
    (dados ->> 'valor_pretendido'::text)::numeric AS valor_pretendido,
    dados ->> 'regiao_interesse'::text AS regiao_interesse,
    COALESCE(((dados -> '_cliente'::text) ->> 'proprietario'::text)::boolean, false) AS proprietario,
    filial_id
   FROM contatos c
  WHERE dados ? '_cliente'::text;
alter view public.clientes alter column cpf_validado set default false;
alter view public.clientes alter column cnpj_validado set default false;
alter view public.clientes alter column tipo_cliente set default 'novo'::text;
alter view public.clientes alter column origem_cliente set default 'loja_fisica'::text;
alter view public.clientes alter column ativo set default true;
alter view public.clientes alter column created_at set default now();
alter view public.clientes alter column status_aprovacao set default 'pendente'::text;
alter view public.clientes alter column proprietario set default false;
grant all on public.clientes to authenticated, service_role;

-- 3. o gatilho INSTEAD OF
CREATE OR REPLACE FUNCTION public.compat_clientes_iud()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

declare

  v_id bigint; v_e164 text; v_campos jsonb; v_cli jsonb; v_end jsonb;

begin

  if tg_op = 'DELETE' then

    perform compat_guarda(old.empresa_id);

    if exists (select 1 from negocios where contato_id = old.id) then

      update contatos set dados = dados - '_cliente' where id = old.id;

    else

      delete from contatos where id = old.id;

    end if;

    return old;

  end if;



  perform compat_guarda(new.empresa_id);

  v_e164 := core_telefone_e164(new.telefone);

  -- só grava campo personalizado que a empresa tem definido

  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_campos

    from jsonb_each(jsonb_strip_nulls(jsonb_build_object(

           'data_nascimento', to_char(new.data_nascimento, 'YYYY-MM-DD'), 'estado_civil', new.estado_civil,

           'profissao', new.profissao, 'nacionalidade', new.nacionalidade, 'tipo_negocio', new.tipo_negocio,

           'valor_pretendido', new.valor_pretendido, 'regiao_interesse', new.regiao_interesse))) x(k, v)

   where exists (select 1 from campos_personalizados cp where cp.empresa_id = new.empresa_id and cp.entidade = 'contato'

                   and cp.chave = x.k and cp.ativo);

  v_cli := jsonb_strip_nulls(jsonb_build_object(

    'cpf_validado', coalesce(new.cpf_validado, false), 'cnpj_validado', coalesce(new.cnpj_validado, false),

    'tipo_cliente', coalesce(new.tipo_cliente, 'novo'), 'origem_cliente', coalesce(new.origem_cliente, 'loja_fisica'),

    'usuario_id', new.usuario_id, 'status_aprovacao', coalesce(new.status_aprovacao, 'pendente'),

    'corretor_id', new.corretor_id, 'proprietario', coalesce(new.proprietario, false), 'lead_id', new.lead_id));

  v_end := jsonb_strip_nulls(jsonb_build_object('logradouro', new.endereco, 'numero', new.numero, 'complemento', new.complemento,

                                                'bairro', new.bairro, 'cidade', new.cidade, 'estado', new.estado, 'cep', new.cep));



  if tg_op = 'INSERT' then

    if v_e164 is not null then

      select id into v_id from contatos where empresa_id = new.empresa_id and telefone_e164 = v_e164;

    end if;

    if v_id is null and new.lead_id is not null then

      select contato_id into v_id from negocios where id = new.lead_id and empresa_id = new.empresa_id;

    end if;

    if v_id is null then

      insert into contatos (id, empresa_id, filial_id, nome, telefone, telefone_e164, email, cpf_cnpj, instagram, origem,

                            tipo, ativo, observacoes, endereco, dados, created_at)

      values (coalesce(new.id, nextval(pg_get_serial_sequence('public.contatos', 'id'))), new.empresa_id, new.filial_id, new.nome,

              new.telefone, v_e164, new.email, new.cpf_cnpj, new.instagram, new.origem_cliente,

              case when length(regexp_replace(coalesce(new.cpf_cnpj, ''), '\D', '', 'g')) = 14 then 'empresa' else 'pessoa' end,

              coalesce(new.ativo, true), new.observacoes, v_end, v_campos || jsonb_build_object('_cliente', v_cli),

              coalesce(new.created_at, now()))

      returning id into v_id;

    else

      update contatos c set nome = coalesce(c.nome, new.nome), email = coalesce(c.email, new.email),

             cpf_cnpj = coalesce(c.cpf_cnpj, new.cpf_cnpj), instagram = coalesce(c.instagram, new.instagram),

             telefone = coalesce(c.telefone, new.telefone), telefone_e164 = coalesce(c.telefone_e164, v_e164),

             endereco = v_end || c.endereco, dados = v_campos || c.dados || jsonb_build_object('_cliente', v_cli)

       where c.id = v_id;

    end if;

  else

    v_id := old.id;

    update contatos c set nome = new.nome, email = new.email, telefone = new.telefone,

           telefone_e164 = case when v_e164 is null or not exists (select 1 from contatos x where x.empresa_id = new.empresa_id

                                                                     and x.telefone_e164 = v_e164 and x.id <> old.id)

                                then v_e164 else c.telefone_e164 end,

           cpf_cnpj = new.cpf_cnpj, instagram = new.instagram, ativo = coalesce(new.ativo, true), observacoes = new.observacoes,

           filial_id = new.filial_id, endereco = v_end,

           dados = (c.dados - 'data_nascimento' - 'estado_civil' - 'profissao' - 'nacionalidade' - 'tipo_negocio'

                    - 'valor_pretendido' - 'regiao_interesse') || v_campos || jsonb_build_object('_cliente', v_cli)

     where c.id = old.id;

  end if;

  select cl.* into new from public.clientes cl where cl.id = v_id;

  return new;

end $function$;
revoke all on function public.compat_clientes_iud() from public, anon, authenticated;
grant execute on function public.compat_clientes_iud() to service_role;
create trigger compat_clientes instead of insert or delete or update on public.clientes
  for each row execute function public.compat_clientes_iud();

-- 4. a fusão antiga
CREATE OR REPLACE FUNCTION public.fundir_clientes(p_empresa bigint, p_principal bigint, p_secundario bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead_principal  bigint;
  v_lead_secundario bigint;
  v_nome_sec        text;
  v_cpf_sec         text;
  v_movidos         jsonb := '{}'::jsonb;
  v_n               integer;
begin
  if p_principal = p_secundario then
    raise exception 'O cliente principal e o secundário são o mesmo registro';
  end if;

  -- Os dois têm de ser DESTA empresa. A rota já confere o papel de quem chamou;
  -- aqui se confere de quem é o dado, que é a pergunta que a função pode responder.
  select lead_id into v_lead_principal from clientes where id = p_principal and empresa_id = p_empresa;
  if not found then raise exception 'Cliente principal não encontrado nesta empresa'; end if;

  select lead_id, nome, cpf_cnpj into v_lead_secundario, v_nome_sec, v_cpf_sec
    from clientes where id = p_secundario and empresa_id = p_empresa;
  if not found then raise exception 'Cliente secundário não encontrado nesta empresa'; end if;

  ---------------------------------------------------------------------------
  -- 1. A JORNADA (lead)
  ---------------------------------------------------------------------------
  if v_lead_principal is null and v_lead_secundario is not null then
    /*
     * Principal sem funil: em vez de apagar o lead do secundário, o principal HERDA
     * a jornada inteira. Nada precisa ser movido — só o vínculo muda de dono.
     * O `lead_id` do secundário é limpo antes para não bater no índice único.
     */
    update clientes set lead_id = null where id = p_secundario;
    update clientes set lead_id = v_lead_secundario where id = p_principal;
    v_lead_principal := v_lead_secundario;
    v_lead_secundario := null;
    v_movidos := v_movidos || jsonb_build_object('jornada_herdada', true);

  elsif v_lead_principal is not null and v_lead_secundario is not null then
    -- Cadência: a mesma cadência ativa nos dois leads bateria no índice único.
    -- A inscrição do secundário é descartada; a do principal já está andando.
    delete from cadencia_inscricoes s
     where s.lead_id = v_lead_secundario
       and s.status = 'ativa'
       and exists (
         select 1 from cadencia_inscricoes p
          where p.lead_id = v_lead_principal and p.cadencia_id = s.cadencia_id and p.status = 'ativa'
       );
    update cadencia_inscricoes set lead_id = v_lead_principal where lead_id = v_lead_secundario;

    -- Perfil de busca é UM por lead: fica o do principal, se já existir.
    if exists (select 1 from imoveis_perfis_busca where lead_id = v_lead_principal) then
      delete from imoveis_perfis_busca where lead_id = v_lead_secundario;
    else
      update imoveis_perfis_busca set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    end if;

    update lead_mensagens        set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('mensagens', v_n);
    update chamadas              set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('chamadas', v_n);
    get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('transferencias', v_n);
    update tarefas               set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('tarefas', v_n);
    update visitas               set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update imoveis_negocios set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update assistencia_orcamentos            set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update vendas_propostas             set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update vendas_fichas_financiamento  set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update avaliacao_usados     set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update rastreamento_eventos  set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update rastreamento_visitas  set lead_id = v_lead_principal where lead_id = v_lead_secundario;
    update estoque_unidades   set reservado_lead_id = v_lead_principal where reservado_lead_id = v_lead_secundario;

    -- Agora o lead secundário está vazio e pode sair.
    update clientes set lead_id = null where id = p_secundario;
    delete from leads where id = v_lead_secundario and empresa_id = p_empresa;
    v_movidos := v_movidos || jsonb_build_object('lead_removido', v_lead_secundario);
  end if;

  ---------------------------------------------------------------------------
  -- 2. O QUE PENDURA NO CLIENTE
  ---------------------------------------------------------------------------
  if exists (select 1 from imoveis_perfis_busca where cliente_id = p_principal) then
    delete from imoveis_perfis_busca where cliente_id = p_secundario;
  else
    update imoveis_perfis_busca set cliente_id = p_principal where cliente_id = p_secundario;
  end if;

  update vendas_vendas                set cliente_id = p_principal where cliente_id = p_secundario;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('vendas', v_n);
  update imoveis_negocios set cliente_id = p_principal where cliente_id = p_secundario;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('negocios', v_n);
  update visitas               set cliente_id = p_principal where cliente_id = p_secundario;
  get diagnostics v_n = row_count; v_movidos := v_movidos || jsonb_build_object('compromissos', v_n);
  update assistencia_orcamentos            set cliente_id = p_principal where cliente_id = p_secundario;
  update financeiro_cobrancas             set cliente_id = p_principal where cliente_id = p_secundario;
  update vendas_contratos       set cliente_id = p_principal where cliente_id = p_secundario;
  update assistencia_garantias set cliente_id = p_principal where cliente_id = p_secundario;
  update estoque_unidades   set cliente_id = p_principal where cliente_id = p_secundario;
  update leads                 set convertido_em = p_principal where convertido_em = p_secundario;

  ---------------------------------------------------------------------------
  -- 3. COMPLETAR O QUE FALTA NO PRINCIPAL
  --
  -- Só campo VAZIO é preenchido: o principal é quem fica, e sobrescrever dado dele
  -- com o do duplicado seria decidir por quem fundiu. Duplicado costuma ter
  -- justamente o pedaço que falta no outro (o CPF que alguém digitou depois).
  ---------------------------------------------------------------------------
  update clientes p set
    telefone         = coalesce(p.telefone, s.telefone),
    email            = coalesce(p.email, s.email),
    cpf_cnpj         = coalesce(p.cpf_cnpj, s.cpf_cnpj),
    data_nascimento  = coalesce(p.data_nascimento, s.data_nascimento),
    endereco         = coalesce(p.endereco, s.endereco),
    numero           = coalesce(p.numero, s.numero),
    bairro           = coalesce(p.bairro, s.bairro),
    cidade           = coalesce(p.cidade, s.cidade),
    estado           = coalesce(p.estado, s.estado),
    cep              = coalesce(p.cep, s.cep),
    instagram        = coalesce(p.instagram, s.instagram),
    profissao        = coalesce(p.profissao, s.profissao),
    estado_civil     = coalesce(p.estado_civil, s.estado_civil),
    tipo_negocio     = coalesce(p.tipo_negocio, s.tipo_negocio),
    corretor_id      = coalesce(p.corretor_id, s.corretor_id),
    valor_pretendido = coalesce(p.valor_pretendido, s.valor_pretendido),
    regiao_interesse = coalesce(p.regiao_interesse, s.regiao_interesse),
    -- Rastro da fusão: sem isto, o registro que sobrou não conta que houve fusão, e
    -- ninguém entende por que o histórico tem duas conversas começando do zero.
    observacoes = trim(both E'\n' from
      coalesce(p.observacoes, '') || E'\n' ||
      'Fundido com "' || coalesce(s.nome, '?') || '"' ||
      coalesce(' (CPF ' || s.cpf_cnpj || ')', '') ||
      ' em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || '.' ||
      coalesce(E'\nObservação do registro fundido: ' || s.observacoes, ''))
  from clientes s
  where p.id = p_principal and s.id = p_secundario;

  delete from clientes where id = p_secundario and empresa_id = p_empresa;

  return jsonb_build_object('ok', true, 'principal', p_principal, 'removido', p_secundario,
                            'nome_removido', v_nome_sec, 'movidos', v_movidos);
end;
$function$;
revoke all on function public.fundir_clientes(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.fundir_clientes(bigint, bigint, bigint) to service_role;

-- 5. o proprietário pela view
CREATE OR REPLACE FUNCTION public.marcar_cliente_proprietario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

begin

  if new.proprietario_id is not null then

    update clientes set proprietario = true

     where id = new.proprietario_id and empresa_id = new.empresa_id and proprietario is not true;

  end if;

  return new;

end $function$;

commit;
