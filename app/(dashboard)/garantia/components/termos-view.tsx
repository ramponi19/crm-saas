'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FileSignature, Printer, Upload, ExternalLink, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Card, Table, Button, Badge, EmptyState, Modal, notify, type Column } from '@/components/ui'
import { imprimirContratoHTML } from '@/lib/contrato-tipos'
import { emitirContrato, type DocumentoDisponivel } from '@/lib/contrato-emitir'

export interface TrocaDoTermo { aparelho: string; imei: string | null; valor: number }

export interface VendaTermo {
  /** id do TERMO (vendas_termos), não da venda. */
  id: number
  venda_id: number
  tipo: string
  /** Aparelhos recebidos em troca — preenchem o termo de entrega do usado. */
  trocas: TrocaDoTermo[]
  data_venda: string | null
  valor_venda: number
  cliente_id: number | null
  cliente_nome: string | null
  cliente_telefone: string | null
  produto_nome: string | null
  numero_serie: string | null
  vendedor_nome: string | null
  forma_pagamento: string | null
  parcelas: number | null
  desconto_valor: number | null
  quantidade: number | null
  status: string
  assinado_em: string | null
  anexado_por: string | null
}

const ROTULO_TIPO: Record<string, string> = {
  garantia: 'Garantia',
  troca: 'Entrega do usado',
}

interface Props {
  vendas: VendaTermo[]
  documentos: DocumentoDisponivel[]
  empresaId: number
}

const soDigitos = (t: string | null) => (t || '').replace(/\D/g, '')

/**
 * Termos de garantia por venda: imprimir para assinatura e anexar o assinado.
 *
 * Fica separado dos protocolos de assistência — que são o aparelho VOLTANDO com
 * defeito. Aqui é o papel que sai junto com a venda. Misturar os dois na mesma
 * lista faria a fila de "falta assinatura" se perder no meio de reparos.
 */
