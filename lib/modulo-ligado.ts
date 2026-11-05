import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { moduloPorChave } from '@/core/modulos'
import { carregarConfigEmpresa, ligadosDaEmpresa } from '@/lib/empresa-config'
import { estaLigado } from '@/lib/modulos-central'

/**
 * "O MÓDULO ESTÁ LIGADO?" NA API (05/11/2026, regra "Como nasce um módulo", ponto 2).
 *
 * A trava do proxy cobre só as TELAS de módulo (moduloDaRota olha a primeira
 * parte do caminho contra o menu); rota de API nunca cai nela. Esconder o menu
 * não protege nada: a API do módulo confere aqui, com a mesma conta do menu e da
 * Central (lib/empresa-config.ts → ligadosDaEmpresa; o contratado à parte pela
 * linha ativa).
 *
 *   const trava = await exigirModuloLigado(ctx.empresaId, 'estoque')
 *   if (trava) return trava
 *
 * Desligado = 403 com `code: 'modulo_desligado'` e o nome do módulo. Chave fora do
 * manifesto = 500 (erro de quem chamou, não da empresa). Quem passa a usar sai da
 * lista de exceções do scripts/check-modulos.mjs.
 */
export async function exigirModuloLigado(empresaId: number, chave: string): Promise<NextResponse | null> {
  const modulo = moduloPorChave(chave)
  if (!modulo) return NextResponse.json({ error: `Módulo desconhecido: ${chave}` }, { status: 500 })
  const cfg = await carregarConfigEmpresa(createServiceClient(), empresaId)
  const ligado = estaLigado(modulo, {
    ligados: ligadosDaEmpresa(cfg),
    ativos: new Set(cfg.modulos.filter((r) => r.ativo).map((r) => r.modulo)),
  })
  if (ligado) return null
  return NextResponse.json(
    { error: `${modulo.nome} não está instalado nesta empresa. O dono instala pela Central de módulos.`, code: 'modulo_desligado', modulo: chave },
    { status: 403 },
  )
}
