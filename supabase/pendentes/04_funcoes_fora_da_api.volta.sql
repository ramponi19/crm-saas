-- VOLTA ATRÁS de 04_funcoes_fora_da_api.sql: devolve EXECUTE como estava.
grant execute on function public.preencher_filial(), public.preencher_filial_do_lead(), public.sincronizar_nao_lidas(),
  public.marcar_cliente_proprietario(), public.numerar_cotacao_troca(), public.propagar_filial_do_lead()
  to public, anon, authenticated;
grant execute on function public.filiais_visiveis(), public.filial_atual(), public.filial_gravacao(bigint),
  public.encerrar_impersonacao() to public, anon, authenticated;
