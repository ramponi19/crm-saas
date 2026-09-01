#!/usr/bin/env node
/**
 * TRAVA DE ARQUITETURA — o núcleo não pode saber o nome dos segmentos.
 *
 * ══ O PROBLEMA QUE ISTO IMPEDE ═════════════════════════════════════════════
 *
 * O CRM é um núcleo (leads, clientes, PDV, estoque) apresentado de formas
 * diferentes por vertical. Quando um arquivo COMPARTILHADO pergunta "é
 * imobiliária?", mexer no imobiliário passa a poder quebrar o varejo — e foi
 * exatamente o que aconteceu em 13/08/2026, quando duas frentes colidiram em
 * lead-modal.tsx e cliente-modal.tsx.
 *
 * O jeito certo é o núcleo PERGUNTAR ao contrato (lib/segmentos.ts) o que fazer,
 * em vez de TESTAR quem é o segmento:
 *
 *    ✗  {segmento === 'imobiliaria' && <PainelDeMatch />}
 *    ✓  {cfg.paineisDoLead.includes('match') && <PainelDeMatch />}
 *
 * ══ POR QUE A REGRA PROCURA COMPARAÇÃO, E NÃO O NOME SOLTO ═════════════════
 *
 * Medido antes de escrever: a palavra 'assistencia' aparece 14 vezes fora de
 * qualquer contexto de segmento — é status de estoque ("Em reparo") e tipo de
 * orçamento. Uma regra que buscasse o nome solto daria 14 falsos positivos no
 * primeiro dia, e regra que grita errado é regra que a equipe desliga.
 *
 * ══ HISTÓRIA ═══════════════════════════════════════════════════════════════
 *
 * A trava nasceu (14/08/2026) com 21 comparações em 17 arquivos: refatorar tudo de
 * uma vez, com a loja em produção, seria pior que a dívida — então ela congelou o
 * tamanho do problema e as fases seguintes reduziram.
 *
 * Em 18/08/2026 a lista chegou a ZERO. Nenhum arquivo de núcleo pergunta mais "é
 * imobiliária?".
 *
 * REGRA: a lista fica vazia. Acrescentar arquivo é reabrir a porta que o plano
 * fechou — a saída quase sempre é uma capacidade nova no contrato.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const RAIZ = process.cwd()
const PASTAS = ['app', 'components', 'lib']
const ARQUIVOS_SOLTOS = ['proxy.ts'] // o middleware do Next 15 virou proxy.ts no 16

/** Comparação do segmento com um literal — o padrão que acopla núcleo e vertical. */
const PADRAO = /segmento[^\n]{0,40}(===|!==)\s*['"](varejo|assistencia|servicos|imobiliaria|saude|food|concessionaria)['"]/

/**
 * O CONTRATO. Aqui a comparação é legítima: é o lugar cujo trabalho é justamente
 * saber os segmentos e traduzi-los para o resto do sistema.
 */
const CONTRATO = [
  'lib/segmentos.ts',
  'lib/menu.ts',
  'lib/motivos-perda.ts',
  'lib/zapintel/segments/segments.ts',
]

/**
 * ÁREA PRÓPRIA DA VERTICAL. Uma tela de imóveis pode falar de imobiliária: ela
 * não é compartilhada, e quem mexe nela não afeta o varejo.
 */
const AREA_DE_VERTICAL = [
  'app/(dashboard)/imoveis/',
  'app/(dashboard)/proprietarios/',
  'app/(dashboard)/chaves/',
  'app/(dashboard)/assistencia/',
  'app/(dashboard)/cardapio/',
  'app/(dashboard)/kds/',
  'app/(dashboard)/avaliacoes/',
  'app/(dashboard)/consulta-fipe/',
  'app/imob/',
  'app/landing/',
  'app/para/',
]

/**
 * DÍVIDA CONGELADA — núcleo que ainda compara segmento. Cada linha diz o que a
 * refatoração precisa resolver, para a lista ser um plano e não um esconderijo.
 */
const DIVIDA = {
  // VAZIA — Fases 1 e 2 concluídas em 18/08/2026: as 21 comparações que existiam
  // foram para o contrato (lib/segmentos.ts) como campos e capacidades.
  //
  // Manter assim. Acrescentar arquivo aqui é reabrir a porta que o plano fechou:
  // o núcleo volta a saber o nome das verticais e mexer numa passa a poder quebrar
  // as outras. Se parecer inevitável, o certo é quase sempre uma capacidade nova no
  // contrato — ver docs/PLANO-ISOLAMENTO-SEGMENTOS.md.
}

function arquivos(dir) {
  const out = []
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome === '.next' || nome.startsWith('.')) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) out.push(...arquivos(caminho))
    else if (/\.(ts|tsx)$/.test(nome)) out.push(caminho)
  }
  return out
}

