-- Limpeza de 14/10/2026: as colunas do "paragrafo do dia" antigo do ZapIntel.
-- O recurso virou pedido ao assistente (botao "Resumo do dia" do dashboard);
-- nada mais lia nem gravava aqui.
alter table public.zapintel_painel
  drop column if exists relato,
  drop column if exists relato_em,
  drop column if exists relato_marca;
