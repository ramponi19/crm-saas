import { redirect } from 'next/navigation'

/**
 * A tela de Permissões por papel foi substituída por Configurações › Cargos (etapa 1.1b, 25/11/2026). O link
 * antigo leva para lá. A rota /api/permissoes saiu na 1.1h parte 2 (26/11/2026), junto com `empresas.permissoes`.
 */
export default function PermissoesPage() {
  redirect('/configuracoes/cargos')
}