const alvos = [
  ...PASTAS.flatMap((p) => arquivos(join(RAIZ, p))),
  ...ARQUIVOS_SOLTOS.map((f) => join(RAIZ, f)),
]

const novos = []
const conhecidos = []
const piorou = []
const resolvidos = new Set(Object.keys(DIVIDA))

for (const caminho of alvos) {
  const rel = relative(RAIZ, caminho).split(sep).join('/')
  if (CONTRATO.includes(rel)) continue
  if (AREA_DE_VERTICAL.some((p) => rel.startsWith(p))) continue

  const linhas = readFileSync(caminho, 'utf8').split(/\r?\n/)
  const achados = linhas
    .map((linha, i) => ({ n: i + 1, linha: linha.trim() }))
    .filter(({ linha }) => PADRAO.test(linha))

  if (achados.length === 0) continue

  if (rel in DIVIDA) {
    resolvidos.delete(rel)
    const { max } = DIVIDA[rel]
    /**
     * A DÍVIDA CONGELA A QUANTIDADE, NÃO SÓ O ARQUIVO.
     *
     * Sem isto havia uma brecha: um arquivo já na lista podia ganhar comparações
     * NOVAS sem a trava reclamar — e os dois arquivos mais disputados (lead-modal
     * e configuracoes-view) são justamente os que mais receberiam. A trava
     * congelaria o número de arquivos e deixaria o problema crescer dentro deles.
     */
    if (achados.length > max) {
      piorou.push({ rel, achados, max })
    } else {
      conhecidos.push({ rel, achados })
    }
    continue
  }

  novos.push({ rel, achados })
}

// ── Relatório ────────────────────────────────────────────────────────────────
if (piorou.length) {
  console.error('\n✗ A DÍVIDA CRESCEU — comparação nova em arquivo que já era exceção\n')
  for (const { rel, achados, max } of piorou) {
    console.error(`  ${rel} — tinha ${max}, agora tem ${achados.length}`)
    for (const a of achados) console.error(`    ${a.n}: ${a.linha.slice(0, 110)}`)
    console.error(`    → ${DIVIDA[rel].nota}`)
  }
  console.error(`
  Estar na lista de dívida NÃO é permissão para acrescentar mais. O limite de cada
  arquivo está em DIVIDA (scripts/check-nucleo.mjs) e existe para o problema não
  crescer por dentro justamente nos arquivos mais disputados.

  Resolva pelo contrato (lib/segmentos.ts) — ver docs/PLANO-ISOLAMENTO-SEGMENTOS.md
`)
  process.exit(1)
}

if (novos.length) {
  console.error('\n✗ NÚCLEO COMPARANDO SEGMENTO — acoplamento novo\n')
  for (const { rel, achados } of novos) {
    console.error(`  ${rel}`)
    for (const a of achados) console.error(`    ${a.n}: ${a.linha.slice(0, 110)}`)
  }
  console.error(`
  Arquivo do núcleo não pode perguntar "é imobiliária?" — quem mexe numa vertical
  passaria a poder quebrar as outras.

  Em vez de testar o segmento, pergunte ao contrato (lib/segmentos.ts) o que fazer:

    ✗  {segmento === 'imobiliaria' && <PainelDeMatch />}
    ✓  {cfg.paineisDoLead.includes('match') && <PainelDeMatch />}

  Se a tela é EXCLUSIVA de uma vertical, ela não é núcleo: mova para a pasta da
  vertical (ver AREA_DE_VERTICAL neste script).

  Detalhes: docs/PLANO-ISOLAMENTO-SEGMENTOS.md
`)
  process.exit(1)
}

// Dívida que sumiu: a lista precisa encolher junto, senão vira decoração.
if (resolvidos.size) {
  console.log('\n✓ dívida resolvida — remova estes de DIVIDA em scripts/check-nucleo.mjs:')
  for (const rel of resolvidos) console.log(`   · ${rel}`)
}

const totalDivida = conhecidos.reduce((s, c) => s + c.achados.length, 0)
console.log(`\n✓ núcleo ok — nenhum acoplamento novo`)
console.log(`  dívida congelada: ${totalDivida} comparações em ${conhecidos.length} arquivos (só pode diminuir)\n`)
