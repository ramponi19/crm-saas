import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Política de Privacidade | Nexus CRM',
}

/**
 * Página pública de privacidade.
 *
 * É a URL exigida pela Meta em "Configurações do app → Básico", e o analista da
 * App Review a abre como item de checklist. Por isso ela não é texto decorativo:
 * o que está aqui precisa bater, item por item, com o formulário de "Tratamento
 * de dados" da submissão.
 *
 * A versão anterior (junho/2025) afirmava "nenhum dado é transmitido a terceiros
 * fora da Meta e da JM Store" enquanto a submissão declarava cinco operadores —
 * a mesma revisão se contradizendo. Ao mexer na lista de operadores do
 * formulário, mexa também na seção 5 daqui.
 *
 * A tradução em inglês no fim não é firula: o analista não lê português, e
 * política que ele não entende é política que ele não valida.
 */

const EMPRESA = {
  razaoSocial: 'ROSACELL LTDA',
  /**
   * CNPJ da ROSACELL LTDA — a mesma entidade do negócio verificado na Meta
   * (verificação de 08/08/2025) e a declarada como responsável no `responsible-1`
   * da App Review. "JM Store Importados" é o nome fantasia da operação de varejo.
   */
  cnpj: '51.971.358/0001-00',
  email: 'contato@jmstore.com.br',
  site: 'https://crm-saas-beta.vercel.app',
}

const ATUALIZADO_PT = 'Última atualização: 28 de agosto de 2026'
const ATUALIZADO_EN = 'Last updated: August 28, 2026'

/**
 * Operadores. Cada linha aqui corresponde a um registro "processor" no
 * formulário da Meta — mesma empresa, mesma finalidade, mesmos países.
 */
const OPERADORES_PT: [string, string, string][] = [
  ['Supabase', 'Banco de dados, armazenamento de arquivos e funções de servidor', 'Brasil (São Paulo), com acesso remoto a partir dos Estados Unidos'],
  ['Vercel', 'Hospedagem da aplicação', 'Estados Unidos'],
  ['Anthropic', 'Geração de resumos e sugestões de resposta, quando o recurso de inteligência de atendimento está ativado pela empresa usuária', 'Estados Unidos'],
  ['Google', 'Assistente de uso do sistema, que recebe apenas o texto digitado pelo usuário na caixa do assistente', 'Estados Unidos'],
  ['Sentry', 'Monitoramento de erros da aplicação', 'Estados Unidos'],
]

const OPERADORES_EN: [string, string, string][] = [
  ['Supabase', 'Database, file storage and server functions', 'Brazil (São Paulo), with remote access from the United States'],
  ['Vercel', 'Application hosting', 'United States'],
  ['Anthropic', 'Conversation summaries and suggested replies, when the sales-intelligence feature is enabled by the business using the platform', 'United States'],
  ['Google', 'In-app assistant, which receives only the text typed by the user in the assistant box', 'United States'],
  ['Sentry', 'Application error monitoring', 'United States'],
]

const S = {
  main: { maxWidth: 760, margin: '0 auto', padding: '48px 24px', fontFamily: 'sans-serif', color: '#1a1a1a', lineHeight: 1.7 } as const,
  h1: { fontSize: 28, fontWeight: 700, marginBottom: 8 } as const,
  data: { color: '#666', marginBottom: 32 } as const,
  secao: { marginBottom: 28 } as const,
  h2: { fontSize: 18, fontWeight: 600, marginBottom: 8 } as const,
  ul: { paddingLeft: 20, marginTop: 8 } as const,
  tabela: { width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 14 } as const,
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e5e5', verticalAlign: 'top' } as const,
  td: { padding: '8px 10px', borderBottom: '1px solid #eee', verticalAlign: 'top' } as const,
  divisor: { border: 0, borderTop: '1px solid #e5e5e5', margin: '48px 0 32px' } as const,
  link: { color: '#2563eb' } as const,
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section style={S.secao}>
      <h2 style={S.h2}>{titulo}</h2>
      {children}
    </section>
  )
}

