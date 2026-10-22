import { notFound } from 'next/navigation'
import { VITRINES } from '@/lib/modulos-vitrine'
import { moduloPorHref } from '@/core/modulos'
import { Topbar } from '@/components/layout/topbar'
import { Vitrine } from './vitrine'

/**
 * Monta a vitrine de um módulo. Usada em dois caminhos, com a mesma tela:
 *   - módulo desligado: o proxy reescreve /agenda → /vitrine/agenda (o endereço
 *     na barra continua /agenda);
 *   - a página não serve para esta empresa (Agenda, Executivo): a própria página
 *     mostra a vitrine em vez de mandar para o dashboard.
 *
 * Desde a Central de Módulos (22/10/2026) a vitrine só explica e aponta para o
 * tile; quem decide instalar, pedir ou "em preparação" é a Central.
 */
export async function VitrineDoModulo({ href }: { href: string }) {
  const modulo = VITRINES[href]
  if (!modulo) notFound()
  return (
    <>
      <Topbar title={modulo.nome} />
      <Vitrine modulo={modulo} chave={moduloPorHref(href)?.chave ?? null} />
    </>
  )
}
