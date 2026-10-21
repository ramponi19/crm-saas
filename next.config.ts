import type { NextConfig } from 'next'
// De `@sentry/nextjs/config`, não da raiz: o caminho antigo está depreciado e
// para de funcionar na v11 do SDK. Avisava a cada build e a cada boot do
// servidor — ruído que ensina a ignorar aviso de build.
import { withSentryConfig } from '@sentry/nextjs/config'
import { DESTINO_DA_ABA } from './lib/configuracoes-menu'

/**
 * REGIÃO DO SERVIDOR: `regions: ["gru1"]` em `vercel.json` (São Paulo).
 *
 * O comentário mora aqui porque `vercel.json` rejeita qualquer chave que não
 * esteja no schema — nem `//` passa — e essa decisão não pode se perder.
 *
 * O banco (Supabase) está em sa-east-1 e a Vercel roda o servidor em iad1
 * (Virgínia) por padrão. Medido nos logs do banco, mesmo código e mesma
 * biblioteca: 219 ms de média por consulta vindo de Ashburn contra 47 ms vindo de
 * São Paulo — 4,6x, pagos várias vezes por tela, porque uma página faz várias
 * consultas em sequência. Não era o código: era a distância. Se alguém mudar a
 * região do projeto, mude também a do banco — as duas andam juntas.
 */
const nextConfig: NextConfig = {
  // Type-check e ESLint reativados — build falha se houver erro de tipo

  /**
   * Telas do ZapIntel que saíram ou se juntaram (15/10/2026). O redirecionamento
   * roda antes do proxy.ts: endereço salvo não vira 404 e não custa CPU de
   * função. Temporário (307) para o navegador não gravar para sempre.
   */
  async redirects() {
    return [
      { source: '/zapintel/performance', destination: '/zapintel/atendimento', permanent: false },
      { source: '/zapintel/performance2', destination: '/zapintel/atendimento', permanent: false },
      // Comparar, Linguagem e Relatório saíram em 15/10/2026: a comparação com o
      // período anterior e o resumo por IA moram no Insights.
      { source: '/zapintel/comparar', destination: '/zapintel/insights', permanent: false },
      { source: '/zapintel/linguagem', destination: '/zapintel/insights', permanent: false },
      { source: '/zapintel/relatorio', destination: '/zapintel/insights', permanent: false },
      /**
       * ETAPA 0 (21/10/2026) — ferramentas que saíram do menu e foram morar dentro
       * da tela onde se usam. 308 (permanente): o endereço novo é definitivo.
       * REMOVER EM 21/11/2026 — está na lista de morte do 05-RUNBOOK-CORTE.md.
       */
      { source: '/simular-parcela', destination: '/orcamentos/parcela', permanent: true },
      { source: '/check-imei', destination: '/estoque/imei', permanent: true },
      { source: '/consulta-fipe', destination: '/avaliacoes/fipe', permanent: true },
      /**
       * ETAPA 0, 2.3 — telas duplicadas ficam num lugar só (mesmo prazo: 21/11/2026).
       * Relatórios e Financeiro: a definitiva é a do CRM (a do /admin importava a
       * mesma página, e o Financeiro de lá saía sem categorias). Integrações: a
       * definitiva é /admin/integracoes (a aba de Configurações era um cartão de
       * status apontando para ela).
       */
      { source: '/admin/relatorios', destination: '/relatorios', permanent: true },
      { source: '/admin/financeiro', destination: '/financeiro', permanent: true },
      /**
       * NAVEGAÇÃO NOVA (21/10/2026) — o /admin inteiro saiu. Mesmo prazo: REMOVER EM
       * 21/11/2026 (lista de morte do 05). Configuração foi para /configuracoes;
       * leitura para Insights; automação para Automações. A query passa adiante
       * (`?code=` do retorno da Meta em /admin/canais, `?tab=uso` da equipe,
       * `?session_id=` do Stripe em /admin/planos/sucesso).
       */
      // As abas antigas de /admin/configuracoes, cada uma para a seção que virou.
      ...Object.entries(DESTINO_DA_ABA).map(([aba, destination]) => ({
        source: '/admin/configuracoes',
        has: [{ type: 'query' as const, key: 'aba', value: aba }],
        destination,
        permanent: true,
      })),
      { source: '/admin/configuracoes', destination: '/configuracoes/pagamentos', permanent: true },
      { source: '/admin', destination: '/visao-geral', permanent: true },
      { source: '/admin/conversao', destination: '/conversao', permanent: true },
      { source: '/admin/metas', destination: '/metas', permanent: true },
      { source: '/admin/cadencias', destination: '/cadencias', permanent: true },
      { source: '/admin/distribuicao', destination: '/distribuicao', permanent: true },
      { source: '/admin/scoring', destination: '/scoring', permanent: true },
      { source: '/admin/modelos', destination: '/modelos', permanent: true },
      { source: '/admin/equipe', destination: '/configuracoes/usuarios', permanent: true },
      { source: '/admin/funil', destination: '/configuracoes/funil', permanent: true },
      { source: '/admin/contrato/:id', destination: '/configuracoes/documentos/:id', permanent: true },
      { source: '/admin/contrato', destination: '/configuracoes/documentos', permanent: true },
      { source: '/admin/integracoes', destination: '/configuracoes/integracoes', permanent: true },
      { source: '/admin/canais', destination: '/configuracoes/integracoes', permanent: true },
      { source: '/admin/permissoes', destination: '/configuracoes/permissoes', permanent: true },
      { source: '/admin/meu-menu', destination: '/configuracoes/menu', permanent: true },
      { source: '/admin/aparencia', destination: '/configuracoes/aparencia', permanent: true },
      { source: '/admin/empresa', destination: '/configuracoes/empresa', permanent: true },
      { source: '/admin/filiais', destination: '/configuracoes/lojas', permanent: true },
      { source: '/admin/planos/sucesso', destination: '/configuracoes/faturamento/sucesso', permanent: true },
      { source: '/admin/planos', destination: '/configuracoes/faturamento', permanent: true },
      // Qualquer outro endereço do /admin que alguém tenha guardado.
      { source: '/admin/:resto*', destination: '/configuracoes', permanent: true },
    ]
  },
}

/**
 * SENTRY. Envolve a config para subir os source maps: sem eles, o erro chega como
 * uma linha de código minificado e não serve para nada.
 *
 * `silent` no build local para não encher o terminal; o upload só acontece quando
 * SENTRY_AUTH_TOKEN existe (produção), então `npm run build` aqui segue igual.
 */
export default withSentryConfig(nextConfig, {
  org: 'ramponi19',
  project: 'nexus-crm',
  silent: !process.env.CI,
  // O túnel evita que bloqueador de anúncio engula o relatório de erro — o
  // navio afunda calado justamente em quem usa extensão de bloqueio.
  tunnelRoute: '/monitoring',
  widenClientFileUpload: true,
})
