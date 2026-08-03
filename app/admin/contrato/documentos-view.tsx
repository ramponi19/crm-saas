'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FilePlus2, FileText, Pencil, Archive, Trash2, ChevronRight, Info } from 'lucide-react'
import { Card, Button, Badge, Modal, Input, EmptyState, ConfirmDialog, notify } from '@/components/ui'

export interface DocumentoLista {
  id: number
  nome: string
  /** null = criado mas sem nenhuma versão salva ainda. */
  versao: number | null
  paginas: number
  emitidos: number
}

export function DocumentosView({ documentos }: { documentos: DocumentoLista[] }) {
  const router = useRouter()
  const [novoAberto, setNovoAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [renomear, setRenomear] = useState<DocumentoLista | null>(null)
  const [arquivar, setArquivar] = useState<DocumentoLista | null>(null)
  const [excluir, setExcluir] = useState<DocumentoLista | null>(null)
  /** O ConfirmDialog não se fecha sozinho — quem chama fecha, e mostra progresso. */
  const [agindo, setAgindo] = useState(false)

  async function criar() {
    if (!nome.trim()) { notify.warn('Dê um nome ao documento'); return }
    setSalvando(true)
    const r = await fetch('/api/contrato-documentos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome }),
    })
    const j = await r.json().catch(() => ({}))
    setSalvando(false)
    if (!r.ok) { notify.bad('Erro ao criar', j.error); return }
    setNovoAberto(false); setNome('')
    // Já abre o editor: o próximo passo é importar o PDF.
    router.push(`/admin/contrato/${j.documento.id}`)
  }

  async function patch(id: number, campos: Record<string, unknown>, msg: string) {
    const r = await fetch('/api/contrato-documentos', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...campos }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { notify.bad('Não foi possível salvar', j.error); return }
    notify.ok(msg)
    router.refresh()
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4 scrollbar-thin sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[900px] space-y-4">
        <Card
          title="Documentos da loja"
          actions={
            <Button onClick={() => { setNome(''); setNovoAberto(true) }} icon={<FilePlus2 size={15} strokeWidth={1.7} />}>
              Novo documento
            </Button>
          }
        >
          <p className="-mt-0.5 text-[12.5px] text-ink-2">
            Contrato de venda, termo de garantia, autorização de imagem — o que a sua loja usa. Importe de um PDF,
            marque onde entram os dados e, na hora de fechar a venda, o vendedor escolhe qual emitir.
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-control border border-line bg-raised px-3 py-2.5 text-[12px] text-ink-2">
            <Info size={14} strokeWidth={1.7} className="mt-0.5 shrink-0 text-ink-3" />
            <span>
              O CRM não traz nenhum documento pronto: as cláusulas são da sua loja. Sem documento cadastrado, a venda
              acontece normalmente, mas nada é emitido.
            </span>
          </div>
        </Card>

        {documentos.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FileText size={22} strokeWidth={1.7} />}
              title="Nenhum documento ainda"
              description="Crie o primeiro e importe o PDF que a sua loja já usa."
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {documentos.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-card border border-line bg-card p-3.5">
                <div className="grid h-10 w-10 flex-none place-items-center rounded-control bg-accent-soft text-accent">
                  <FileText size={19} strokeWidth={1.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-ink">{d.nome}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                    {d.versao
                      ? <Badge tone="ok">v{d.versao} · {d.paginas} página{d.paginas === 1 ? '' : 's'}</Badge>
                      : <Badge tone="warn">sem conteúdo</Badge>}
                    {d.emitidos > 0 && <span>{d.emitidos} emitido{d.emitidos === 1 ? '' : 's'}</span>}
                  </div>
                </div>
                <div className="flex flex-none items-center gap-1">
                  <Button variant="ghost" size="sm" icon={<Pencil size={14} strokeWidth={1.7} />}
                    onClick={() => setRenomear(d)}>
                    <span className="sr-only">Renomear</span>
                  </Button>
                  <Button variant="ghost" size="sm" title="Arquivar" icon={<Archive size={14} strokeWidth={1.7} />}
                    onClick={() => setArquivar(d)}>
                    <span className="sr-only">Arquivar</span>
                  </Button>
                  {/* Sempre habilitado: botão apagado sem explicação só deixa o
                      dono sem saída. Quem avisa é a confirmação, que muda de
                      texto quando o documento já foi emitido. */}
                  <Button variant="ghost" size="sm" className="text-bad hover:bg-bad/10"
                    title="Excluir" icon={<Trash2 size={14} strokeWidth={1.7} />}
                    onClick={() => setExcluir(d)}>
                    <span className="sr-only">Excluir</span>
                  </Button>
                  <Link href={`/admin/contrato/${d.id}`}
                    className="inline-flex h-9 items-center gap-1 rounded-control bg-ink px-3 text-[13px] font-medium text-white transition-colors hover:bg-ink/90">
                    {d.versao ? 'Editar' : 'Montar'} <ChevronRight size={15} strokeWidth={1.9} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={novoAberto} onClose={() => setNovoAberto(false)} size="sm" title="Novo documento"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNovoAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={criar} loading={salvando}>Criar e montar</Button>
          </>
        }>
        <form onSubmit={(e) => { e.preventDefault(); criar() }}>
          <Input label="Nome do documento" required value={nome} autoFocus
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Contrato de Compra e Venda" />
          <p className="mt-2 text-[11.5px] text-ink-3">
            É este nome que o vendedor vai ver ao escolher o documento na venda.
          </p>
        </form>
      </Modal>

      <Modal open={!!renomear} onClose={() => setRenomear(null)} size="sm" title="Renomear documento"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenomear(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (renomear) patch(renomear.id, { nome: renomear.nome }, 'Nome atualizado')
              setRenomear(null)
            }}>Salvar</Button>
          </>
        }>
        <Input label="Nome" value={renomear?.nome ?? ''} autoFocus
          onChange={(e) => setRenomear((d) => (d ? { ...d, nome: e.target.value } : d))} />
        <p className="mt-2 text-[11.5px] text-ink-3">
          Documentos já emitidos guardam o nome de quando foram assinados — renomear aqui não muda o passado.
        </p>
      </Modal>

      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(null)}
        loading={agindo}
        onConfirm={async () => {
          if (!excluir || agindo) return
          setAgindo(true)
          try {
            const r = await fetch('/api/contrato-documentos', {
              method: 'DELETE', headers: { 'Content-Type': 'application/json' },
              // A confirmação já explicou o efeito nas emissões.
              body: JSON.stringify({ id: excluir.id, cienteDasEmissoes: true }),
            })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) { notify.bad('Não foi possível excluir', j.error); return }
            notify.ok('Documento excluído',
              j.fundosRemovidos ? `${j.fundosRemovidos} imagem(ns) de fundo também removida(s)` : undefined)
            router.refresh()
          } finally {
            // Fecha em qualquer caso: modal aberto com o erro num toast atrás
            // deixa o usuário sem saber se a ação valeu.
            setAgindo(false)
            setExcluir(null)
          }
        }}
        title="Excluir documento?"
        description={
          `"${excluir?.nome ?? ''}" e todas as versões dele são apagados, junto com as imagens de fundo. Não tem volta.`
          + (excluir && excluir.emitidos > 0
            ? ` Atenção: ${excluir.emitidos} contrato(s) já foram emitidos deste documento. Eles NÃO se perdem — cada um guarda a própria cópia e a 2ª via continua saindo do Histórico. O que eles perdem é o vínculo com este modelo.`
            : ' Use isto quando o documento subiu errado; se for algo que você pode querer de novo, prefira Arquivar.')
        }
        confirmLabel="Excluir de vez"
        tone="danger"
      />

      <ConfirmDialog
        open={!!arquivar}
        onClose={() => setArquivar(null)}
        loading={agindo}
        onConfirm={async () => {
          if (!arquivar || agindo) return
          setAgindo(true)
          try { await patch(arquivar.id, { arquivado: true }, 'Documento arquivado') }
          finally { setAgindo(false); setArquivar(null) }
        }}
        title="Arquivar documento?"
        description={`"${arquivar?.nome ?? ''}" sai da lista e deixa de aparecer na venda. As versões ficam guardadas e os ${arquivar?.emitidos ?? 0} contrato(s) já emitido(s) continuam intactos.`}
        confirmLabel="Arquivar"
        tone="danger"
      />
    </main>
  )
}
