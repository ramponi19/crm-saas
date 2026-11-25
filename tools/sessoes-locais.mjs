#!/usr/bin/env node
/**
 * REGISTRO DE POSSE DOS RECURSOS LOCAIS ENTRE SESSÕES (regra de 24/11/2026, memória "isolamento-sessoes-locais";
 * docs/roteiro-reconstrucao.md §6). O registro é o .claude/sessoes-locais.json do checkout principal (fora do git).
 *
 * Uso pelos scripts:
 *   node tools/sessoes-locais.mjs outras <project_id_proprio>
 *     imprime, uma por linha, cada pilha/container que NÃO é do projeto informado: registrado no arquivo
 *     ou de pé no Docker. Saída vazia = ninguém mais usando o Docker, pode fechar Docker/WSL.
 *
 * Nunca falha por falta de arquivo ou de Docker: sem registro, olha só o Docker; sem Docker, só o registro.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Regra pura (testada em tests/sessoes-locais.test.ts).
 * @param {{ registro?: { pilhas?: any[], containers?: any[] } | null, dockerNomes?: string[], projetoProprio: string }} e
 * @returns {string[]} o que pertence a OUTRO projeto ou sessão
 */
export function outrasPilhas({ registro, dockerNomes = [], projetoProprio }) {
  const proprio = String(projetoProprio ?? '').trim()
  const motivos = []
  for (const p of registro?.pilhas ?? []) {
    const id = String(p?.project_id ?? p?.nome ?? '').trim()
    if (id && id !== proprio) motivos.push(`pilha registrada: ${id}${p?.sessao ? ` (sessão ${p.sessao})` : ''}`)
  }
  for (const c of registro?.containers ?? []) {
    const nome = String(c?.nome ?? '').trim()
    if (nome) motivos.push(`container registrado: ${nome}${c?.sessao ? ` (sessão ${c.sessao})` : ''}`)
  }
  for (const bruto of dockerNomes) {
    const nome = String(bruto ?? '').trim()
    if (!nome) continue
    // As pilhas do Supabase CLI se chamam supabase_<serviço>_<project_id>.
    const m = /^supabase_[a-z_-]+?_(.+)$/i.exec(nome)
    const dono = m ? m[1] : null
    if (dono === proprio) continue
    motivos.push(dono ? `container de pé da pilha ${dono}: ${nome}` : `container de pé: ${nome}`)
  }
  return [...new Set(motivos)]
}

/** O registro mora no checkout principal, mesmo quando o script roda numa worktree. */
function caminhoDoRegistro() {
  try {
    const comum = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim()
    return join(dirname(resolve(comum)), '.claude', 'sessoes-locais.json')
  } catch {
    return resolve('.claude', 'sessoes-locais.json')
  }
}

function lerRegistro() {
  const arq = caminhoDoRegistro()
  if (!existsSync(arq)) return null
  try { return JSON.parse(readFileSync(arq, 'utf8')) } catch { return { pilhas: [{ nome: `registro ilegível em ${arq}` }] } }
}

function nomesNoDocker() {
  try {
    return execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}

const [, , comando, projeto] = process.argv
if (comando === 'outras') {
  if (!projeto) { console.error('uso: node tools/sessoes-locais.mjs outras <project_id_proprio>'); process.exit(2) }
  for (const m of outrasPilhas({ registro: lerRegistro(), dockerNomes: nomesNoDocker(), projetoProprio: projeto })) console.log(m)
}
