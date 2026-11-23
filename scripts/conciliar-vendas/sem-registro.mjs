// Fase 5 — lista "sem registro" para a equipe conferir (SO LEITURA): negocios em que a IA do ZapIntel ve
// compra na conversa mas o CRM nao tem o ganho. Os ids vem do filtro sem_registro do zapintel_leads_lista
// (rodado pelo dono no banco); este script so monta o CSV com os dados e o trecho que indica a compra.
//
// Uso: node --env-file=.env.local sem-registro.mjs <ids.json> <saida.csv>
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const [IDS, SAIDA] = process.argv.slice(2)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const EMPRESA = 1
const ids = JSON.parse(fs.readFileSync(IDS, 'utf8')).map(Number)

// Frases de compra (cliente ou loja). A primeira que casar, da mais recente para a mais antiga, vira o trecho.
const COMPRA = /(comprei|j[aá] comprei|paguei|pagamento (feito|realizado|confirmado)|segue o comprovante|comprovante|fiz o pix|pix (feito|enviado|realizado)|vou levar|fechado|fechamos|pode separar|separa pra mim|retir(ar|ei|o) (hoje|amanh|aí|ai|na loja)|chegou (certinho|aqui|o aparelho)|recebi (o|a|meu|minha)|obrigad[oa] pela compra|parab[eé]ns pela compra|nota fiscal|garantia|entrega(r|mos)? (hoje|amanh)|seu pedido|pedido confirmado|confirmando (o )?pedido|ficou (lindo|perfeito)|amei o)/i
const limpa = (s) => String(s || '').replace(/\s+/g, ' ').trim()

const { data: negs, error } = await sb.from('negocios')
  .select('id, empresa_id, contato_id, filial_id, etapa_id, status, responsavel_id, created_at').in('id', ids).eq('empresa_id', EMPRESA)
if (error) throw error
const contatoIds = [...new Set(negs.map((n) => n.contato_id))]
const { data: contatos } = await sb.from('contatos').select('id, nome, telefone, telefone_e164').in('id', contatoIds)
const { data: etapas } = await sb.from('funil_etapas').select('id, label').eq('empresa_id', EMPRESA)
const { data: usuarios } = await sb.from('usuarios').select('id, nome')
const { data: filiais } = await sb.from('filiais').select('id, nome, cidade').eq('empresa_id', EMPRESA)
const { data: perfis } = await sb.from('zapintel_lead_perfil').select('lead_id, perfil').in('lead_id', ids).eq('empresa_id', EMPRESA)
const C = new Map(contatos.map((c) => [c.id, c])), E = new Map(etapas.map((e) => [e.id, e.label])), U = new Map(usuarios.map((u) => [u.id, u.nome]))
const F = new Map(filiais.map((f) => [f.id, f.cidade || f.nome])), P = new Map(perfis.map((p) => [p.lead_id, p.perfil]))

const linhas = []
for (const n of negs) {
  let q = sb.from('mensagens').select('direcao, conteudo, transcricao, created_at').eq('empresa_id', EMPRESA).eq('contato_id', n.contato_id)
  q = n.filial_id == null ? q.is('filial_id', null) : q.eq('filial_id', n.filial_id)
  const { data: msgs, error: em } = await q.order('created_at', { ascending: false }).limit(400)
  if (em) throw em
  const ult = msgs[0]?.created_at || ''
  const achada = msgs.find((m) => COMPRA.test(limpa(m.transcricao) || limpa(m.conteudo)))
  const pf = P.get(n.id) || {}
  const trecho = achada
    ? `[${achada.direcao === 'recebida' ? 'cliente' : 'loja'} ${achada.created_at.slice(0, 10)}] ${(limpa(achada.transcricao) || limpa(achada.conteudo)).slice(0, 220)}`
    : `[ficha da IA] ${limpa(pf.relato || pf.diagnostico).slice(0, 220)}`
  const c = C.get(n.contato_id) || {}
  linhas.push({ negocio_id: n.id, cliente: c.nome || '', telefone: c.telefone_e164 || c.telefone || '', loja: F.get(n.filial_id) || '',
    etapa: E.get(n.etapa_id) || '', status: n.status, responsavel: U.get(n.responsavel_id) || '(sem responsável)',
    ultima_interacao: ult ? new Date(Date.parse(ult) - 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : '(sem conversa)',
    trecho_compra: trecho, fonte_trecho: achada ? 'conversa' : 'ficha', classificacao_ia: pf.classificacao || '', conferido: '', observacao: '' })
}
linhas.sort((a, b) => b.ultima_interacao.localeCompare(a.ultima_interacao))
const cols = Object.keys(linhas[0])
const esc = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
fs.writeFileSync(SAIDA, '﻿' + [cols.join(';'), ...linhas.map((l) => cols.map((k) => esc(l[k])).join(';'))].join('\r\n'), 'utf8')
const por = (k) => linhas.reduce((o, l) => ((o[l[k]] = (o[l[k]] || 0) + 1), o), {})
console.log(JSON.stringify({ linhas: linhas.length, ids: ids.length, fonte: por('fonte_trecho'), status: por('status'), etapa: por('etapa'), loja: por('loja'),
  sem_responsavel: linhas.filter((l) => l.responsavel === '(sem responsável)').length }))
