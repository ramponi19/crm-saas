'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Save, Upload, Plus, Trash2, Eye, ChevronUp, ChevronDown, FileText, Sun, Moon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, Button, Badge, notify } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  renderizarModelo, MARCADORES_DISPONIVEIS,
  type PaginaModelo, type DadosMescla,
} from '@/lib/contrato-modelo'

interface Props {
  empresaId: number
  versao: number | null
  paginasIniciais: PaginaModelo[]
  garantiaPadrao: number
  contratosEmitidos: number
}

const BUCKET = 'contratos'
const paginaVazia = (ordem: number): PaginaModelo => ({ ordem, fundo_url: null, escuro: false, texto_html: '' })

// Dados de exemplo para a pré-visualização — nenhuma venda é tocada.
const EXEMPLO: Omit<DadosMescla, 'garantia_dias'> = {
  loja: { nome: 'Sua Loja', cnpj: '00.000.000/0001-00', telefone: '(00) 0000-0000', logoUrl: null },
  comprador: {
    nome: 'Maria Souza Lima', cpf_cnpj: '000.000.000-00', nacionalidade: 'brasileira',
    estado_civil: 'solteira', profissao: 'designer', data_nascimento: null, telefone: '(11) 90000-0000',
    endereco: 'Rua das Flores', numero: '100', complemento: 'Apto 12', bairro: 'Centro',
    cidade: 'São Paulo', estado: 'SP', cep: '01000-000',
  },
  itens: [
    { descricao: 'iPhone 15 Pro 256GB', imei: '350000000000001', valor: 5000, garantia_dias: 90 },
    { descricao: 'Acessório: Película', imei: null, valor: 300, garantia_dias: 90 },
  ],
  total: 5300, desconto: 0, forma_pagamento: 'credito', parcelas: 10,
  vendedor: 'Vendedor Exemplo', data: undefined,
}

