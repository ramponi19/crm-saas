import { redirect } from 'next/navigation'

/**
 * A tela de Permissões por papel foi substituída por Configurações › Cargos (etapa 1.1b, 25/11/2026). O link
 * antigo leva para lá. A rota /api/permissoes continua respondendo (a ponte do banco leva o que ela gravar para
 * os cargos) até a contração da 1.1h.
 */
export default function PermissoesPage() {
  redirect('/configuracoes/cargos')
}
