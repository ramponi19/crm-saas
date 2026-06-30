import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade | JM Store CRM',
}

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: 'sans-serif', color: '#1a1a1a', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Política de Privacidade</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>Última atualização: junho de 2025</p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>1. Quem somos</h2>
        <p>
          JM Store CRM (<strong>https://crm-saas-beta.vercel.app</strong>) é um sistema de gestão de relacionamento com
          clientes utilizado internamente pela JM Store para centralizar atendimentos via WhatsApp, Instagram e Messenger.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>2. Dados coletados</h2>
        <p>Coletamos apenas os dados necessários para o atendimento ao cliente:</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>Nome e identificador do contato (WhatsApp, Instagram ou Messenger)</li>
          <li>Conteúdo das mensagens trocadas com nossa equipe</li>
          <li>Data e hora das interações</li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>3. Como usamos os dados</h2>
        <p>Os dados são usados exclusivamente para:</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>Responder e gerenciar conversas com clientes</li>
          <li>Registrar histórico de atendimentos internos</li>
          <li>Melhorar a qualidade do serviço prestado</li>
        </ul>
        <p style={{ marginTop: 8 }}>Não vendemos, compartilhamos nem utilizamos os dados para fins publicitários.</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>4. Uso da API da Meta</h2>
        <p>
          Este sistema integra as APIs oficiais do WhatsApp Business, Instagram e Messenger (Meta Platforms, Inc.)
          exclusivamente para envio e recebimento de mensagens dentro das janelas de atendimento permitidas pelas
          políticas da plataforma. Nenhum dado é transmitido a terceiros fora da Meta e da JM Store.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>5. Armazenamento e segurança</h2>
        <p>
          Os dados são armazenados em servidores seguros (Supabase — hospedagem na AWS) com criptografia em repouso e
          em trânsito. O acesso é restrito aos colaboradores autorizados da JM Store.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>6. Retenção de dados</h2>
        <p>
          Os dados de conversas são mantidos pelo período necessário ao atendimento e para fins legais, não excedendo
          2 anos a partir do último contato.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>7. Direitos do titular</h2>
        <p>
          Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento pelo e-mail:
          <strong> contato@jmstore.com.br</strong>
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>8. Contato</h2>
        <p>
          JM Store · contato@jmstore.com.br<br />
          <a href="https://crm-saas-beta.vercel.app" style={{ color: '#2563eb' }}>https://crm-saas-beta.vercel.app</a>
        </p>
      </section>
    </main>
  )
}
