// GERADOR DOS VALORES PADRÃO DE CONFIGURAÇÃO (etapa 1.1i, 26/11/2026; docs/etapa-1.1-plano.md §5.2, item 4).
//
// Fonte única: o catálogo `DEFINICOES_CONFIG` de lib/config.ts (padrões explícitos). Este script escreve a função
// `public.config_padroes()` — a lista que o banco usa para gravar a configuração da empresa nova (gatilho em `empresas`)
// e a de cada módulo instalado (gatilho em `empresa_modulos`) — em supabase/funcoes/config_padroes.sql.
//
//   npm run gerar:config-padroes     reescreve supabase/funcoes/config_padroes.sql
//   npm run check:config-padroes     confere (no `npm run check`): o arquivo e a ÚLTIMA migração que cria
//                                    config_padroes() têm de ser idênticos ao que o catálogo gera. Mudou um padrão no
//                                    catálogo? Gere o arquivo e crie uma migração nova com o mesmo bloco.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { padroesParaSemear } from '../lib/config.ts'

const ARQUIVO = 'supabase/funcoes/config_padroes.sql'
const INICIO = '-- >>> config_padroes (gerado por scripts/gerar-config-padroes.mts; não editar à mão)'
const FIM = '-- <<< config_padroes'

const sqlTexto = (s: string) => `'${s.replace(/'/g, "''")}'`

export function gerarBloco(): string {
  const linhas = padroesParaSemear().map((p) =>
    `    (${sqlTexto(p.modulo)}, ${sqlTexto(p.chave)}, ${sqlTexto(JSON.stringify(p.valor))}::jsonb, ${p.modulo_requerido ? sqlTexto(p.modulo_requerido) : 'null'})`)
  return [
    INICIO,
    'create or replace function public.config_padroes()',
    ' returns table (modulo text, chave text, valor jsonb, modulo_requerido text)',
    ' language sql immutable',
    " set search_path to 'public', 'pg_temp'",
    'as $function$',
    '  select * from (values',
    linhas.join(',\n'),
    '  ) as p(modulo, chave, valor, modulo_requerido)',
    '$function$;',
    FIM,
  ].join('\n')
}

function blocoDe(texto: string): string | null {
  const i = texto.indexOf(INICIO), f = texto.indexOf(FIM)
  return i < 0 || f < 0 ? null : texto.slice(i, f + FIM.length).replace(/\r/g, '')
}

const bloco = gerarBloco()
if (process.argv.includes('--conferir')) {
  const erros: string[] = []
  let arq = ''
  try { arq = readFileSync(ARQUIVO, 'utf8') } catch { erros.push(`${ARQUIVO} não existe (rode npm run gerar:config-padroes)`) }
  if (arq && blocoDe(arq) !== bloco) erros.push(`${ARQUIVO} está diferente do catálogo (rode npm run gerar:config-padroes)`)
  const migracoes = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
  const ultima = [...migracoes].reverse().find((f) => readFileSync(`supabase/migrations/${f}`, 'utf8').includes(INICIO))
  if (!ultima) erros.push('nenhuma migração cria config_padroes()')
  else if (blocoDe(readFileSync(`supabase/migrations/${ultima}`, 'utf8')) !== bloco)
    erros.push(`a última migração com config_padroes() (${ultima}) está diferente do catálogo: crie uma migração nova com o bloco de ${ARQUIVO}`)
  if (erros.length) { console.error('✗ check-config-padroes:'); for (const e of erros) console.error(`  - ${e}`); process.exit(1) }
  console.log(`✓ config-padroes ok — ${padroesParaSemear().length} padrões; ${ARQUIVO} e ${ultima} iguais ao catálogo`)
} else {
  writeFileSync(ARQUIVO, `-- Valores padrão de configuração (1.1i). Gerado a partir de lib/config.ts.\n${bloco}\n`)
  console.log(`gerado ${ARQUIVO} (${padroesParaSemear().length} padrões)`)
}
