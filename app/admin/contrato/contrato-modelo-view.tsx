'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Save, Upload, Plus, Trash2, Eye, ChevronUp, ChevronDown, FileText, Sun, Moon,
  FileUp, Bold, Type, Braces,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, Button, Badge, notify } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  renderizarModelo, blocosDaPagina, MARCADORES_DISPONIVEIS,
  type PaginaModelo, type BlocoTexto, type DadosMescla,
} from '@/lib/contrato-modelo'

interface Props {
  empresaId: number
  versao: number | null
  paginasIniciais: PaginaModelo[]
  garantiaPadrao: number
  contratosEmitidos: number
}

const BUCKET = 'contratos'
/** Proporção A4 — a página na tela é só uma escala disto. */
const A4 = { w: 794, h: 1123 }

const paginaVazia = (ordem: number): PaginaModelo =>
  ({ ordem, fundo_url: null, escuro: false, blocos: [] })
const blocoVazio = (): BlocoTexto => ({ x: 9, y: 8, largura: 82, texto_html: '<p>Escreva aqui…</p>' })

// Dados de exemplo da pré-visualização — nenhuma venda é tocada.
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

/** Bloco editável posicionado sobre a página. */
function BlocoEditavel({
  bloco, escuro, revisao, selecionado, onSelecionar, onTexto,
}: {
  bloco: BlocoTexto; escuro: boolean; revisao: number; selecionado: boolean
  onSelecionar: () => void; onTexto: (html: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // O conteúdo é NÃO controlado de propósito: reescrever o innerHTML a cada
  // tecla mataria o cursor. Só sincroniza quando a revisão muda (import, troca
  // de página), nunca durante a digitação.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== bloco.texto_html) {
      ref.current.innerHTML = bloco.texto_html
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisao])

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onMouseDown={onSelecionar}
      onFocus={onSelecionar}
      onInput={(e) => onTexto(e.currentTarget.innerHTML)}
      className={cn('contrato-bloco absolute outline-none transition-shadow',
        selecionado ? 'ring-2 ring-accent/70' : 'hover:ring-1 hover:ring-accent/30',
        escuro ? 'text-[#e8e8e8]' : 'text-black')}
      style={{
        left: `${bloco.x}%`, top: `${bloco.y}%`, width: `${bloco.largura}%`,
        fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '1.42%', lineHeight: 1.6,
        textAlign: 'justify',
      }}
    />
  )
}

