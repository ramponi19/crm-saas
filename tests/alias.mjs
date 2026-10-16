/**
 * Testes sem dependência nova: o Node 26 já executa TypeScript (remove os
 * tipos), e o executor de testes é o `node:test`. Falta só o que o Next resolve
 * sozinho e o Node não: o atalho `@/` do tsconfig e import sem extensão.
 *
 *   npm test                      → testes de unidade (sem banco, sem rede)
 *   BANCO=1 npm test              → inclui os de integração (ver banco.test.ts)
 */
import { registerHooks } from 'node:module'
import { resolver, carregador } from './resolver.mjs'

registerHooks({ resolve: resolver, load: carregador })
