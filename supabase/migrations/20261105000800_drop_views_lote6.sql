-- Fase final das views de compatibilidade, lote 6 (05/11/2026): imob.
--
-- Caem as views que ficaram sem leitor (from, embed, tipo, literal) no app, Edges e scripts:
--   imoveis               -> imoveis_imoveis
--   chaves_imoveis        -> imoveis_chaves
--   negocios_imobiliarios -> imoveis_negocios
--   lead_perfil_busca     -> imoveis_perfis_busca
--
-- Única função que citava uma delas no corpo: propagar_filial_do_lead() (update em
-- lead_perfil_busca, lead_mensagens e clientes). Está morta: é função de gatilho sem nenhum
-- gatilho (o de old_leads saiu em 20/10; a versão do core v1 é core_*), sem chamador no app.
-- Sai junto. As políticas imoveis_* de storage.objects falam do BUCKET 'imoveis', não da view.
-- Sem CASCADE. Volta: supabase/scripts/volta/volta-views-lote6.sql.

do $$
begin
  if exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
              where p.pronamespace = 'public'::regnamespace and p.proname = 'propagar_filial_do_lead') then
    raise exception 'propagar_filial_do_lead ganhou um gatilho: rever antes de apagar';
  end if;
end $$;

drop function public.propagar_filial_do_lead();

drop view public.imoveis;
drop view public.chaves_imoveis;
drop view public.negocios_imobiliarios;
drop view public.lead_perfil_busca;
