import { createServiceClient } from '@/lib/supabase/service'
import { garantirPortalToken } from '@/lib/portal-token'
import { MODULOS, type ModuloManifesto } from '@/core/modulos'
import { garantirCampos } from '@/lib/campos-padrao'
import type { ModuloRow } from '@/lib/empresa-config'

type Svc = ReturnType<typeof createServiceClient>

/**
 * O QUE ACONTECE QUANDO UM MÓDULO É INSTALADO (23/10/2026).
 *
 * Um lugar só, chamado pelos dois caminhos que instalam: a Central de Módulos
 * (`/api/modulos/instalar`) e o superadmin atendendo um pedido
 * (`/api/superadmin/modulos/pedidos/[id]`): os campos personalizados do módulo
 * (manifesto, `campos`) e, no Imóveis, o token de portal e do site, cifrado em
 * `empresa_segredos`.
 *
 * Falha aqui NÃO desfaz a instalação: o módulo fica instalado e o erro volta para quem
 * chamou mostrar ("instalado, mas o token não foi gerado").
 */
export async function aoInstalarModulo(svc: Svc, empresaId: number, chave: string): Promise<{ error: string | null }> {
  const campos = MODULOS.find((m) => m.chave === chave)?.campos ?? []
  const { error: errCampos } = await garantirCampos(svc, empresaId, campos, chave)
  if (errCampos) return { error: `campos do módulo: ${errCampos}` }
  if (chave === 'imoveis') {
    const { error } = await garantirPortalToken(svc, empresaId)
    return { error }
  }
  return { error: null }
}

/**
 * Grava a linha do módulo em `empresa_modulos` (`ativo` liga ou desliga) — a mesma
 * escrita nos dois caminhos que instalam (04/11/2026: com as dependências, um
 * clique pode gravar mais de um módulo). `linhas` = o que a empresa já tem, para
 * saber se atualiza ou insere. Instalar atende o pedido pendente do mesmo módulo.
 */
export async function gravarModulo(
  svc: Svc,
  p: { empresaId: number; modulo: ModuloManifesto; ativo: boolean; userId: string; linhas: ModuloRow[]; origem?: string },
): Promise<{ error: string | null }> {
  const agora = new Date().toISOString()
  const atual = p.linhas.find((r) => r.modulo === p.modulo.chave)
  const { error } = atual
    ? await svc.from('empresa_modulos').update({
        ativo: p.ativo, updated_at: agora,
        ...(p.ativo ? { instalado_em: agora, instalado_por: p.userId } : {}),
      }).eq('empresa_id', p.empresaId).eq('modulo', p.modulo.chave)
    : await svc.from('empresa_modulos').insert({
        empresa_id: p.empresaId, modulo: p.modulo.chave, origem: p.origem ?? (p.modulo.addon ? 'addon' : 'plano'), ativo: p.ativo,
        instalado_em: agora, instalado_por: p.userId,
      })
  if (error) return { error: error.message }
  if (p.ativo) {
    await svc.from('modulo_pedidos').update({ status: 'atendido', atendido_em: agora, atendido_por: p.userId })
      .eq('empresa_id', p.empresaId).eq('modulo', p.modulo.href).eq('status', 'pendente')
  }
  return { error: null }
}
