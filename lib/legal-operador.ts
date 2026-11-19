/**
 * QUEM OPERA O NEXUS — os dados que os Termos de uso, a Política de privacidade e o DPA citam (19/11/2026,
 * "Versão piloto 0.9", dados do Lucas). Um lugar só: mudou o endereço ou o e-mail, muda aqui e os três
 * documentos acompanham.
 *
 * Atenção ao mexer na razão social e no CNPJ: a Política de privacidade é a URL que a Meta pede no app e a
 * que o analista da App Review confere contra o formulário de "Tratamento de dados" (responsável e
 * operadores). ROSACELL LTDA é a entidade verificada na Meta; trocar aqui sem trocar lá deixa as duas se
 * contradizendo.
 *
 * `email` vazio: o Lucas ainda vai criar o endereço de contato (19/11/2026). Até lá os Termos e o DPA dizem
 * "pelos canais de atendimento informados ao Cliente" (`porContato`), e a Política de privacidade mantém o
 * e-mail que já publica (o da App Review).
 */
export const OPERADOR = {
  razaoSocial: 'ROSACELL LTDA',
  cnpj: '51.971.358/0001-00',
  endereco: 'Rua José Maria Rangel, 40, Chácara do Ouro, Mogi Guaçu/SP, CEP 13840-294',
  email: '',
  foro: 'Mogi Guaçu/SP',
  site: 'https://crm-saas-beta.vercel.app',
} as const

/** "por contato@…" quando há e-mail; senão, os canais de atendimento. */
export const porContato: string = OPERADOR.email
  ? `por ${OPERADOR.email}`
  : 'pelos canais de atendimento informados ao Cliente'

/** As condições comerciais que os Termos citam (os valores recomendados, 19/11/2026). */
export const CONDICOES = {
  diasDeTeste: 14,
  diasParaExportar: 30,
  cobranca: 'mensal, sem fidelidade',
} as const

/** Data da versão piloto 0.9 dos três documentos. */
export const PUBLICADO_EM = '19 de novembro de 2026'
