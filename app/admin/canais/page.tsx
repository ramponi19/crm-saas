import { redirect } from 'next/navigation'

/**
 * "Canais" e "Integrações" eram dois menus para a mesma tarefa — conectar o
 * WhatsApp/Instagram —, e o conector agora mora em Integrações.
 *
 * A rota fica de pé como redirecionamento em vez de ser apagada: ela está em
 * links salvos, no histórico do navegador de quem usa e no catálogo de módulos.
 * Apagar daria 404 para quem já sabia o caminho.
 *
 * ⚠ A QUERY STRING TEM DE PASSAR, e isto não é detalhe.
 *
 * Este é o ponto de retorno do login da Meta: o `redirect_uri` registrado no app
 * é `/canais`, o middleware manda para `/admin/canais` preservando a query, e a
 * Meta volta com `?code=...` — o código que a tela troca por token. A versão
 * anterior redirecionava para uma URL fixa e **jogava o código fora**: a Meta
 * dizia "conta conectada" (ela de fato compartilha o ativo do lado dela), o CRM
 * nunca recebia nada, e a tela seguia mostrando "Conectar". Aconteceu com a JM em
 * 27/08/2026 ao conectar o Instagram, e quebrava TODA conexão de Instagram e
 * Messenger — o WhatsApp escapava porque vai pelo SDK, com callback, sem
 * redirecionamento.
 *
 * Mudar o `redirect_uri` para `/admin/integracoes` resolveria também, mas exigiria
 * cadastrar o endereço novo nas "Valid OAuth Redirect URIs" do app da Meta. Passar
 * a query adiante não depende de mexer em nada lá.
 */
export default async function CanaisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const query = new URLSearchParams()
  for (const [chave, valor] of Object.entries(sp)) {
    if (Array.isArray(valor)) valor.forEach((v) => query.append(chave, v))
    else if (valor != null) query.set(chave, valor)
  }
  const q = query.toString()
  redirect(q ? `/admin/integracoes?${q}` : '/admin/integracoes')
}
