/**
 * LOGO, COR, SLOGAN, WHATSAPP, TEMA DO MENU E SEGMENTO IGUAIS QUANDO A FONTE TROCA (item 1.4).
 *
 *   TESTE_URL=... TESTE_ANON=... TESTE_JWTS="servico=<jwt>,vendedor=<jwt>" \
 *     npx tsx scripts/comparar-empresa.mts antes|depois <arquivo.json>
 *
 * Contra a cópia. Cada consulta abaixo é a de um leitor real de empresas, na forma
 * ANTES (colunas de empresas) e DEPOIS (alias + spread das tabelas do core). Rodar
 * `antes` com o banco antes da migração e `depois` com o banco migrado; o script
 * `--comparar a.json b.json` diz o que mudou. O tema do menu entra RESOLVIDO
 * (resolveTheme), que é o que a tela usa: wl_menu nulo e sidebar {} dão o mesmo tema.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { resolveTheme, type WlMenu } from '../lib/wl-menu'

const BR = (c: string) => `...empresa_branding(${c})`
const CONTRATO = '...empresa_dados_contrato(representante_nome, representante_cpf, representante_nacionalidade, representante_estado_civil, representante_profissao, banco_nome, banco_agencia, banco_conta, banco_pix)'
const CAMPOS_CONTRATO = 'representante_nome, representante_cpf, representante_nacionalidade, representante_estado_civil, representante_profissao, banco_nome, banco_agencia, banco_conta, banco_pix'

const CONSULTAS: { leitor: string; antes: string; depois: string }[] = [
  { leitor: 'layout do CRM', antes: 'nome, plano, segmento, wl_cor, wl_logo_url, wl_menu, permissoes',
    depois: `nome, plano, segmento:preset_onboarding, ${BR('wl_cor:cor, wl_logo_url:logo_url, wl_menu:sidebar')}, permissoes` },
  { leitor: 'contexto (white-label + contrato)', antes: `wl_cor, wl_logo_url, wl_slogan, wl_whatsapp, ${CAMPOS_CONTRATO}`,
    depois: `${BR('wl_cor:cor, wl_logo_url:logo_url, wl_slogan:slogan, wl_whatsapp:whatsapp')}, ${CONTRATO}` },
  { leitor: 'agendar', antes: 'id, nome, wl_logo_url, wl_cor, segmento', depois: `id, nome, ${BR('wl_logo_url:logo_url, wl_cor:cor')}, segmento:preset_onboarding` },
  { leitor: 'site imob', antes: 'id, nome, segmento, wl_cor, wl_logo_url, wl_slogan, wl_whatsapp, telefone',
    depois: `id, nome, segmento:preset_onboarding, ${BR('wl_cor:cor, wl_logo_url:logo_url, wl_slogan:slogan, wl_whatsapp:whatsapp')}, telefone` },
  { leitor: 'imóvel público', antes: 'nome, wl_cor, wl_logo_url, wl_whatsapp, telefone', depois: `nome, ${BR('wl_cor:cor, wl_logo_url:logo_url, wl_whatsapp:whatsapp')}, telefone` },
  { leitor: 'cardápio', antes: 'id, nome, wl_logo_url, wl_cor, wl_whatsapp, segmento', depois: `id, nome, ${BR('wl_logo_url:logo_url, wl_cor:cor, wl_whatsapp:whatsapp')}, segmento:preset_onboarding` },
  { leitor: 'orçamento público', antes: 'nome, wl_cor, wl_logo_url', depois: `nome, ${BR('wl_cor:cor, wl_logo_url:logo_url')}` },
  { leitor: 'OS e proposta (embed)', antes: 'nome, wl_logo_url, wl_cor, wl_whatsapp', depois: `nome, ${BR('wl_logo_url:logo_url, wl_cor:cor, wl_whatsapp:whatsapp')}` },
  { leitor: 'aparência', antes: 'wl_menu', depois: BR('wl_menu:sidebar') },
  { leitor: 'contrato (loja)', antes: `nome, cnpj, telefone, wl_logo_url, email, cep, endereco, numero, complemento, bairro, cidade, estado, ${CAMPOS_CONTRATO}`,
    depois: `nome, cnpj, telefone, ${BR('wl_logo_url:logo_url')}, email, cep, endereco, numero, complemento, bairro, cidade, estado, ${CONTRATO}` },
  { leitor: 'admin / métricas / meu-menu (segmento)', antes: 'id, plano, segmento', depois: 'id, plano, segmento:preset_onboarding' },
]

/**
 * O que a tela usa: o tema resolvido no lugar do wl_menu cru, e as chaves em ordem
 * alfabética — o spread acrescenta os campos no fim do objeto, e quem consome lê
 * por nome, então a ordem não é diferença.
 */
function normalizar(linha: Record<string, unknown>) {
  const o: Record<string, unknown> = { ...linha }
  if ('wl_menu' in o) {
    o.tema = resolveTheme(o.wl_menu as WlMenu | null, (o.wl_cor as string | null | undefined) ?? null)
    delete o.wl_menu
  }
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
}

const [modo, arq, arqB] = process.argv.slice(2)
if (modo === '--comparar') {
  const a = JSON.parse(fs.readFileSync(arq, 'utf8')) as Record<string, unknown>
  const b = JSON.parse(fs.readFileSync(arqB, 'utf8')) as Record<string, unknown>
  let dif = 0
  for (const k of Object.keys(a)) {
    const igual = JSON.stringify(a[k]) === JSON.stringify(b[k])
    if (!igual) dif++
    console.log(`${igual ? 'igual     ' : 'DIFERENTE '} ${k}${igual ? '' : `\n   antes:  ${JSON.stringify(a[k])}\n   depois: ${JSON.stringify(b[k])}`}`)
  }
  console.log(`\n${Object.keys(a).length} leituras, ${dif} diferentes`)
  process.exit(dif ? 1 : 0)
}

const url = process.env.TESTE_URL, anon = process.env.TESTE_ANON
const jwts = (process.env.TESTE_JWTS ?? '').split(',').filter(Boolean).map((p) => p.split('=') as [string, string])
if ((modo !== 'antes' && modo !== 'depois') || !arq || !url || !anon || !jwts.length) {
  console.error('uso: ... comparar-empresa.mts antes|depois <arquivo.json>  |  --comparar <a.json> <b.json>'); process.exit(2)
}
if (!/localhost|127\.0\.0\.1/.test(url)) { console.error('só contra a cópia local'); process.exit(2) }

const fora: Record<string, unknown> = {}
for (const [quem, jwt] of jwts) {
  const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } })
  for (const c of CONSULTAS) {
    const { data, error } = await db.from('empresas').select(modo === 'antes' ? c.antes : c.depois).order('id')
    fora[`${quem} · ${c.leitor}`] = error ? { erro: error.message } : ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizar)
  }
}
fs.writeFileSync(arq, JSON.stringify(fora, null, 1))
console.log(`${Object.keys(fora).length} leituras gravadas em ${arq}`)
