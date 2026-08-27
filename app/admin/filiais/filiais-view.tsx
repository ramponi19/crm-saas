'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Button, Input, Select, Modal, Badge, notify } from '@/components/ui'
import { Plus, Pencil, Store, Crown, Power, Users, UserRoundX, TriangleAlert } from 'lucide-react'
import { CAMPOS_FILIAL, rotuloDaFilial, type Filial, type FilialForm } from '@/lib/filiais'
import type { ResumoFilial } from './page'

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const VAZIO: FilialForm = {
  nome: '', cnpj: null, telefone: null, email: null,
  cep: null, endereco: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null,
  representante_nome: null, representante_cpf: null,
}

interface Props {
  filiais: Filial[]
  resumo: Record<number, ResumoFilial>
  pessoasSemLoja: number
  leadsSemLoja: number
}

export default function FiliaisView({ filiais, resumo, pessoasSemLoja, leadsSemLoja }: Props) {
  const router = useRouter()
  const [editor, setEditor] = useState<{ id?: number; form: FilialForm } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const ativas = filiais.filter((f) => f.ativo)
  const separando = ativas.length >= 2

  async function agir(acao: string, corpo: Record<string, unknown>, chave: string) {
    setOcupado(chave)
    const r = await fetch('/api/admin/filiais', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, ...corpo }),
    })
    const j = await r.json().catch(() => ({}))
    setOcupado(null)
    if (!r.ok || j?.error) { notify.bad('Não deu certo', j?.error); return false }
    router.refresh()
    return true
  }

  async function salvar() {
    if (!editor) return
    if (!editor.form.nome.trim()) { notify.bad('Dê um nome à loja'); return }
    const novo = editor.id == null
    const ok = await agir(novo ? 'criar' : 'atualizar', { id: editor.id, dados: editor.form }, 'salvar')
    if (!ok) return
    setEditor(null)
    notify.ok(novo ? 'Loja cadastrada' : 'Loja atualizada')
  }

  const set = (k: keyof FilialForm, v: string) =>
    setEditor((p) => (p ? { ...p, form: { ...p.form, [k]: v } } : p))

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg">
      <Topbar title="Filiais" />
      <div className="mx-auto w-full max-w-[820px] min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold text-ink">Filiais</h1>
            <p className="mt-0.5 max-w-[560px] text-[13px] text-ink-3">
              Cada loja tem os dados jurídicos dela — CNPJ, endereço e quem assina — e
              a sua própria operação. Com duas ou mais lojas cadastradas, o CRM passa a
              separar as informações e você escolhe no topo em qual quer trabalhar.
            </p>
          </div>
          <Button
            icon={<Plus size={15} strokeWidth={1.8} />}
            onClick={() => setEditor({ form: { ...VAZIO } })}
            className="shrink-0"
          >
            Nova filial
          </Button>
        </div>

        {/*
          O ESTADO ATUAL DITO EM VOZ ALTA.
          "Cadastrei a segunda loja e nada mudou" e "cadastrei e sumiu tudo" são as
          duas leituras erradas possíveis. Dizer aqui qual é o comportamento agora
          evita as duas.
        */}
        <div className={`mb-5 flex items-start gap-3 rounded-card border p-4 ${separando ? 'border-accent/30 bg-accent-soft' : 'border-line bg-card'}`}>
          <div className={`flex size-9 flex-none items-center justify-center rounded-full ${separando ? 'bg-accent/10 text-accent' : 'bg-ink/5 text-ink-3'}`}>
            <Store size={16} strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-2">
            {separando ? (
              <>
                <div className="mb-0.5 text-[13.5px] font-semibold text-ink">
                  Separação ativa — {ativas.length} lojas
                </div>
                Cada pessoa vê a operação da loja dela. Você e os administradores
                escolhem no topo entre uma loja específica e <strong>Rede (todas)</strong>,
                que mostra o consolidado. Defina quem trabalha em qual loja em{' '}
                <Link href="/admin/equipe" className="font-medium text-accent hover:underline">Equipe</Link>.
              </>
            ) : (
              <>
                <div className="mb-0.5 text-[13.5px] font-semibold text-ink">
                  Uma loja só — nada está separado
                </div>
                Com uma única loja o CRM funciona exatamente como hoje: todos veem
                tudo, e o seletor de loja não aparece no topo. Ao cadastrar a segunda,
                a separação começa a valer e o histórico atual continua na loja
                principal.
              </>
            )}
          </div>
        </div>

        {(pessoasSemLoja > 0 && separando) && (
          <div className="mb-4 flex items-center gap-3 rounded-card border border-warn/30 bg-warn-soft p-4">
            <div className="flex size-9 flex-none items-center justify-center rounded-full bg-warn/10 text-warn">
              <UserRoundX size={16} strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-2">
              <div className="text-[13.5px] font-semibold text-ink">
                {pessoasSemLoja} {pessoasSemLoja === 1 ? 'pessoa' : 'pessoas'} sem loja definida
              </div>
              Quem não tem loja atribuída trabalha na loja principal. Enquanto isso não
              for definido, essas pessoas veem a operação da principal, não a da loja
              onde realmente estão.
            </div>
            <Link href="/admin/equipe" className="shrink-0">
              <Button variant="outline" size="sm">Definir na Equipe</Button>
            </Link>
          </div>
        )}

        {leadsSemLoja > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-card border border-bad/30 bg-bad-soft p-4">
            <div className="flex size-9 flex-none items-center justify-center rounded-full bg-bad/10 text-bad">
              <TriangleAlert size={16} strokeWidth={1.8} />
            </div>
            {/*
              Registro sem loja é anomalia, não estado normal: o gatilho de gravação
              sempre define uma. Aparece só para dono e admin, justamente para poder
              ser corrigido em vez de virar lead invisível.
            */}
            <div className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-2">
              <div className="text-[13.5px] font-semibold text-ink">{leadsSemLoja} lead(s) sem loja</div>
              Só você e os administradores enxergam esses leads. Abra cada um e defina a
              loja — ou avise, porque isto não deveria acontecer.
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          {filiais.map((f) => {
            const r = resumo[f.id] ?? { pessoas: 0, leads: 0 }
            return (
              <div
                key={f.id}
                className={`flex flex-wrap items-center gap-3 rounded-card border border-line bg-card p-4 ${f.ativo ? '' : 'opacity-60'}`}
              >
                <div className="flex size-9 flex-none items-center justify-center rounded-full bg-ink/5 text-ink-2">
                  <Store size={16} strokeWidth={1.8} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{rotuloDaFilial(f)}</span>
                    {f.matriz && <Badge tone="acc">Principal</Badge>}
                    {!f.ativo && <Badge tone="neutro">Inativa</Badge>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
                    <span className="num">{f.cnpj ? `CNPJ ${f.cnpj}` : 'sem CNPJ'}</span>
                    {/*
                      A CONTA INCLUI QUEM ESTA SEM LOJA, na principal.
                      A primeira versao mostrava "0 pessoas" na loja principal da JM,
                      onde as 8 pessoas da equipe trabalham — elas estao sem loja
                      definida, e quem esta sem loja cai na principal. A tela dizia o
                      contrario do que o banco faz.
                    */}
                    <span className="inline-flex items-center gap-1">
                      <Users size={12} strokeWidth={1.8} />
                      {r.pessoas + (f.matriz ? pessoasSemLoja : 0)}
                      {f.matriz && pessoasSemLoja > 0 && (
                        <span className="text-ink-3">({pessoasSemLoja} sem loja definida)</span>
                      )}
                    </span>
                    <span className="num">{r.leads} lead(s) ativo(s)</span>
                    {(f.cidade || f.estado) && <span>{[f.cidade, f.estado].filter(Boolean).join(' / ')}</span>}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline" size="sm" icon={<Pencil size={13} strokeWidth={1.8} />}
                    onClick={() => setEditor({
                      id: f.id,
                      form: Object.fromEntries(CAMPOS_FILIAL.map((c) => [c, f[c] ?? ''])) as unknown as FilialForm,
                    })}
                  >
                    Editar
                  </Button>
                  {!f.matriz && f.ativo && (
                    <Button
                      variant="ghost" size="sm" icon={<Crown size={13} strokeWidth={1.8} />}
                      loading={ocupado === `matriz-${f.id}`}
                      onClick={() => agir('definir_matriz', { id: f.id }, `matriz-${f.id}`)}
                    >
                      Tornar principal
                    </Button>
                  )}
                  {!f.matriz && (
                    <Button
                      variant="ghost" size="sm" icon={<Power size={13} strokeWidth={1.8} />}
                      loading={ocupado === `ativo-${f.id}`}
                      className={f.ativo ? 'text-bad hover:bg-bad/10' : ''}
                      onClick={() => agir(f.ativo ? 'desativar' : 'reativar', { id: f.id }, `ativo-${f.id}`)}
                    >
                      {f.ativo ? 'Desativar' : 'Reativar'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/*
          Não existe "excluir loja" de propósito: apagar levaria `filial_id` a nulo
          nos registros dela (ON DELETE SET NULL), e o histórico de vendas viraria
          "sem loja". Desativar preserva o passado e tira a loja do seletor.
        */}
        <p className="mt-4 text-[11.5px] leading-snug text-ink-3">
          A loja principal recebe o que chega sem loja definida — lead de integração,
          importação e rotinas automáticas. Por isso ela não pode ser desativada: para
          trocar, torne outra principal primeiro. Lojas desativadas somem do seletor,
          mas o histórico delas continua no sistema.
        </p>
      </div>

      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          title={editor.id == null ? 'Nova filial' : 'Editar filial'}
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditor(null)}>Cancelar</Button>
              <Button loading={ocupado === 'salvar'} onClick={salvar}>Salvar</Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-[12px] leading-snug text-ink-3">
              O que ficar em branco cai para o cadastro da empresa — então a loja já
              emite documento antes de você terminar de preencher a ficha dela.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Nome da loja" value={editor.form.nome ?? ''} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Loja Centro" />
              <Input label="CNPJ" value={editor.form.cnpj ?? ''} onChange={(e) => set('cnpj', e.target.value)} hint="Sai no contrato desta loja." />
              <Input label="Telefone" value={editor.form.telefone ?? ''} onChange={(e) => set('telefone', e.target.value)} />
              <Input label="E-mail" value={editor.form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <Input wrapperClassName="sm:col-span-1" label="CEP" value={editor.form.cep ?? ''} onChange={(e) => set('cep', e.target.value)} />
              <Input wrapperClassName="sm:col-span-2" label="Endereço" value={editor.form.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} />
              <Input wrapperClassName="sm:col-span-1" label="Número" value={editor.form.numero ?? ''} onChange={(e) => set('numero', e.target.value)} />
              <Input wrapperClassName="sm:col-span-2" label="Complemento" value={editor.form.complemento ?? ''} onChange={(e) => set('complemento', e.target.value)} />
              <Input wrapperClassName="sm:col-span-2" label="Bairro" value={editor.form.bairro ?? ''} onChange={(e) => set('bairro', e.target.value)} />
              <Input wrapperClassName="sm:col-span-3" label="Cidade" value={editor.form.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} />
              <Select
                wrapperClassName="sm:col-span-1"
                label="UF"
                value={editor.form.estado ?? ''}
                onChange={(e) => set('estado', e.target.value)}
              >
                <option value="">—</option>
                {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Quem assina pela loja" value={editor.form.representante_nome ?? ''} onChange={(e) => set('representante_nome', e.target.value)} />
              <Input label="CPF de quem assina" value={editor.form.representante_cpf ?? ''} onChange={(e) => set('representante_cpf', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
