import type { SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { carregarConfigEmpresa, ligadosDaEmpresa } from '@/lib/empresa-config'
import { contextoDaSessao, temPermissao } from '@/lib/sessao'
import { CargosView, type CargoTela, type PermissaoCatalogo, type PessoaTela } from '@/components/modules/configuracoes/cargos-view'

export const metadata = { title: 'Cargos' }

/**
 * CONFIGURAÇÕES › CARGOS (etapa 1.1b, 25/11/2026). Substitui a tela de Permissões: a empresa monta os cargos
 * marcando permissões, e cada pessoa tem um cargo. Quem edita é quem tem equipe.cargos (Dono e Administrador, de
 * fábrica — o Administrador já editava as permissões na tela antiga), com as travas do banco para quem não é Dono.
 * Toda gravação é uma RPC do banco, que confere a permissão e audita.
 */
export default async function Page() {
  const ctx = await contextoDaSessao()
  if (!ctx?.empresa_id) redirect('/dashboard')
  const empresaId = ctx.empresa_id
  const supabase = await createClient()
  const db = supabase as unknown as SupabaseClient

  const [{ data: catalogo }, { data: cargos }, { data: pessoas }, cfg] = await Promise.all([
    db.from('permissoes_catalogo').select('chave, rotulo, grupo, modulo, ordem').order('ordem'),
    db.from('empresa_cargos').select('id, nome, descricao, sistema, papel_base, somente_leitura, permissoes:empresa_cargo_permissoes(permissao)')
      .eq('empresa_id', empresaId).order('sistema', { ascending: false }).order('nome'),
    db.from('empresa_usuarios').select('usuario_id, cargo_id, ativo, conta_servico, usuarios!empresa_usuarios_usuario_public_fkey(nome, email)')
      .eq('empresa_id', empresaId).order('ativo', { ascending: false }),
    carregarConfigEmpresa(supabase, empresaId),
  ])

  // Permissão de módulo só aparece com o módulo ligado (o Estoque, para custo e preço).
  const ligados = ligadosDaEmpresa(cfg)
  const modulosLigados = new Set([...ligados].map((h) => h.replace(/^\//, '')))
  const perms = ((catalogo ?? []) as PermissaoCatalogo[]).filter((p) => !p.modulo || modulosLigados.has(p.modulo))

  type CargoRow = Omit<CargoTela, 'permissoes'> & { permissoes: { permissao: string }[] }
  const listaCargos: CargoTela[] = ((cargos ?? []) as CargoRow[]).map((c) => ({ ...c, permissoes: c.permissoes.map((p) => p.permissao) }))
  type PessoaRow = { usuario_id: string; cargo_id: number | null; ativo: boolean; conta_servico: boolean; usuarios: { nome: string | null; email: string | null } | { nome: string | null; email: string | null }[] | null }
  const listaPessoas: PessoaTela[] = ((pessoas ?? []) as unknown as PessoaRow[]).map((p) => {
    const u = Array.isArray(p.usuarios) ? p.usuarios[0] : p.usuarios
    return { id: p.usuario_id, nome: u?.nome ?? u?.email ?? 'Sem nome', cargoId: p.cargo_id, ativo: p.ativo, contaServico: p.conta_servico }
  })

  return (
    <>
      <Topbar title="Cargos" />
      <CargosView
        cargos={listaCargos}
        catalogo={perms}
        pessoas={listaPessoas}
        podeEditar={temPermissao(ctx, 'equipe.cargos')}
        euId={ctx.usuario_id}
        souDono={ctx.plataforma || !!ctx.cargo?.sistema}
        minhas={ctx.permissoes}
      />
    </>
  )
}
