// CHAVE DE SERVIÇO SÓ PELOS PONTOS QUE AUDITAM A PLATAFORMA (etapa 1.1c, 26/11/2026).
//
// Toda escrita com a chave de serviço precisa passar pelo `fetch` de lib/supabase/usuario-na-escrita.ts, que manda
// quem escreveu: é assim que a escrita da plataforma (superadmin dentro de uma empresa) chega à Auditoria.
// Esta checagem falha se algum arquivo do app criar um cliente Supabase com SUPABASE_SERVICE_ROLE_KEY fora dos
// pontos permitidos. Usar a chave como segredo (HMAC, comparação) não é criar cliente e não conta.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PERMITIDOS = new Set(['lib/supabase/service.ts', 'lib/rastreamento/db.ts'])
const arquivos = execSync('git ls-files app lib components proxy.ts', { encoding: 'utf8' }).trim().split('\n')
  .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f))

const fora = []
for (const f of arquivos) {
  if (PERMITIDOS.has(f)) continue
  const src = readFileSync(f, 'utf8')
  if (!src.includes('SUPABASE_SERVICE_ROLE_KEY')) continue
  // cria cliente com a chave: createClient(..., process.env.SUPABASE_SERVICE_ROLE_KEY ...)
  if (/create(Server)?Client\s*(<[^>]*>)?\s*\([^)]*SUPABASE_SERVICE_ROLE_KEY/s.test(src)) fora.push(f)
}
for (const f of PERMITIDOS) {
  if (!readFileSync(f, 'utf8').includes('fetchComUsuario')) fora.push(`${f} (sem o fetchComUsuario)`)
}
if (fora.length) {
  console.error('✗ check-servico: cliente com a chave de serviço fora de lib/supabase/service.ts — a escrita da plataforma não iria para a Auditoria:')
  for (const f of fora) console.error(`  - ${f}`)
  console.error('  Use createServiceClient() (lib/supabase/service.ts).')
  process.exit(1)
}
console.log(`✓ servico ok — ${arquivos.length} arquivos; chave de serviço só por ${[...PERMITIDOS].join(' e ')}, com o usuário nas escritas`)