export function ContratoModeloView({ empresaId, versao, paginasIniciais, garantiaPadrao, contratosEmitidos }: Props) {
  const supabase = createClient()
  const [paginas, setPaginas] = useState<PaginaModelo[]>(
    paginasIniciais.length ? [...paginasIniciais].sort((a, b) => a.ordem - b.ordem) : [paginaVazia(1)],
  )
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [sujo, setSujo] = useState(false)
  const [focada, setFocada] = useState(0)
  const areas = useRef<(HTMLTextAreaElement | null)[]>([])
  const inputVarios = useRef<HTMLInputElement>(null)

  const alterar = (i: number, campo: keyof PaginaModelo, valor: unknown) => {
    setPaginas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)))
    setSujo(true)
  }

  /** Sobe um arquivo e devolve a URL pública. Caminho único: nunca sobrescreve. */
  async function subir(file: File): Promise<string | null> {
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const caminho = `${empresaId}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, file, {
      cacheControl: '31536000', upsert: false, contentType: file.type || undefined,
    })
    if (error) { notify.bad('Falha ao enviar imagem', error.message); return null }
    return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl
  }

  async function enviarFundoDaPagina(i: number, file: File) {
    setEnviando(true)
    const url = await subir(file)
    setEnviando(false)
    if (url) alterar(i, 'fundo_url', url)
  }

  /**
   * Sobe vários fundos de uma vez, na ordem alfabética do nome — é o caminho
   * para um contrato de N páginas desenhadas (1.jpg, 2.jpg, …).
   * Reaproveita as páginas existentes e cria as que faltarem.
   */
  async function enviarVarios(files: FileList) {
    const lista = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }))
    setEnviando(true)
    const urls: string[] = []
    for (const f of lista) {
      const u = await subir(f)
      if (!u) { setEnviando(false); return }
      urls.push(u)
    }
    setPaginas((ps) => {
      const out = [...ps]
      urls.forEach((url, idx) => {
        if (out[idx]) out[idx] = { ...out[idx], fundo_url: url }
        else out.push({ ...paginaVazia(idx + 1), fundo_url: url })
      })
      return out.map((p, k) => ({ ...p, ordem: k + 1 }))
    })
    setSujo(true)
    setEnviando(false)
    notify.ok(`${urls.length} ${urls.length === 1 ? 'fundo enviado' : 'fundos enviados'}`, 'Agora escreva o texto de cada página')
  }

  function inserirMarcador(chave: string) {
    const el = areas.current[focada]
    const marca = `{{${chave}}}`
    if (!el) { navigator.clipboard.writeText(marca); notify.ok('Marcador copiado', marca); return }
    const ini = el.selectionStart ?? el.value.length
    const fim = el.selectionEnd ?? ini
    const novo = el.value.slice(0, ini) + marca + el.value.slice(fim)
    alterar(focada, 'texto_html', novo)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ini + marca.length, ini + marca.length) })
  }

  function prever() {
    const html = renderizarModelo(
      { id: 0, versao: 0, paginas: paginas.map((p, k) => ({ ...p, ordem: k + 1 })) },
      { ...EXEMPLO, garantia_dias: garantiaPadrao },
    )
    // Tira a impressão automática: aqui é só conferir na tela.
    const w = window.open('', '_blank', 'width=860,height=980')
    if (!w) { notify.warn('Permita pop-ups para pré-visualizar'); return }
    w.document.open(); w.document.write(html.replace(/<script>[\s\S]*?<\/script>/, '')); w.document.close()
  }

  async function salvar() {
    setSalvando(true)
    const r = await fetch('/api/contrato-modelo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paginas: paginas.map((p, k) => ({ ...p, ordem: k + 1 })) }),
    })
    const j = await r.json().catch(() => ({}))
    setSalvando(false)
    if (!r.ok) { notify.bad('Erro ao salvar', j.error ?? 'Tente novamente'); return }
    setSujo(false)
    notify.ok(`Modelo salvo (versão ${j.modelo?.versao ?? '—'})`, 'Vale para as próximas vendas')
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg px-4 py-4 scrollbar-thin sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1000px] space-y-4">
        <Card
          title="Modelo do contrato"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={prever} icon={<Eye size={15} strokeWidth={1.7} />}>Pré-visualizar</Button>
              <Button onClick={salvar} loading={salvando} disabled={enviando} icon={<Save size={15} strokeWidth={1.7} />}>
                {salvando ? 'Salvando…' : 'Salvar modelo'}
              </Button>
            </div>
          }
        >
          <p className="-mt-0.5 text-[12.5px] text-ink-2">
            O contrato da sua loja: uma ou mais páginas A4, cada uma com uma imagem de fundo (o layout) e o texto
            por cima. Onde entram os dados da venda, use um marcador — o sistema preenche na hora de finalizar.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
            {versao ? <Badge tone="ok">Versão {versao} em uso</Badge> : <Badge tone="warn">Nenhum modelo salvo</Badge>}
            {contratosEmitidos > 0 && (
              <span>{contratosEmitidos} contrato{contratosEmitidos === 1 ? '' : 's'} já emitido{contratosEmitidos === 1 ? '' : 's'} — salvar uma versão nova não altera nenhum deles.</span>
            )}
            {sujo && <Badge tone="warn">Alterações não salvas</Badge>}
          </div>

          <div className="mt-4 rounded-control border border-dashed border-line bg-raised p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" loading={enviando} onClick={() => inputVarios.current?.click()}
                icon={<Upload size={15} strokeWidth={1.7} />}>
                Enviar os fundos do contrato
              </Button>
              <span className="text-[12px] text-ink-3">
                Pode selecionar todas as páginas de uma vez — a ordem segue o nome do arquivo (1, 2, 3…).
              </span>
            </div>
            <input ref={inputVarios} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { if (e.target.files?.length) enviarVarios(e.target.files); e.target.value = '' }} />
          </div>
        </Card>

        <Card title="Marcadores disponíveis">
          <p className="-mt-0.5 mb-3 text-[12.5px] text-ink-2">
            Clique para inserir no texto da página em que você está. Os dados fixos da loja (CNPJ, endereço,
            representante legal, banco) você escreve como texto normal.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MARCADORES_DISPONIVEIS.map((m) => (
              <button key={m.chave} type="button" title={m.rotulo} onClick={() => inserirMarcador(m.chave)}
                className="rounded-full border border-line bg-card px-2.5 py-1 text-[11.5px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent">
                {`{{${m.chave}}}`}
              </button>
            ))}
          </div>
        </Card>

        {paginas.map((p, i) => (
          <Card key={i} title={`Página ${i + 1}`} actions={
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" disabled={i === 0} icon={<ChevronUp size={14} strokeWidth={1.8} />}
                onClick={() => setPaginas((ps) => { const o = [...ps]; [o[i - 1], o[i]] = [o[i], o[i - 1]]; setSujo(true); return o })}>
                <span className="sr-only">Subir</span>
              </Button>
              <Button variant="ghost" size="sm" disabled={i === paginas.length - 1} icon={<ChevronDown size={14} strokeWidth={1.8} />}
                onClick={() => setPaginas((ps) => { const o = [...ps]; [o[i + 1], o[i]] = [o[i], o[i + 1]]; setSujo(true); return o })}>
                <span className="sr-only">Descer</span>
              </Button>
              <Button variant="ghost" size="sm" className="text-bad hover:bg-bad/10" icon={<Trash2 size={14} strokeWidth={1.7} />}
                onClick={() => { setPaginas((ps) => ps.filter((_, j) => j !== i)); setSujo(true) }}>
                <span className="sr-only">Remover página</span>
              </Button>
            </div>
          }>
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <div>
                <div className={cn('relative mb-2 grid aspect-[794/1123] place-items-center overflow-hidden rounded-control border border-line',
                  p.escuro ? 'bg-ink' : 'bg-raised')}>
                  {p.fundo_url
                    ? <Image src={p.fundo_url} alt={`Fundo da página ${i + 1}`} fill sizes="200px" className="object-cover" unoptimized />
                    : <span className="px-2 text-center text-[11px] text-ink-3">Sem fundo<br />(página branca)</span>}
                </div>
                <label className="block">
                  <span className="sr-only">Enviar fundo</span>
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarFundoDaPagina(i, f); e.target.value = '' }} />
                  <span className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-line text-[12px] font-medium text-ink-2 hover:border-accent hover:text-accent">
                    <Upload size={13} strokeWidth={1.8} /> {p.fundo_url ? 'Trocar fundo' : 'Enviar fundo'}
                  </span>
                </label>
                <button type="button" onClick={() => alterar(i, 'escuro', !p.escuro)}
                  className="mt-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-control border border-line text-[12px] font-medium text-ink-2 hover:border-accent hover:text-accent">
                  {p.escuro ? <Moon size={13} strokeWidth={1.8} /> : <Sun size={13} strokeWidth={1.8} />}
                  {p.escuro ? 'Fundo escuro' : 'Fundo claro'}
                </button>
                {p.fundo_url && (
                  <button type="button" onClick={() => alterar(i, 'fundo_url', null)}
                    className="mt-1.5 w-full text-[11px] text-ink-3 hover:text-bad">Remover fundo</button>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[12.5px] font-medium text-ink-2">
                  Texto sobre o fundo <span className="font-normal text-ink-3">— deixe vazio para página só de imagem (capa)</span>
                </label>
                <textarea
                  ref={(el) => { areas.current[i] = el }}
                  value={p.texto_html}
                  onFocus={() => setFocada(i)}
                  onChange={(e) => alterar(i, 'texto_html', e.target.value)}
                  rows={12}
                  spellCheck={false}
                  placeholder={'<p><strong>COMPRADOR</strong></p>\n<p>{{cliente.nome}}, {{cliente.nacionalidade}}, CPF {{cliente.cpf}}…</p>'}
                  className="w-full rounded-control border border-line bg-bg px-3 py-2 font-mono text-[12px] leading-relaxed text-ink outline-none focus:border-accent"
                />
                <p className="mt-1 text-[11px] text-ink-3">
                  Aceita HTML simples: <code>&lt;p&gt;</code>, <code>&lt;strong&gt;</code>,
                  <code>&lt;p class=&quot;cl&quot;&gt;</code> para título de cláusula,
                  <code>class=&quot;i1&quot;/&quot;i2&quot;</code> para recuo.
                </p>
              </div>
            </div>
          </Card>
        ))}

        <Button variant="outline" icon={<Plus size={15} strokeWidth={1.7} />}
          onClick={() => { setPaginas((ps) => [...ps, paginaVazia(ps.length + 1)]); setSujo(true) }}>
          Adicionar página
        </Button>

        <div className="flex items-start gap-2 rounded-control border border-line bg-raised px-3 py-2.5 text-[12px] text-ink-2">
          <FileText size={14} strokeWidth={1.7} className="mt-0.5 shrink-0 text-ink-3" />
          <span>
            Ao finalizar uma venda, o contrato é preenchido, impresso e <strong className="text-ink">arquivado</strong>.
            No Histórico, a 2ª via reimprime o documento arquivado — nunca gera um novo.
          </span>
        </div>
      </div>
    </main>
  )
}
