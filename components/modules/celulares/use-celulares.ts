import { useFerramenta } from '@/components/layout/ferramentas-context'
import { HREF_CELULARES } from './modulo'

/**
 * O módulo Celulares está ligado para quem está logado? (no navegador)
 *
 * A resposta vem das ferramentas que o layout já resolveu (mesmas camadas do menu),
 * sem consulta nova. No servidor, a pergunta é
 * `ligadosDaEmpresa(cfg).has(HREF_CELULARES)` (lib/empresa-config.ts).
 */
export function useCelulares(): boolean {
  return !!useFerramenta(HREF_CELULARES)
}
