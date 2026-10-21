-- =====================================================================================
-- 1.4 (sincronização, roda ANTES do deploy): as 18 colunas obsoletas de empresas passam a ser
-- lidas das tabelas 1:1 do core. O corte (20/10) copiou uma vez e ninguém leu nem gravou nelas
-- depois; esta migração copia de novo, por cima, e não apaga nada.
--
--   segmento                                   -> empresas.preset_onboarding (o app lê com alias)
--   wl_cor, wl_logo_url, wl_slogan, wl_whatsapp,
--   wl_menu                                    -> empresa_branding (cor, logo_url, slogan,
--                                                 whatsapp, sidebar)
--   representante_* (5), banco_* (4)           -> empresa_dados_contrato
--   menu_override, menu_config, modulos_override -> empresa_menu / empresa_modulos (1.1)
--
-- RLS: empresa_dados_contrato era só dono/admin, até para ler. O contrato é emitido no
-- navegador por QUEM VENDE (PDV, encomenda, garantia) e sempre leu estes dados em empresas,
-- que todo membro lê; com a regra antiga o contrato do vendedor sairia sem representante e
-- sem banco. A leitura passa a ser de membro da empresa (como empresa_branding); gravar
-- continua só dono/admin.
--
-- O DROP das colunas vem em 20261022000400, depois do deploy.
-- =====================================================================================

update public.empresas e set preset_onboarding = e.segmento
 where e.segmento is not null and e.preset_onboarding is distinct from e.segmento
   and exists (select 1 from public.presets_onboarding p where p.chave = e.segmento);

insert into public.empresa_branding (empresa_id, cor, logo_url, slogan, whatsapp, sidebar)
select e.id, e.wl_cor, e.wl_logo_url, e.wl_slogan, e.wl_whatsapp, coalesce(e.wl_menu, '{}'::jsonb)
  from public.empresas e
on conflict (empresa_id) do update
  set cor = excluded.cor, logo_url = excluded.logo_url, slogan = excluded.slogan,
      whatsapp = excluded.whatsapp, sidebar = excluded.sidebar, updated_at = now();

insert into public.empresa_dados_contrato (empresa_id, representante_nome, representante_cpf, representante_nacionalidade,
  representante_estado_civil, representante_profissao, banco_nome, banco_agencia, banco_conta, banco_pix)
select e.id, e.representante_nome, e.representante_cpf, e.representante_nacionalidade, e.representante_estado_civil,
       e.representante_profissao, e.banco_nome, e.banco_agencia, e.banco_conta, e.banco_pix
  from public.empresas e
on conflict (empresa_id) do update
  set representante_nome = excluded.representante_nome, representante_cpf = excluded.representante_cpf,
      representante_nacionalidade = excluded.representante_nacionalidade,
      representante_estado_civil = excluded.representante_estado_civil,
      representante_profissao = excluded.representante_profissao, banco_nome = excluded.banco_nome,
      banco_agencia = excluded.banco_agencia, banco_conta = excluded.banco_conta, banco_pix = excluded.banco_pix,
      updated_at = now();

drop policy if exists empresa_dados_contrato_select on public.empresa_dados_contrato;
create policy empresa_dados_contrato_select on public.empresa_dados_contrato for select to authenticated
  using (empresa_id = (select public.get_empresa_id()));

-- zapintel_resumo devolve o segmento (o papel do vendedor no texto do ZapIntel).
do $$
declare
  v_def  text := replace(pg_get_functiondef('public.zapintel_resumo(bigint)'::regprocedure), E'\r\n', E'\n');
  v_de   text := '(select segmento from empresas where id = v_emp)';
  v_para text := '(select preset_onboarding from empresas where id = v_emp)';
begin
  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'zapintel_resumo: esperava 1 leitura de empresas.segmento';
  end if;
  execute replace(v_def, v_de, v_para);
end $$;
