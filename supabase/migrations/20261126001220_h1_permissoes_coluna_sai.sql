-- 1.1h PARTE 2, H1c: sai a coluna `empresas.permissoes` e a função da ponte. SÓ 1 dia depois da H1b (20261126001210),
-- conferido nos logs que ninguém mais leu/gravou a coluna. DDL em `empresas`, sozinha, com lock_timeout.
-- O conteúdo está em _backup_empresas_permissoes_1_1h. Volta: recriar a coluna e preencher do backup
-- (supabase/scripts/volta/volta-h1-permissoes.sql, parte 2).

set local lock_timeout = '5s';

-- cargos_semear (cargos da empresa nova) lia a coluna para herdar a tela antiga; empresa nova nasce com ela nula.
CREATE OR REPLACE FUNCTION public.cargos_semear(p_empresa bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_perm jsonb := '{}'::jsonb;  -- 1.1h H1c: empresas.permissoes saiu; empresa nova nascia com a coluna nula (= '{}')
  c record;
  k record;
  v_id bigint;
  v_val boolean;
begin
  insert into public.empresa_cargos (empresa_id, nome, descricao, sistema, papel_base, somente_leitura) values
    (p_empresa, 'Dono', 'Acesso total. Não pode ser editado nem apagado; a empresa sempre tem pelo menos um Dono.', true, 'owner', false),
    (p_empresa, 'Administrador', 'Administra a empresa: configurações, equipe, relatórios e custo.', false, 'admin', false),
    (p_empresa, 'Vendedor', 'Atende e vende. Vê os próprios leads e vendas.', false, 'vendedor', false),
    (p_empresa, 'Técnico', 'Assistência e ordens de serviço.', false, 'tecnico', false),
    (p_empresa, 'Consulta', 'Só leitura, sem custo. Para contas de acompanhamento.', false, 'vendedor', true)
  on conflict (empresa_id, nome) do nothing;

  for c in select id, nome, papel_base, sistema, somente_leitura from public.empresa_cargos where empresa_id = p_empresa loop
    if c.sistema then continue; end if;
    if exists (select 1 from public.empresa_cargo_permissoes where cargo_id = c.id) then continue; end if;
    for k in select * from (values
        ('core.ver_financeiro', 'verFinanceiro'), ('core.ver_relatorios', 'verRelatorios'),
        ('core.ver_leads_outros', 'verLeadsOutros'), ('core.ver_vendas_outros', 'verVendasOutros'),
        ('core.excluir', 'excluir'), ('core.exportar', 'exportar')) t(chave, antiga) loop
      if c.somente_leitura then
        v_val := k.chave in ('core.ver_leads_outros', 'core.ver_vendas_outros', 'core.ver_relatorios');
      else
        v_val := coalesce((v_perm -> c.papel_base ->> k.antiga)::boolean,
          case c.papel_base
            when 'admin' then true
            when 'tecnico' then k.antiga = 'verLeadsOutros'
            else false end);
      end if;
      if v_val then
        insert into public.empresa_cargo_permissoes (cargo_id, empresa_id, permissao) values (c.id, p_empresa, k.chave)
        on conflict do nothing;
      end if;
    end loop;
    if c.papel_base = 'admin' and not c.somente_leitura then
      insert into public.empresa_cargo_permissoes (cargo_id, empresa_id, permissao)
      select c.id, p_empresa, chave from public.permissoes_catalogo
       where chave in ('lojas.ver_rede', 'config.editar', 'equipe.cargos', 'auditoria.ver', 'estoque.ver_custo', 'estoque.preco_variante', 'estoque.preco_proprio')
      on conflict do nothing;
    elsif c.somente_leitura then
      insert into public.empresa_cargo_permissoes (cargo_id, empresa_id, permissao) values (c.id, p_empresa, 'lojas.ver_rede')
      on conflict do nothing;
    end if;
  end loop;
end $function$;

drop trigger if exists empresas_permissoes_ponte on public.empresas;
drop function if exists public.empresas_permissoes_ponte();
alter table public.empresas drop column if exists permissoes;
