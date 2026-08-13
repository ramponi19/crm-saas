import { redirect } from 'next/navigation'

/**
 * "Canais" e "Integrações" eram dois menus para a mesma tarefa — conectar o
 * WhatsApp/Instagram —, e o conector agora mora em Integrações.
 *
 * A rota fica de pé como redirecionamento em vez de ser apagada: ela está em
 * links salvos, no histórico do navegador de quem usa e no catálogo de módulos.
 * Apagar daria 404 para quem já sabia o caminho.
 */
export default function CanaisPage() {
  redirect('/admin/integracoes')
}
