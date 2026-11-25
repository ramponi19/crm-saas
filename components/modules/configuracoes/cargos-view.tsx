'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Lock, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Input, Modal, notify } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

export interface PermissaoCatalogo { chave: string; rotulo: string; grupo: string; modulo: string | null; ordem: number }
export interface CargoTela {
  id: number; nome: string; descricao: string | null; sistema: boolean; papel_base: string; somente_leitura: boolean; permissoes: string[]
}
export interface PessoaTela { id: string; nome: string; cargoId: number | null; ativo: boolean; contaServico: boolean }

interface Rascunho { id: number | null; nome: string; descricao: string; somente_leitura: boolean; permissoes: Set<string> }

/** Mensagem curta para o código de erro que a RPC devolve ("CARGO_EM_USO: ..."). */
function mensagem(erro: string): string {
  const [codigo, resto] = erro.split(':')
  const textos: Record<string, string> = {
    SEM_PERMISSAO: 'Só quem pode editar cargos (o Dono) faz isso.',
    SOMENTE_LEITURA: 'Conta de consulta: não grava.',
    CARGO_SISTEMA: 'O cargo Dono não pode ser editado nem apagado.',
    CARGO_EM_USO: 'Troque o cargo das pessoas antes de apagar este.',
    EMPRESA_SEM_DONO: 'A empresa precisa de pelo menos um Dono ativo.',
    PERMISSAO_INVALIDA: 'Permissão desconhecida.',
  }
  return textos[codigo.trim()] ?? (resto ? resto.trim() : erro)
}

/**
 * CARGOS (etapa 1.1b). Lista de cargos com quantas pessoas há em cada um; editor com as permissões agrupadas
 * (só as dos módulos ligados); duplicar; e as pessoas com o cargo de cada uma. O Dono é travado. Sem a permissão
 * equipe.cargos, a tela só mostra (o banco recusa de qualquer jeito).
 */
