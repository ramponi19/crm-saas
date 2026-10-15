-- VOLTA ATRÁS de 05_zapintel_so_dono_admin.sql: o vendedor volta a ver a
-- própria loja no ZapIntel pelo banco (o código continua bloqueando a tela).
do $$
declare d text;
  n text := $q$  else
    v_lojas := filiais_visiveis();
  end if;$q$;
  o text := $q$  else
    -- 15/10/2026: o ZapIntel é do dono, do admin e do superadmin.
    raise exception 'ZapIntel restrito ao dono e aos administradores' using errcode = '42501';
  end if;$q$;
begin
  d := pg_get_functiondef('public.zapintel_escopo(bigint,bigint)'::regprocedure);
  if position(o in d) = 0 then raise exception 'volta 05: estado inesperado — nada foi alterado'; end if;
  execute replace(d, o, n);
end $$;
