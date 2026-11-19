import { VersaoDocumento } from '@/components/legal/versao-documento'
import { PaginaLegal, SecaoLegal } from '@/components/legal/secao'
import { CONDICOES, OPERADOR } from '@/lib/legal-operador'

export const metadata = { title: 'Acordo de tratamento de dados' }

/**
 * DPA — Acordo de tratamento de dados entre o Cliente (controlador dos dados dos contatos dele) e o Nexus
 * (operador). Versão piloto 0.9 (19/11/2026), aceito no cadastro com os Termos e a Privacidade. Os
 * suboperadores são os mesmos da Política de privacidade (seção 5 de /privacy): mexeu numa lista, mexa na outra.
 * Texto de piloto: não substitui a revisão de um advogado antes da versão 1.0.
 */
const SUBOPERADORES: [string, string, string][] = [
  ['Supabase', 'Banco de dados, arquivos e funções de servidor', 'Brasil (São Paulo), com acesso remoto dos EUA'],
  ['Vercel', 'Hospedagem da aplicação', 'Estados Unidos'],
  ['Anthropic', 'Resumos e sugestões de resposta, só quando o Cliente liga o recurso de inteligência de atendimento', 'Estados Unidos'],
  ['Google', 'Assistente de uso, que recebe só o texto digitado na caixa do assistente', 'Estados Unidos'],
  ['Sentry', 'Monitoramento de erros da aplicação', 'Estados Unidos'],
]

export default function DpaPage() {
  const O = OPERADOR
  return (
    <PaginaLegal titulo="Acordo de tratamento de dados (DPA)">
      <VersaoDocumento documento="dpa" />

      <SecaoLegal titulo="1. Partes e objeto">
        <p>
          Este acordo complementa os <a href="/termos" className="underline underline-offset-2">Termos de uso</a> e regula o
          tratamento de dados pessoais que o Nexus ({O.razaoSocial}, CNPJ {O.cnpj}) faz em nome do Cliente, nos termos da Lei
          Geral de Proteção de Dados (Lei 13.709/2018, &quot;LGPD&quot;).
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="2. Papéis">
        <ul>
          <li>O <strong>Cliente é o controlador</strong> dos dados dos clientes, contatos e leads dele: decide o que entra no Nexus e para quê.</li>
          <li>O <strong>Nexus é o operador</strong>: trata esses dados só para prestar o serviço contratado e conforme as instruções do Cliente.</li>
          <li>Para os dados de cadastro e de uso da própria plataforma (por exemplo, login dos usuários), o Nexus é controlador, conforme a Política de privacidade.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal titulo="3. Dados e titulares">
        <ul>
          <li><strong>Titulares:</strong> clientes, contatos e leads do Cliente; usuários da equipe do Cliente.</li>
          <li><strong>Dados:</strong> nome, telefone, e-mail, identificadores do WhatsApp, Instagram e Messenger, conteúdo das conversas e anexos, histórico de negociação e as anotações que a equipe do Cliente registrar.</li>
          <li>O Cliente não deve colocar no Nexus dados sensíveis (art. 5º, II, da LGPD) que não sejam necessários ao atendimento.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal titulo="4. Finalidade e instruções">
        <p>
          O Nexus trata os dados para receber, enviar e organizar as conversas, manter o funil, as tarefas e as automações e
          gerar os indicadores do próprio Cliente. Não vende, não cede e não usa os dados do Cliente para publicidade nem para
          treinar modelos de inteligência artificial. As configurações que o Cliente faz na plataforma são as instruções dele;
          instrução que pareça contrária à lei é comunicada ao Cliente antes de ser cumprida.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="5. Suboperadores">
        <p>O Cliente autoriza o Nexus a usar os prestadores abaixo, que tratam os dados sob contrato e com obrigações de proteção equivalentes:</p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-ink">
                <th className="py-2 pr-3 font-semibold">Prestador</th><th className="py-2 pr-3 font-semibold">Finalidade</th><th className="py-2 font-semibold">Onde</th>
              </tr>
            </thead>
            <tbody>
              {SUBOPERADORES.map(([n, f, o]) => (
                <tr key={n} className="border-b border-line-soft align-top">
                  <td className="py-2 pr-3 font-medium text-ink">{n}</td><td className="py-2 pr-3">{f}</td><td className="py-2">{o}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          A Meta (WhatsApp, Instagram, Messenger) não é suboperadora do Nexus: é a plataforma que o próprio Cliente conecta, com
          contrato e regras próprias entre ela e o Cliente. Mudança nesta lista é avisada com 15 dias de antecedência; o
          Cliente pode se opor e, sem acordo, cancelar sem custo.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="6. Transferência internacional">
        <p>
          Parte dos suboperadores trata dados fora do Brasil, nos Estados Unidos. Essas transferências se apoiam nas garantias
          contratuais dos próprios prestadores e no art. 33 da LGPD.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="7. Segurança e confidencialidade">
        <ul>
          <li>Dados criptografados em trânsito e em repouso; tokens de acesso da Meta guardados cifrados.</li>
          <li>Isolamento entre empresas aplicado no próprio banco de dados: uma empresa não alcança os dados de outra.</li>
          <li>Acesso interno restrito a quem precisa para operar e dar suporte, sob dever de confidencialidade.</li>
          <li>Registro de acessos e monitoramento de erros.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal titulo="8. Incidentes">
        <p>
          O Nexus avisa o Cliente, por e-mail, em até <strong>48 horas</strong> depois de tomar conhecimento de um incidente de
          segurança que envolva dados do Cliente, com o que se sabe até ali, e segue informando. A comunicação à ANPD e aos
          titulares, quando cabível, é do Cliente como controlador, com o apoio do Nexus.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="9. Direitos dos titulares">
        <p>
          Pedidos de titulares (acesso, correção, exclusão, portabilidade) são respondidos pelo Cliente. A plataforma permite
          localizar, corrigir, exportar e excluir os dados de um contato; o que não puder ser feito pela tela, o Nexus faz a
          pedido do Cliente em até 15 dias. Pedido que chegar ao Nexus diretamente é encaminhado ao Cliente.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="10. Fim do contrato">
        <p>
          Encerrado o contrato, o Cliente tem <strong>{CONDICOES.diasParaExportar} dias</strong> para exportar os dados. Depois
          disso o Nexus os exclui da base ativa, e as cópias de segurança saem no ciclo normal de rotação, em até 30 dias,
          salvo o que a lei obrigue a guardar.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="11. Comprovação">
        <p>
          A pedido razoável do Cliente, uma vez por ano ou depois de um incidente, o Nexus fornece as informações necessárias para
          demonstrar o cumprimento deste acordo.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="12. Lei, foro e contato">
        <p>
          Este acordo segue a lei brasileira, com foro na comarca de <strong>{O.foro}</strong>. Contato sobre dados pessoais:{' '}
          {O.email ? <strong>{O.email}</strong> : 'pelos canais de atendimento informados ao Cliente'} · {O.razaoSocial} · {O.endereco}.
        </p>
      </SecaoLegal>
    </PaginaLegal>
  )
}