export function TermosView({ vendas, documentos, empresaId }: Props) {
  const router = useRouter()
  const [emitindo, setEmitindo] = useState<number | null>(null)
  const [escolhendoDoc, setEscolhendoDoc] = useState<VendaTermo | null>(null)
  const [enviando, setEnviando] = useState<number | null>(null)
  const [alvoUpload, setAlvoUpload] = useState<number | null>(null)
  const inputArquivo = useRef<HTMLInputElement>(null)

  const pendentes = vendas.filter((v) => v.status === 'pendente')
  const assinados = vendas.filter((v) => v.status === 'assinado')

  /** Emite o documento escolhido com os dados da venda e abre para impressão. */
  async function imprimir(v: VendaTermo, doc: DocumentoDisponivel) {
    setEscolhendoDoc(null)
    setEmitindo(v.id)
    const supabase = createClient()
    try {
      const r = await emitirContrato(supabase, {
        empresaId, documentoId: doc.id, nomeDocumento: doc.nome,
        clienteId: v.cliente_id, vendaIds: [v.venda_id],
        itens: [{ descricao: v.produto_nome ?? 'Produto', imei: v.numero_serie, valor: v.valor_venda, garantia_dias: null }],
        total: v.valor_venda, desconto: v.desconto_valor ?? 0,
        forma_pagamento: v.forma_pagamento, parcelas: v.parcelas,
        vendedor: v.vendedor_nome, data: v.data_venda ?? undefined,
        // Os aparelhos da troca alimentam {{trocas}} e companhia — é o que faz o
        // termo de entrega do usado ter conteúdo em vez de espaço em branco.
        trocas: v.trocas,
      })
      // Recusado: a loja não está identificada. Não há documento a imprimir.
      if (r.bloqueado) { notify.bad('Contrato não emitido', r.bloqueado); return }
      if (r.semModelo) { notify.warn(`"${doc.nome}" não tem conteúdo`, 'Monte o documento em Administração → Documentos'); return }
      if (!r.html) { notify.bad('Não foi possível emitir'); return }
      // Cadastro incompleto: o contrato imprime o espaço em branco calado, então
      // avisa ANTES de o papel ir para a mão do cliente.
      if (r.faltando?.length) {
        notify.warn('Contrato saiu com campos em branco', 'Falta no cadastro do cliente: ' + r.faltando.join(', ') + '.')
      }
      // O mesmo para a LOJA: contrato que não identifica a vendedora não
      // identifica as partes. Só avisa do que este modelo realmente usa.
      if (r.faltandoLoja?.length) {
        notify.warn('Falta o cadastro da sua loja', 'O contrato pede: ' + r.faltandoLoja.join(', ') + '. Preencha em Administração → Minha empresa.')
      }
      if (!imprimirContratoHTML(r.html)) notify.warn('Permita pop-ups para imprimir')
    } catch (e) {
      notify.bad('Erro ao emitir', e instanceof Error ? e.message : undefined)
    } finally {
      setEmitindo(null)
    }
  }

  async function enviarArquivo(file: File) {
    if (!alvoUpload) return
    const dados = new FormData()
    dados.append('termoId', String(alvoUpload))
    dados.append('arquivo', file)
    setEnviando(alvoUpload)
    try {
      const r = await fetch('/api/garantia/termo', { method: 'POST', body: dados })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { notify.bad('Não foi possível anexar', j.error); return }
      notify.ok('Termo assinado anexado')
      router.refresh()
    } finally {
      setEnviando(null)
      setAlvoUpload(null)
    }
  }

  /** Link temporário do arquivo — o bucket é privado. */
  async function abrirArquivo(termoId: number, paraWhatsApp?: string | null) {
    const r = await fetch(`/api/garantia/termo?termoId=${termoId}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.url) { notify.bad('Não foi possível abrir', j.error); return }
    if (paraWhatsApp) {
      const msg = `Segue o termo de garantia assinado da sua compra:\n\n${j.url}\n\n(o link vale por 10 minutos)`
      window.open(`https://wa.me/55${soDigitos(paraWhatsApp)}?text=${encodeURIComponent(msg)}`, '_blank')
      return
    }
    window.open(j.url, '_blank')
  }

  const colunas = (assinado: boolean): Column<VendaTermo>[] => [
    {
      key: 'data', header: 'Data', className: 'num w-[110px]',
      render: (v) => <span className="text-ink-2">{v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '—'}</span>,
    },
    {
      // O tipo precisa estar visível: a mesma venda pode ter dois termos, e sem
      // isso viram duas linhas idênticas na fila.
      key: 'tipo', header: 'Termo', className: 'w-[130px]',
      render: (v) => <Badge tone={v.tipo === 'troca' ? 'acc' : 'neutro'}>{ROTULO_TIPO[v.tipo] ?? v.tipo}</Badge>,
    },
    {
      key: 'cliente', header: 'Cliente / Produto',
      render: (v) => (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-ink">{v.cliente_nome ?? '— sem cliente —'}</div>
          <div className="truncate text-[11px] text-ink-3">
            {v.tipo === 'troca' && v.trocas.length
              ? `Recebido: ${v.trocas.map((t) => t.aparelho || 'aparelho').join(', ')}`
              : <>{(v.quantidade ?? 1) > 1 ? `${v.quantidade}× ` : ''}{v.produto_nome ?? '—'}{v.numero_serie ? ` · ··${v.numero_serie.slice(-4)}` : ''}</>}
          </div>
        </div>
      ),
    },
    { key: 'valor', header: 'Valor', align: 'right', className: 'num', render: (v) => <span className="font-semibold text-ink">{formatCurrency(v.valor_venda)}</span> },
    {
      key: 'situacao', header: 'Situação', align: 'right',
      render: (v) => assinado
        ? <div className="flex flex-col items-end gap-0.5">
            <Badge tone="ok">Assinado</Badge>
            {v.assinado_em && (
              <span className="text-[10.5px] text-ink-3">
                {new Date(v.assinado_em).toLocaleDateString('pt-BR')}{v.anexado_por ? ` · ${v.anexado_por}` : ''}
              </span>
            )}
          </div>
        : <Badge tone="warn">Aguardando assinatura</Badge>,
    },
    {
      key: 'acoes', header: '', align: 'right',
      render: (v) => (
        <div className="flex justify-end gap-1.5">
          {!assinado && (
            <>
              <Button size="sm" variant="outline" icon={<Printer size={12} strokeWidth={1.8} />}
                loading={emitindo === v.id}
                onClick={(e) => { e.stopPropagation(); setEscolhendoDoc(v) }}>
                Imprimir
              </Button>
              <Button size="sm" icon={<Upload size={12} strokeWidth={1.8} />}
                loading={enviando === v.id}
                onClick={(e) => { e.stopPropagation(); setAlvoUpload(v.id); inputArquivo.current?.click() }}>
                Anexar assinado
              </Button>
            </>
          )}
          {assinado && (
            <>
              <Button size="sm" variant="outline" icon={<ExternalLink size={12} strokeWidth={1.8} />}
                onClick={(e) => { e.stopPropagation(); abrirArquivo(v.id) }}>
                Ver
              </Button>
              {v.cliente_telefone && (
                <Button size="sm" variant="outline" icon={<MessageCircle size={12} strokeWidth={1.8} />}
                  onClick={(e) => { e.stopPropagation(); abrirArquivo(v.id, v.cliente_telefone) }}>
                  Enviar
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<Upload size={12} strokeWidth={1.8} />}
                loading={enviando === v.id}
                onClick={(e) => { e.stopPropagation(); setAlvoUpload(v.id); inputArquivo.current?.click() }}>
                Substituir
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <input
        ref={inputArquivo} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); e.target.value = '' }}
      />

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[14px] font-semibold text-ink">Aguardando assinatura</h2>
          <span className="text-[12px] text-ink-3">{pendentes.length} {pendentes.length === 1 ? 'venda' : 'vendas'}</span>
        </div>
        <Card flush>
          <Table
            columns={colunas(false)}
            rows={pendentes}
            rowKey={(v) => v.id}
            empty={<EmptyState
              icon={<FileSignature size={22} strokeWidth={1.7} />}
              title="Nenhum termo aguardando"
              description='No PDV, marque "Termo de garantia a assinar" ao fechar a venda para a compra aparecer aqui.'
            />}
          />
        </Card>
      </div>

      {assinados.length > 0 && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[14px] font-semibold text-ink">Assinados</h2>
            <span className="text-[12px] text-ink-3">{assinados.length}</span>
          </div>
          <Card flush>
            <Table columns={colunas(true)} rows={assinados} rowKey={(v) => v.id} />
          </Card>
        </div>
      )}

      {/* Qual documento imprimir. A loja pode ter mais de um termo (garantia de
          aparelho novo, de seminovo, de serviço) — quem escolhe é quem atende. */}
      <Modal
        open={escolhendoDoc !== null}
        onClose={() => setEscolhendoDoc(null)}
        size="sm"
        title="Qual documento imprimir?"
      >
        {documentos.length === 0 ? (
          <p className="text-[13px] text-ink-2">
            Nenhum documento cadastrado. Suba o seu termo de garantia em{' '}
            <strong>Administração → Documentos</strong> — o CRM não traz um modelo pronto,
            porque o texto do termo é da loja.
          </p>
        ) : (
          <div className="space-y-2">
            {documentos.map((d) => (
              <button key={d.id} type="button"
                onClick={() => escolhendoDoc && imprimir(escolhendoDoc, d)}
                className="flex w-full items-center justify-between rounded-control border border-line px-3 py-2.5 text-left text-[13px] text-ink transition-colors hover:border-accent hover:bg-accent-soft">
                <span>{d.nome}</span>
                <Printer size={14} strokeWidth={1.7} className="text-ink-3" />
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
