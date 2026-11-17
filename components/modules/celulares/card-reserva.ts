/**
 * O painel "Reservar do estoque" do card do lead numa loja de celular (módulo Celulares e aparelhos,
 * `check_imei`): o exemplo de busca e a saúde da bateria da unidade. Sem o módulo, o painel (do
 * Estoque: components/modules/estoque/lead-reserva-panel.tsx) busca sem exemplo e não fala de bateria.
 */
export const RESERVA_CELULAR = {
  buscaExemplo: 'Buscar no estoque… ex.: iPhone 14 Pro',
  /** "bateria 87%" na linha de descritivos da unidade. */
  bateria: (pct: string) => `bateria ${pct}%`,
}
