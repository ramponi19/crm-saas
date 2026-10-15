/**
 * QUEM USA O ZAPINTEL — dono, administrador e superadmin. Decisão do Lucas em
 * 15/10/2026: *"vendedor deve ser bloqueado, só dono, admin e superadmin"*.
 *
 * Até então o ZapIntel conferia só se a EMPRESA tinha o complemento: o link
 * ficava no /admin (dono/admin), mas um vendedor que digitasse /zapintel
 * entrava e via a própria loja. A mesma regra mora em três lugares, de
 * propósito, para nenhum caminho escapar: a tela (app/zapintel/layout.tsx), as
 * rotas de API (`zapintelAcesso`) e o banco (`zapintel_escopo`, que as telas
 * chamam direto do navegador).
 */
export const PAPEIS_DO_ZAPINTEL = ['owner', 'admin'] as const

export function podeUsarZapintel(papel: string | null | undefined, superAdmin: boolean): boolean {
  return superAdmin || (PAPEIS_DO_ZAPINTEL as readonly string[]).includes(papel ?? '')
}
