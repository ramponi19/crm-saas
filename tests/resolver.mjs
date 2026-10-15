// Gancho de resolução para os testes (ver alias.mjs): `@/x` vira a raiz do
// projeto, e import relativo sem extensão tenta .ts, .tsx e index.ts.
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function comExtensao(alvo) {
  if (existsSync(alvo) && statSync(alvo).isFile()) return alvo
  for (const ext of ['.ts', '.tsx', '.mts', '.js', '.mjs']) if (existsSync(alvo + ext)) return alvo + ext
  for (const ext of ['.ts', '.tsx', '.js']) if (existsSync(path.join(alvo, 'index' + ext))) return path.join(alvo, 'index' + ext)
  return null
}

export function resolver(especificador, contexto, proximo) {
  let alvo = null
  if (especificador.startsWith('@/')) alvo = comExtensao(path.join(RAIZ, especificador.slice(2)))
  else if ((especificador.startsWith('./') || especificador.startsWith('../')) && contexto.parentURL?.startsWith('file:')
           && !contexto.parentURL.includes('/node_modules/')) {
    const base = path.dirname(fileURLToPath(contexto.parentURL))
    const cru = path.resolve(base, especificador)
    if (!existsSync(cru) || !statSync(cru).isFile()) alvo = comExtensao(cru)
  }
  if (alvo) return proximo(pathToFileURL(alvo).href, contexto)
  try {
    return proximo(especificador, contexto)
  } catch (e) {
    // Pacote sem mapa de exports (ex.: `next/server`): o Next acha, o ESM do
    // Node exige a extensão.
    if (/^[a-z@][^:]*\/[^.]+$/i.test(especificador)) return proximo(especificador + '.js', contexto)
    throw e
  }
}