export function ContratoModeloView({ empresaId, versao, paginasIniciais, garantiaPadrao, contratosEmitidos }: Props) {
  const supabase = createClient()
  const [paginas, setPaginas] = useState<PaginaModelo[]>(() =>
    paginasIniciais.length
      ? [...paginasIniciais].sort((a, b) => a.ordem - b.ordem)
        .map((p) => ({ ...p, blocos: blocosDaPagina(p) }))
      : [paginaVazia(1)])
  const [revisao, setRevisao] = useState(0)
  const [sel, setSel] = useState<{ p: number; b: number } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [importando, setImportando] = useState<string | null>(null)
  const [naoMapeados, setNaoMapeados] = useState<string[]>([])
  const [sujo, setSujo] = useState(false)
  const inputVarios = useRef<HTMLInputElement>(null)
  const inputPdf = useRef<HTMLInputElement>(null)

  const mudarPagina = (i: number, campo: keyof PaginaModelo, valor: unknown) => {
    setPaginas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)))
    setSujo(true)
  }
  const mudarBloco = useCallback((pi: number, bi: number, campo: keyof BlocoTexto, valor: unknown) => {
    setPaginas((ps) => ps.map((p, j) => j !== pi ? p : {
      ...p, blocos: (p.blocos ?? []).map((b, k) => (k === bi ? { ...b, [campo]: valor } : b)),
    }))
    setSujo(true)
  }, [])

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

  /**
   * Importa o contrato de um PDF: fatia os fundos (sem o texto vir grudado),
   * detecta as colunas de texto e converte os campos em vermelho que dá para
   * reconhecer em marcador. O resto fica em vermelho para o lojista decidir.
   */
  async function importarPdf(file: File) {
    setImportando('Lendo o PDF…')
    try {
      const { importarContratoPDF } = await import('@/lib/contrato-importar-pdf')
      const r = await importarContratoPDF(file, {
        onProgresso: (feito, total) => setImportando(`Processando página ${feito} de ${total}…`),
      })
      const prontas: PaginaModelo[] = []
      for (let i = 0; i < r.paginas.length; i++) {
        const p = r.paginas[i]
        setImportando(`Enviando fundo ${i + 1} de ${r.paginas.length}…`)
        let url: string | null = null
        if (p.fundo) {
          url = await subir(new File([p.fundo], `pagina-${i + 1}.jpg`, { type: 'image/jpeg' }))
          if (!url) { setImportando(null); return }
        }
        prontas.push({ ordem: i + 1, fundo_url: url, escuro: p.escuro, blocos: p.blocos ?? [] })
      }
      setPaginas(prontas)
      setNaoMapeados([...new Set(r.paginas.flatMap((p) => p.camposNaoMapeados))])
      setRevisao((v) => v + 1)
      setSel(null)
      setSujo(true)
      setImportando(null)
      notify.ok(`${prontas.length} página(s) importada(s)`,
        r.totalNaoMapeados > 0
          ? `${r.totalMarcadores} campos viraram marcador; ${r.totalNaoMapeados} ficaram em vermelho para você decidir`
          : `${r.totalMarcadores} campos viraram marcador`)
    } catch (e) {
      setImportando(null)
      notify.bad('Não foi possível importar o PDF', e instanceof Error ? e.message : undefined)
    }
  }

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
    setSujo(true); setEnviando(false)
    notify.ok(`${urls.length} fundo(s) enviado(s)`)
  }

  /** Aplica formato no trecho selecionado do bloco em foco. */
  function formatar(cmd: 'bold' | 'clausula') {
    if (cmd === 'bold') { document.execCommand('bold'); return }
    // Título de cláusula: parágrafo em negrito, um pouco maior.
    document.execCommand('formatBlock', false, 'p')
    const s = window.getSelection()
    const bloco = s?.anchorNode?.parentElement?.closest('p')
    if (bloco) bloco.className = bloco.className === 'cl' ? '' : 'cl'
    sincronizarFoco()
  }

  function inserirMarcador(chave: string) {
    const marca = `{{${chave}}}`
    if (!sel) { navigator.clipboard.writeText(marca); notify.ok('Marcador copiado', marca); return }
    document.execCommand('insertText', false, marca)
    sincronizarFoco()
  }

  /** Lê de volta o HTML do bloco em foco (após execCommand). */
  function sincronizarFoco() {
    if (!sel) return
    const el = document.activeElement
    if (el instanceof HTMLElement && el.classList.contains('contrato-bloco')) {
      mudarBloco(sel.p, sel.b, 'texto_html', el.innerHTML)
    }
  }

  function prever() {
    const html = renderizarModelo(
      { id: 0, versao: 0, paginas: paginas.map((p, k) => ({ ...p, ordem: k + 1 })) },
      { ...EXEMPLO, garantia_dias: garantiaPadrao },
    )
    const w = window.open('', '_blank', 'width=880,height=1000')
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

  const blocoSel = sel ? (paginas[sel.p]?.blocos ?? [])[sel.b] : null

  return (
    <main className="flex-1 overflow-y-auto bg-bg px-4 py-4 scrollbar-thin sm:px-6 sm:py-6">
      {/* O texto dentro do bloco editável imita a impressão. */}
      <style>{`
        .contrato-bloco p{margin:0 0 1.9% 0}
        .contrato-bloco p.cl{font-weight:bold;margin:2.6% 0 1.4%;font-size:1.1em}
        .contrato-bloco .var{color:#c0392b;background:rgba(192,57,43,.10);border-radius:2px}
        .contrato-bloco:empty::before{content:'Clique para escrever';color:#94a3b8}
      `}</style>

      <div className="mx-auto max-w-[1000px] space-y-4">
        <Card
          title="Modelo do contrato"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={prever} icon={<Eye size={15} strokeWidth={1.7} />}>Pré-visualizar</Button>
              <Button onClick={salvar} loading={salvando} disabled={enviando || !!importando} icon={<Save size={15} strokeWidth={1.7} />}>
                {salvando ? 'Salvando…' : 'Salvar modelo'}
              </Button>
            </div>
          }
        >
          <p className="-mt-0.5 text-[12.5px] text-ink-2">
            O contrato da sua loja. Escreva direto sobre a página, como vai imprimir. Onde entram os dados da venda,
            use um marcador — o sistema preenche ao finalizar.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
            {versao ? <Badge tone="ok">Versão {versao} em uso</Badge> : <Badge tone="warn">Nenhum modelo salvo</Badge>}
            {contratosEmitidos > 0 && (
              <span>{contratosEmitidos} contrato(s) já emitido(s) — salvar uma versão nova não altera nenhum deles.</span>
            )}
            {sujo && <Badge tone="warn">Alterações não salvas</Badge>}
          </div>

          <div className="mt-4 space-y-3 rounded-control border border-dashed border-line bg-raised p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button loading={!!importando} disabled={enviando} onClick={() => inputPdf.current?.click()}
                icon={<FileUp size={15} strokeWidth={1.7} />}>
                Importar contrato de um PDF
              </Button>
              <span className="text-[12px] text-ink-3">
                {importando ?? 'Um arquivo só: separa as páginas, detecta as colunas de texto e marca os campos.'}
              </span>
            </div>
            <input ref={inputPdf} type="file" accept="application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importarPdf(f); e.target.value = '' }} />
            <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-3">
              <Button variant="outline" size="sm" loading={enviando} disabled={!!importando}
                onClick={() => inputVarios.current?.click()} icon={<Upload size={14} strokeWidth={1.7} />}>
                Ou enviar os fundos como imagem
              </Button>
              <span className="text-[12px] text-ink-3">Para quem já tem as páginas em JPG/PNG.</span>
            </div>
            <input ref={inputVarios} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { if (e.target.files?.length) enviarVarios(e.target.files); e.target.value = '' }} />
          </div>

          {naoMapeados.length > 0 && (
            <div className="mt-3 rounded-control border border-[#f59e0b]/40 bg-[#fffbeb] px-3 py-2.5 text-[12px] text-[#92400e]">
              <strong>{naoMapeados.length} campo(s) do molde ficaram sem marcador.</strong> Aparecem em vermelho no
              texto. Troque por um marcador quando for dado da venda; escreva o valor fixo quando for dado da sua loja
              (CNPJ, sede, representante, banco).
              <div className="mt-1.5 flex flex-wrap gap-1">
                {naoMapeados.slice(0, 20).map((c, i) => (
                  <code key={`${c}-${i}`} className="rounded bg-white/70 px-1.5 py-0.5">{c || '(vazio)'}</code>
                ))}
                {naoMapeados.length > 20 && <span>+{naoMapeados.length - 20}</span>}
              </div>
            </div>
          )}
        </Card>

        {/* Barra de edição do bloco selecionado */}
        <div className="sticky top-0 z-20 rounded-card border border-line bg-card/95 p-3 backdrop-blur">
          {blocoSel && sel ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  Página {sel.p + 1} · bloco {sel.b + 1}
                </span>
                <Button variant="outline" size="sm" onClick={() => formatar('bold')} icon={<Bold size={13} strokeWidth={2} />}>Negrito</Button>
                <Button variant="outline" size="sm" onClick={() => formatar('clausula')} icon={<Type size={13} strokeWidth={1.8} />}>Título de cláusula</Button>
                <div className="ml-auto flex items-center gap-2">
                  {(['x', 'y', 'largura'] as const).map((campo) => (
                    <label key={campo} className="flex items-center gap-1 text-[11px] text-ink-3">
                      {campo === 'largura' ? 'larg' : campo}
                      <input type="number" min={0} max={100} step={0.5} value={blocoSel[campo]}
                        onChange={(e) => mudarBloco(sel.p, sel.b, campo, Number(e.target.value))}
                        className="h-7 w-16 rounded-control border border-line bg-bg px-1.5 text-right text-[12px] text-ink outline-none focus:border-accent" />
                      %
                    </label>
                  ))}
                  <Button variant="ghost" size="sm" className="text-bad hover:bg-bad/10" icon={<Trash2 size={13} strokeWidth={1.7} />}
                    onClick={() => {
                      setPaginas((ps) => ps.map((p, j) => j !== sel.p ? p
                        : { ...p, blocos: (p.blocos ?? []).filter((_, k) => k !== sel.b) }))
                      setSel(null); setRevisao((v) => v + 1); setSujo(true)
                    }}>
                    <span className="sr-only">Remover bloco</span>
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Braces size={13} strokeWidth={1.8} className="mr-0.5 text-ink-3" />
                {MARCADORES_DISPONIVEIS.map((m) => (
                  <button key={m.chave} type="button" title={m.rotulo} onClick={() => inserirMarcador(m.chave)}
                    className="rounded-full border border-line bg-card px-2 py-0.5 text-[11px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent">
                    {m.rotulo}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-3">Clique num texto da página para editar, ou em “Adicionar bloco de texto”.</p>
          )}
        </div>

        {paginas.map((p, i) => (
          <Card key={i} title={`Página ${i + 1}`} actions={
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => mudarPagina(i, 'escuro', !p.escuro)}
                icon={p.escuro ? <Moon size={14} strokeWidth={1.8} /> : <Sun size={14} strokeWidth={1.8} />}>
                {p.escuro ? 'Escura' : 'Clara'}
              </Button>
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]; e.target.value = ''
                    if (!f) return
                    setEnviando(true); const u = await subir(f); setEnviando(false)
                    if (u) mudarPagina(i, 'fundo_url', u)
                  }} />
                <span className="flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[12.5px] font-medium text-ink-2 hover:bg-line-soft hover:text-ink">
                  <Upload size={13} strokeWidth={1.8} /> Fundo
                </span>
              </label>
              <Button variant="ghost" size="sm" disabled={i === 0} icon={<ChevronUp size={14} strokeWidth={1.8} />}
                onClick={() => { setPaginas((ps) => { const o = [...ps]; [o[i - 1], o[i]] = [o[i], o[i - 1]]; return o }); setSel(null); setRevisao(v => v + 1); setSujo(true) }}>
                <span className="sr-only">Subir</span>
              </Button>
              <Button variant="ghost" size="sm" disabled={i === paginas.length - 1} icon={<ChevronDown size={14} strokeWidth={1.8} />}
                onClick={() => { setPaginas((ps) => { const o = [...ps]; [o[i + 1], o[i]] = [o[i], o[i + 1]]; return o }); setSel(null); setRevisao(v => v + 1); setSujo(true) }}>
                <span className="sr-only">Descer</span>
              </Button>
              <Button variant="ghost" size="sm" className="text-bad hover:bg-bad/10" icon={<Trash2 size={14} strokeWidth={1.7} />}
                onClick={() => { setPaginas((ps) => ps.filter((_, j) => j !== i)); setSel(null); setRevisao(v => v + 1); setSujo(true) }}>
                <span className="sr-only">Remover página</span>
              </Button>
            </div>
          }>
            <div
              className={cn('relative mx-auto w-full overflow-hidden rounded-control border border-line',
                p.escuro ? 'bg-ink' : 'bg-white')}
              style={{
                aspectRatio: `${A4.w} / ${A4.h}`,
                maxWidth: 680,
                backgroundImage: p.fundo_url ? `url('${p.fundo_url}')` : undefined,
                backgroundSize: 'cover', backgroundPosition: 'center top',
              }}
            >
              {(p.blocos ?? []).map((b, j) => (
                <BlocoEditavel
                  key={`${revisao}-${i}-${j}`}
                  bloco={b}
                  escuro={p.escuro}
                  revisao={revisao}
                  selecionado={sel?.p === i && sel?.b === j}
                  onSelecionar={() => setSel({ p: i, b: j })}
                  onTexto={(html) => mudarBloco(i, j, 'texto_html', html)}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button variant="outline" size="sm" icon={<Plus size={13} strokeWidth={1.8} />}
                onClick={() => {
                  setPaginas((ps) => ps.map((pp, j) => j !== i ? pp : { ...pp, blocos: [...(pp.blocos ?? []), blocoVazio()] }))
                  setSel({ p: i, b: (p.blocos ?? []).length }); setRevisao((v) => v + 1); setSujo(true)
                }}>
                Adicionar bloco de texto
              </Button>
              {p.fundo_url && (
                <button type="button" onClick={() => mudarPagina(i, 'fundo_url', null)}
                  className="text-[11px] text-ink-3 hover:text-bad">Remover fundo</button>
              )}
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
            No Histórico, a 2ª via reimprime o documento arquivado — nunca gera um novo. Sem modelo salvo, a venda
            acontece mas nenhum contrato é emitido.
          </span>
        </div>
      </div>
    </main>
  )
}