function TabelaOperadores({
  linhas,
  cabecalho,
}: {
  linhas: [string, string, string][]
  cabecalho: [string, string, string]
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={S.tabela}>
        <thead>
          <tr>
            {cabecalho.map((c) => <th key={c} style={S.th}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map(([nome, finalidade, paises]) => (
            <tr key={nome}>
              <td style={{ ...S.td, fontWeight: 600, whiteSpace: 'nowrap' }}>{nome}</td>
              <td style={S.td}>{finalidade}</td>
              <td style={S.td}>{paises}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PrivacyPage() {
  return (
    <main style={S.main}>
      <h1 style={S.h1}>Política de Privacidade</h1>
      <p style={S.data}>{ATUALIZADO_PT}</p>

      <Secao titulo="1. Quem somos">
        <p>
          O <strong>Nexus CRM</strong> (<strong>{EMPRESA.site}</strong>) é uma plataforma de gestão de
          relacionamento com clientes operada pela <strong>{EMPRESA.razaoSocial}</strong>, inscrita no
          CNPJ {EMPRESA.cnpj}. A {EMPRESA.razaoSocial} é a responsável pelos dados tratados na
          plataforma, incluindo os recebidos das APIs da Meta.
        </p>
        <p style={{ marginTop: 8 }}>
          Empresas contratantes usam o Nexus CRM para centralizar, em um só lugar, o atendimento que
          fazem aos próprios clientes por WhatsApp, Instagram e Messenger. Os dados de cada empresa
          contratante ficam isolados dos das demais.
        </p>
      </Secao>

      <Secao titulo="2. Dados coletados">
        <p>Coletamos apenas o necessário para o atendimento:</p>
        <ul style={S.ul}>
          <li>Nome, nome de usuário e identificador do contato no WhatsApp, Instagram ou Messenger</li>
          <li>Foto de perfil pública do contato, quando disponibilizada pela plataforma de origem</li>
          <li>Conteúdo das mensagens trocadas entre o contato e a empresa contratante</li>
          <li>Data e hora das interações</li>
          <li>Dados de cadastro dos funcionários que usam o sistema: nome, e-mail e permissões</li>
        </ul>
        <p style={{ marginTop: 8 }}>
          Não coletamos dados sensíveis, não rastreamos a navegação do contato fora do atendimento e
          não compramos listas de dados de terceiros.
        </p>
      </Secao>

      <Secao titulo="3. Como usamos os dados">
        <ul style={S.ul}>
          <li>Receber, responder e organizar conversas com clientes</li>
          <li>Registrar o histórico do atendimento para consulta da própria empresa contratante</li>
          <li>Gerar indicadores internos de atendimento e de vendas para a empresa contratante</li>
        </ul>
        <p style={{ marginTop: 8 }}>
          <strong>Não vendemos dados.</strong> Não os usamos para publicidade, segmentação de anúncios
          ou qualquer finalidade fora do atendimento. Não usamos, nem autorizamos terceiros a usar,
          esses dados para treinar modelos de inteligência artificial.
        </p>
      </Secao>

      <Secao titulo="4. Uso das APIs da Meta">
        <p>
          A plataforma integra as APIs oficiais do WhatsApp Business, do Instagram e do Messenger
          (Meta Platforms, Inc.) exclusivamente para enviar e receber mensagens dentro das janelas de
          atendimento permitidas pelas políticas da Meta.
        </p>
        <p style={{ marginTop: 8 }}>
          A conexão do Instagram é feita pela própria empresa contratante, autorizando sua conta
          profissional pelo login do Instagram. A autorização pode ser revogada a qualquer momento
          pela empresa, dentro do sistema ou nas configurações da conta no Instagram; ao revogar,
          paramos de receber novas mensagens daquela conta.
        </p>
        <p style={{ marginTop: 8 }}>
          Os tokens de acesso fornecidos pela Meta são armazenados cifrados e nunca são expostos na
          interface nem compartilhados.
        </p>
      </Secao>

      <Secao titulo="5. Com quem compartilhamos">
        <p>
          Não vendemos nem cedemos dados. Compartilhamos o estritamente necessário com os prestadores
          de infraestrutura abaixo, que tratam os dados por nossa conta e ordem, sob contrato:
        </p>
        <TabelaOperadores
          linhas={OPERADORES_PT}
          cabecalho={['Prestador', 'Finalidade', 'Onde os dados são tratados']}
        />
        <p style={{ marginTop: 12 }}>
          Fora desta lista, só compartilhamos dados por determinação legal ou judicial.
        </p>
      </Secao>

      <Secao titulo="6. Armazenamento e segurança">
        <p>
          Os dados são armazenados em servidores no Brasil (São Paulo), com criptografia em repouso e
          em trânsito. O acesso é restrito por autenticação e por regras de isolamento aplicadas no
          próprio banco de dados, de modo que uma empresa contratante não alcança os dados de outra.
        </p>
      </Secao>

      <Secao titulo="7. Retenção">
        <p>
          As conversas são mantidas pelo período necessário ao atendimento e a obrigações legais, não
          excedendo 2 anos a contar do último contato. Depois disso, são apagadas.
        </p>
      </Secao>

      <Secao titulo="8. Direitos do titular">
        <p>
          Nos termos da LGPD (Lei 13.709/2018), você pode solicitar a qualquer momento confirmação do
          tratamento, acesso, correção, portabilidade, anonimização ou exclusão dos seus dados, além
          de revogar consentimento. Basta escrever para <strong>{EMPRESA.email}</strong>.
        </p>
      </Secao>

      <Secao titulo="9. Como pedir a exclusão dos seus dados">
        <p>
          Envie um e-mail para <strong>{EMPRESA.email}</strong> com o assunto{' '}
          <strong>&quot;Exclusão de dados&quot;</strong>, informando o número de telefone ou o nome de
          usuário do Instagram usado no atendimento. Confirmamos o recebimento e concluímos a exclusão
          em até <strong>30 dias</strong>, avisando você por e-mail quando terminar.
        </p>
        <p style={{ marginTop: 8 }}>
          A exclusão abrange as mensagens, o cadastro do contato e os identificadores recebidos das
          APIs da Meta. Podemos reter apenas o que a lei exigir, e somente pelo prazo exigido.
        </p>
      </Secao>

      <Secao titulo="10. Contato">
        <p>
          {EMPRESA.razaoSocial} · CNPJ {EMPRESA.cnpj}<br />
          {EMPRESA.email}<br />
          <a href={EMPRESA.site} style={S.link}>{EMPRESA.site}</a>
        </p>
      </Secao>

      <hr style={S.divisor} />

      <h1 style={S.h1}>Privacy Policy</h1>
      <p style={S.data}>{ATUALIZADO_EN} · English version of the policy above</p>

      <Secao titulo="1. Who we are">
        <p>
          <strong>Nexus CRM</strong> (<strong>{EMPRESA.site}</strong>) is a customer relationship
          management platform operated by <strong>{EMPRESA.razaoSocial}</strong>, a company registered
          in Brazil under CNPJ {EMPRESA.cnpj}. {EMPRESA.razaoSocial} is responsible for the data
          processed on the platform, including data received from Meta APIs.
        </p>
        <p style={{ marginTop: 8 }}>
          Businesses use Nexus CRM to handle, in one place, the conversations they have with their own
          customers over WhatsApp, Instagram and Messenger. Each business&apos;s data is isolated from
          every other business&apos;s data.
        </p>
      </Secao>

      <Secao titulo="2. Data we collect">
        <ul style={S.ul}>
          <li>The contact&apos;s name, username and identifier on WhatsApp, Instagram or Messenger</li>
          <li>The contact&apos;s public profile picture, when provided by the source platform</li>
          <li>The content of messages exchanged between the contact and the business</li>
          <li>Date and time of the interactions</li>
          <li>Account details of the staff who use the system: name, e-mail and permissions</li>
        </ul>
        <p style={{ marginTop: 8 }}>
          We do not collect sensitive data, do not track the contact&apos;s browsing outside the
          conversation, and do not buy third-party data lists.
        </p>
      </Secao>

      <Secao titulo="3. How we use the data">
        <ul style={S.ul}>
          <li>Receiving, replying to and organising customer conversations</li>
          <li>Keeping a conversation history for the business itself to consult</li>
          <li>Producing internal service and sales metrics for the business</li>
        </ul>
        <p style={{ marginTop: 8 }}>
          <strong>We do not sell data.</strong> We do not use it for advertising, ad targeting or any
          purpose outside customer service. We do not use it, and do not allow third parties to use
          it, to train artificial intelligence models.
        </p>
      </Secao>

      <Secao titulo="4. Use of Meta APIs">
        <p>
          The platform integrates the official WhatsApp Business, Instagram and Messenger APIs (Meta
          Platforms, Inc.) solely to send and receive messages within the messaging windows allowed by
          Meta policies.
        </p>
        <p style={{ marginTop: 8 }}>
          Each business connects its own Instagram professional account through Instagram Login. The
          business can revoke that authorisation at any time, either inside the system or in its
          Instagram account settings; once revoked, we stop receiving new messages from that account.
        </p>
        <p style={{ marginTop: 8 }}>
          Access tokens issued by Meta are stored encrypted and are never exposed in the interface nor
          shared with anyone.
        </p>
      </Secao>

      <Secao titulo="5. Who we share data with">
        <p>
          We do not sell or trade data. We share only what is necessary with the infrastructure
          providers below, which process data on our behalf and under contract:
        </p>
        <TabelaOperadores
          linhas={OPERADORES_EN}
          cabecalho={['Provider', 'Purpose', 'Where data is processed']}
        />
        <p style={{ marginTop: 12 }}>
          Outside this list, we disclose data only when required by law or court order.
        </p>
      </Secao>

      <Secao titulo="6. Storage and security">
        <p>
          Data is stored on servers located in Brazil (São Paulo), encrypted at rest and in transit.
          Access is restricted by authentication and by isolation rules enforced in the database
          itself, so that one business cannot reach another business&apos;s data.
        </p>
      </Secao>

      <Secao titulo="7. Retention">
        <p>
          Conversations are kept for as long as needed for customer service and legal obligations, and
          no longer than 2 years from the last contact. After that they are deleted.
        </p>
      </Secao>

      <Secao titulo="8. Your rights">
        <p>
          Under the Brazilian data protection law (LGPD, Law 13.709/2018) you may at any time request
          confirmation of processing, access, correction, portability, anonymisation or deletion of
          your data, and withdraw consent. Write to <strong>{EMPRESA.email}</strong>.
        </p>
      </Secao>

      <Secao titulo="9. How to request deletion of your data">
        <p>
          Send an e-mail to <strong>{EMPRESA.email}</strong> with the subject{' '}
          <strong>&quot;Data deletion&quot;</strong>, stating the phone number or Instagram username
          used in the conversation. We acknowledge receipt and complete the deletion within{' '}
          <strong>30 days</strong>, confirming by e-mail when it is done.
        </p>
        <p style={{ marginTop: 8 }}>
          Deletion covers the messages, the contact record and the identifiers received from Meta
          APIs. We retain only what the law requires, and only for as long as it requires.
        </p>
      </Secao>

      <Secao titulo="10. Contact">
        <p>
          {EMPRESA.razaoSocial} · CNPJ {EMPRESA.cnpj}<br />
          {EMPRESA.email}<br />
          <a href={EMPRESA.site} style={S.link}>{EMPRESA.site}</a>
        </p>
      </Secao>
    </main>
  )
}
