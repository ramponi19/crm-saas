import type { NextConfig } from 'next'

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
}

export default nextConfig
