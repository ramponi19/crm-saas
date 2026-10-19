/**
 * Slug de empresa nas rotas públicas (/api/portais/<slug>, /api/veiculos/<slug>)
 * e no cadastro. Formato: minúsculas, dígitos e hífen, 3 a 40 caracteres, sem
 * hífen nas pontas, e fora da lista de nomes que já são rotas ou que poderiam
 * passar por página oficial.
 */
const FORMATO = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/

export const SLUGS_RESERVADOS = new Set([
  'admin', 'api', 'app', 'auth', 'agendar', 'cadastro', 'chat', 'dashboard', 'design', 'entrar', 'i', 'imob',
  'imovel', 'landing', 'leads', 'login', 'logout', 'menu', 'monitoring', 'nexus', 'offline', 'orcamento', 'os',
  'para', 'planos', 'privacy', 'privacidade', 'proposta', 'register', 'reset-senha', 'suporte', 'superadmin',
  'termos', 'track', 'www', 'zapintel',
])

export function slugValido(slug: string | null | undefined): slug is string {
  return !!slug && FORMATO.test(slug) && !slug.includes('--') && !SLUGS_RESERVADOS.has(slug)
}
