#!/usr/bin/env node
/**
 * TODA VIEW EM public TERMINA AS MIGRAÇÕES COM security_invoker=true.
 *
 * Em 20/10/2026 a migração 20261021002800 recriou leads e lead_mensagens com
 * CREATE OR REPLACE VIEW sem `with (security_invoker = true)`. O replace apaga
 * a opção, a view passa a rodar como o dono (postgres, que ignora RLS) e a
 * separação por loja some por ela — por 2 min 44 s, um vendedor de uma loja
 * lia os leads da outra.
 *
 * No banco, o event trigger `exigir_security_invoker` (migração
 * 20261021002900) recusa o comando. Este script é a mesma regra antes do
 * deploy: percorre supabase/migrations em ordem e acompanha cada view de public
 * (create / create or replace / alter view ... set / drop view). Se alguma
 * terminar sem a opção, falha. Roda no `npm run build` (o build da Vercel) e
 * no `npm run check`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.argv[2] ?? 'supabase/migrations'
const estado = new Map() // view -> { invoker: boolean, onde: string }
const dinamicas = new Set() // migrações com view criada por SQL dinâmico (não avaliáveis aqui)

const semComentarios = (sql) => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
const nome = (n) => n.replace(/"/g, '').replace(/^public\./i, '').toLowerCase()
const invoker = (opcoes) => /security_invoker\s*=\s*'?(true|on|yes|1)'?/i.test(opcoes ?? '')

for (const arq of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = semComentarios(readFileSync(join(DIR, arq), 'utf8'))
  const re = /\b(create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(?:recursive\s+)?view|alter\s+view(?:\s+if\s+exists)?|drop\s+view(?:\s+if\s+exists)?)\s+((?:"?public"?\.)?"?[a-z_][a-z0-9_]*"?(?:\s*,\s*(?:"?public"?\.)?"?[a-z_][a-z0-9_]*"?)*)([\s\S]*?)(?:;|\bas\b)/gi
  for (const m of sql.matchAll(re)) {
    /**
     * SQL DINÂMICO (`format('create view public.%I ...')`): o nome só existe na hora de
     * rodar, e este leitor de texto não tem como saber qual view é. Sem isto, o regex lia
     * "public" como nome de view e o build falhava — aconteceu com a 20261021000050, que
     * traz o script do corte (as 37 views de módulo saem de format). Fica de fora daqui;
     * quem garante esses casos é o banco: a 20261021002900 liga a opção em toda view de
     * public e instala o event trigger `exigir_security_invoker`, que recusa o resto. No
     * `supabase start` local dá para conferir em pg_class.reloptions (45 de 45 em 21/10).
     */
    if (/^\s*\.\s*%/.test(m[3])) { dinamicas.add(arq); continue }
    const verbo = m[1].toLowerCase()
    const nomes = m[2].split(',').map((s) => s.trim())
    // só public: nome qualificado com outro schema fica de fora; sem schema, é public
    const doPublic = nomes.filter((n) => !/\./.test(n) || /^"?public"?\./i.test(n)).map(nome)
    if (/temp/.test(verbo)) continue
    for (const v of doPublic) {
      if (verbo.startsWith('drop')) { estado.delete(v); continue }
      if (verbo.startsWith('create')) { estado.set(v, { invoker: invoker(m[3]), onde: arq }); continue }
      // alter view: só muda o estado quando mexe na opção
      if (/security_invoker/i.test(m[3])) {
        const reset = /\breset\b/i.test(m[3])
        estado.set(v, { invoker: !reset && invoker(m[3]), onde: arq })
      }
    }
  }
}

const sem = [...estado].filter(([, e]) => !e.invoker)
if (sem.length) {
  console.error('✗ view em public sem security_invoker=true ao fim das migrações:')
  for (const [v, e] of sem) console.error(`   ${v}  (último create/alter em ${e.onde})`)
  console.error('\n  Use `create or replace view ... with (security_invoker = true) as ...` —')
  console.error('  o replace apaga as opções que não forem repetidas.')
  process.exit(1)
}
console.log(`✓ views: ${estado.size} em public, todas com security_invoker`)
if (dinamicas.size) console.log(`  (SQL dinâmico não avaliado aqui; garantido no banco pela 20261021002900 e pelo event trigger: ${[...dinamicas].join(', ')})`)
