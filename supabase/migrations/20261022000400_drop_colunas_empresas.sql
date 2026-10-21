-- 1.4 (DROP, roda DEPOIS do deploy): as 18 colunas obsoletas de empresas saem. As sincronizações
-- (20261021003200 menu, 20261021003600 branding/contrato/preset) rodam na mesma janela, logo antes
-- do deploy; depois dele o app só grava nas tabelas do core, então copiar o legado de novo aqui
-- apagaria o que o app novo já gravou. Volta: restaurar só as colunas do dump da noite do deploy.
alter table public.empresas
  drop column if exists segmento,
  drop column if exists wl_cor, drop column if exists wl_logo_url, drop column if exists wl_slogan,
  drop column if exists wl_whatsapp, drop column if exists wl_menu,
  drop column if exists modulos_override, drop column if exists menu_override, drop column if exists menu_config,
  drop column if exists representante_nome, drop column if exists representante_cpf,
  drop column if exists representante_nacionalidade, drop column if exists representante_estado_civil,
  drop column if exists representante_profissao,
  drop column if exists banco_nome, drop column if exists banco_agencia, drop column if exists banco_conta,
  drop column if exists banco_pix;
