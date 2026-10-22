/**
 * AS SEÇÕES DE CONFIGURAÇÕES SAEM DO MÓDULO LIGADO, NÃO DO SEGMENTO (22/10/2026).
 *
 *   psql ... -A -t -c "select json_agg(json_build_object('chave', chave, 'rotulos', rotulos)) from presets_onboarding" > presets.json
 *   npx tsx scripts/comparar-abas-modulo.mts presets.json
 *
 * Para cada preset do banco, compara o jeito antigo — `abasExtraConfiguracoes` e
 * `capacidades.integraPortais` do segmento (lib/segmentos.ts) — com o novo: as
 * seções que os módulos ligados trazem (core/modulos.ts) e "Imóveis ligado". Sai
 * com 1 se houver diferença fora da lista `ESPERADAS`.
 *
 * Este script é o único lugar do código novo que fala em segmento: é a régua do
 * antes. Fica em scripts/, fora do check-segmento.
 */
import fs from 'node:fs'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { hrefsHabilitados } from '@/lib/menu'
import { segOverrideDoPreset, type PresetRow } from '@/lib/empresa-config'
import { abasDosModulos } from '@/core/modulos'

/**
 * Diferenças aceitas, por decisão (a pergunta agora é "o módulo está ligado?"):
 * a imobiliária liga a Agenda, e a Agenda traz a seção Agendamento — a página
 * pública de agendamento já atendia visitas (capacidade agendaVisitas).
 */
const ESPERADAS: Record<string, string> = { 'imobiliaria:+agendamento': 'Agenda ligada traz Agendamento' }

const presets = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').trim()) as PresetRow[]
let falhas = 0
for (const p of presets) {
  const seg = normalizarSegmento(p.chave)
  const antes = new Set(SEGMENTOS[seg].abasExtraConfiguracoes.map((a) => a.id))
  const ligados = hrefsHabilitados({ segmento: seg, segOverride: segOverrideDoPreset(p) })
  const depois = new Set(abasDosModulos(ligados))
  const difs = [
    ...[...depois].filter((a) => !antes.has(a)).map((a) => `+${a}`),
    ...[...antes].filter((a) => !depois.has(a)).map((a) => `-${a}`),
  ]
  const portaisAntes = !!SEGMENTOS[seg].capacidades.integraPortais
  const portaisDepois = ligados.has('/imoveis')
  if (portaisAntes !== portaisDepois) difs.push(`portais ${portaisAntes}→${portaisDepois}`)
  const inesperadas = difs.filter((d) => !ESPERADAS[`${p.chave}:${d}`])
  falhas += inesperadas.length
  console.log(`${inesperadas.length ? 'DIFERENTE' : 'igual    '} ${p.chave.padEnd(15)} abas: ${[...depois].join(', ') || '—'}${difs.length ? `  (${difs.map((d) => ESPERADAS[`${p.chave}:${d}`] ? `${d} esperada` : d).join('; ')})` : ''}`)
}
console.log(`\n${presets.length} presets comparados, ${falhas} diferença(s) inesperada(s)`)
process.exit(falhas ? 1 : 0)
