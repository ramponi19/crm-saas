import type { NextConfig } from 'next'
// De `@sentry/nextjs/config`, não da raiz: o caminho antigo está depreciado e
// para de funcionar na v11 do SDK. Avisava a cada build e a cada boot do
// servidor — ruído que ensina a ignorar aviso de build.
import { withSentryConfig } from '@sentry/nextjs/config'

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
       * OS 308 DA ETAPA 0 E DO /ADMIN SAÍRAM TODOS (22/10/2026, decisão do Lucas).
       *
       * Iam até 21/11 e caíram antes do prazo: /admin/* (navegação nova), os duplicados
       * da 2.3 (/admin/relatorios, /admin/financeiro, ?aba=integracoes) e as ferramentas
       * da 2.4 (/simular-parcela → /orcamentos/parcela, /check-imei → /estoque/imei,
       * /consulta-fipe → /avaliacoes/fipe). Os endereços antigos dão 404. Nenhum link do
       * sistema aponta para eles: `/simular-parcela` e afins seguem só como IDENTIDADE
       * do módulo (o que a Central e o plano ligam), e a navegação vai para a rota da
       * ferramenta (`ferramenta.rota` no catálogo do menu). O /canais (retorno da Meta)
       * não é /admin: segue no proxy.ts.
       */
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
