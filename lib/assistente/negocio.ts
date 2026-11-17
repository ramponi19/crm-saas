import { MODULOS } from '@/core/modulos'
import { ligadosDaEmpresa, type ConfigEmpresa } from '@/lib/empresa-config'

/**
 * O QUE A EMPRESA USA, EM UMA LINHA, PARA O PROMPT DO ASSISTENTE.
 *
 * Até 17/11/2026 a frase vinha do PRESET de onboarding ("loja de varejo/celulares",
 * "imobiliária", "clínica"…): texto de ramo dentro do core, e errado para quem
 * mudou de módulos depois do cadastro. Agora descreve pelos módulos LIGADOS para a
 * empresa, com o nome do manifesto (core/modulos.ts) — o mesmo que ela vê no menu.
 * Nenhum módulo ligado = null, e cada prompt mantém o seu texto genérico.
 *
 * Usado pelo assistente de ajuda (app/api/assistente) e pelo chat com dados
 * (lib/assistente/chat-dados.ts).
 */
export function modulosDaEmpresa(cfg: ConfigEmpresa): string | null {
  const ligados = ligadosDaEmpresa(cfg)
  const nomes = MODULOS.filter((m) => ligados.has(m.href)).map((m) => m.nome)
  return nomes.length ? nomes.join(', ') : null
}
