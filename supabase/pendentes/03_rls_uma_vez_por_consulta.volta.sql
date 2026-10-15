-- VOLTA ATRÁS de 03_rls_uma_vez_por_consulta.sql: recoloca cada política
-- exatamente como foi guardada em backup.rls_politicas_20261015.
do $$
declare pol record;
begin
  for pol in select * from backup.rls_politicas_20261015 loop
    execute format('alter policy %I on public.%I', pol.politica, pol.tabela)
      || coalesce(' using (' || pol.usando || ')', '') || coalesce(' with check (' || pol.checa || ')', '');
  end loop;
end $$;