export function CargosView({ cargos, catalogo, pessoas, podeEditar, euId }: {
  cargos: CargoTela[]; catalogo: PermissaoCatalogo[]; pessoas: PessoaTela[]; podeEditar: boolean; euId: string
}) {
  const router = useRouter()
  const [editando, setEditando] = useState<Rascunho | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const grupos = useMemo(() => {
    const m = new Map<string, PermissaoCatalogo[]>()
    for (const p of catalogo) m.set(p.grupo, [...(m.get(p.grupo) ?? []), p])
    return [...m.entries()]
  }, [catalogo])
  const pessoasPorCargo = (id: number) => pessoas.filter((p) => p.ativo && p.cargoId === id).length
  const db = () => createClient()

  async function rpc(nome: string, args: Record<string, unknown>, chave: string): Promise<boolean> {
    setOcupado(chave)
    const { error } = await db().rpc(nome as never, args as never)
    setOcupado(null)
    if (error) { notify.bad('Não foi possível salvar', mensagem(error.message)); return false }
    router.refresh()
    return true
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
      <div className="mx-auto max-w-[960px] space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-[640px] text-[13px] text-ink-2">
            Cada pessoa tem um cargo, e o cargo diz o que ela pode fazer. O <b className="text-ink">Dono</b> tem acesso total e a empresa
            sempre tem pelo menos um. O cargo <b className="text-ink">Consulta</b> só lê, sem custo. Toda mudança fica na Auditoria.
          </p>
          {podeEditar && (
            <Button size="sm" icon={<Plus size={14} strokeWidth={1.8} />}
              onClick={() => setEditando({ id: null, nome: '', descricao: '', somente_leitura: false, permissoes: new Set() })}>
              Novo cargo
            </Button>
          )}
        </div>
        {!podeEditar && <p className="text-[12.5px] text-ink-3">Você vê os cargos; só o Dono (ou quem tem “Criar e editar cargos”) altera.</p>}

        <Card flush title="Cargos">
          <ul className="divide-y divide-line">
            {cargos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
                <div className="min-w-[200px] flex-1">
                  <div className="flex items-center gap-2 font-semibold text-ink">
                    {c.nome}
                    {c.sistema && <Badge tone="acc"><Lock size={10} className="mr-1 inline" />acesso total</Badge>}
                    {c.somente_leitura && <Badge tone="neutro">só leitura</Badge>}
                  </div>
                  {c.descricao && <div className="text-[12px] text-ink-3">{c.descricao}</div>}
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    {pessoasPorCargo(c.id)} pessoa(s) · {c.sistema ? 'todas as permissões' : `${c.permissoes.length} permissão(ões)`}
                  </div>
                </div>
                {podeEditar && !c.sistema && (
                  <Button size="sm" variant="outline" onClick={() => setEditando({ id: c.id, nome: c.nome, descricao: c.descricao ?? '', somente_leitura: c.somente_leitura, permissoes: new Set(c.permissoes) })}>
                    Editar
                  </Button>
                )}
                {podeEditar && (
                  <Button size="sm" variant="ghost" icon={<Copy size={14} strokeWidth={1.8} />} aria-label={`Duplicar ${c.nome}`}
                    onClick={() => setEditando({ id: null, nome: `${c.nome} (cópia)`, descricao: c.descricao ?? '', somente_leitura: c.somente_leitura,
                      permissoes: new Set(c.sistema ? catalogo.map((p) => p.chave) : c.permissoes) })}>
                    Duplicar
                  </Button>
                )}
                {podeEditar && !c.sistema && (
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} strokeWidth={1.8} />} aria-label={`Apagar ${c.nome}`}
                    loading={ocupado === `apagar-${c.id}`}
                    onClick={() => rpc('cargo_apagar', { p_id: c.id }, `apagar-${c.id}`)} />
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card flush title="Pessoas">
          <ul className="divide-y divide-line">
            {pessoas.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className={p.ativo ? 'flex-1 text-ink' : 'flex-1 text-ink-3 line-through'}>
                  {p.nome}{p.id === euId ? ' (você)' : ''}{p.contaServico ? ' · conta de serviço' : ''}
                </span>
                {podeEditar && p.ativo ? (
                  <select aria-label={`Cargo de ${p.nome}`} value={p.cargoId ?? ''} disabled={ocupado === `pessoa-${p.id}`}
                    onChange={(e) => rpc('usuario_cargo_trocar', { p_usuario: p.id, p_cargo: Number(e.target.value) }, `pessoa-${p.id}`)}
                    className="h-8 rounded-control border border-line bg-card px-2 text-[13px] text-ink">
                    {cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                ) : (
                  <Badge tone="neutro">{cargos.find((c) => c.id === p.cargoId)?.nome ?? 'sem cargo'}</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {editando && (
        <Modal open onClose={() => setEditando(null)} title={editando.id ? 'Editar cargo' : 'Novo cargo'}>
          <div className="space-y-4">
            <Input label="Nome" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
            <Input label="Descrição (opcional)" value={editando.descricao} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} />
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={editando.somente_leitura}
                onChange={(e) => setEditando({ ...editando, somente_leitura: e.target.checked })} />
              Só leitura (não grava nada, em nenhuma tela)
            </label>
            {grupos.map(([grupo, lista]) => (
              <fieldset key={grupo} className="space-y-1.5">
                <legend className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">{grupo}</legend>
                {lista.map((p) => (
                  <label key={p.chave} className="flex items-center gap-2 text-[13px] text-ink">
                    <input type="checkbox" checked={editando.permissoes.has(p.chave)}
                      onChange={(e) => {
                        const s = new Set(editando.permissoes)
                        if (e.target.checked) s.add(p.chave); else s.delete(p.chave)
                        setEditando({ ...editando, permissoes: s })
                      }} />
                    {p.rotulo}
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button loading={ocupado === 'salvar'} disabled={editando.nome.trim().length < 2}
                onClick={async () => {
                  const ok = await rpc('cargo_salvar', {
                    p_id: editando.id, p_nome: editando.nome.trim(), p_descricao: editando.descricao.trim() || null,
                    p_permissoes: [...editando.permissoes], p_somente_leitura: editando.somente_leitura,
                  }, 'salvar')
                  if (ok) { notify.ok('Cargo salvo'); setEditando(null) }
                }}>Salvar</Button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  )
}
