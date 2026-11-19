import { VersaoDocumento } from '@/components/legal/versao-documento'
import { PaginaLegal, SecaoLegal } from '@/components/legal/secao'
import { CONDICOES, OPERADOR, porContato } from '@/lib/legal-operador'

export const metadata = { title: 'Termos de uso' }

/**
 * Termos de uso do Nexus — Versão piloto 0.9 (19/11/2026, pedido do Lucas para o primeiro piloto). Os dados de
 * quem opera e as condições comerciais vêm de lib/legal-operador.ts. Texto de piloto: não substitui a revisão
 * de um advogado antes da versão 1.0.
 */
export default function TermosPage() {
  const O = OPERADOR
  return (
    <PaginaLegal titulo="Termos de uso">
      <VersaoDocumento documento="termos" />

      <SecaoLegal titulo="1. Quem somos e quem aceita">
        <p>
          O <strong>Nexus</strong> ({O.site}) é uma plataforma de gestão de relacionamento com clientes (CRM) operada
          pela <strong>{O.razaoSocial}</strong>, CNPJ {O.cnpj}, com sede em {O.endereco} (&quot;Nexus&quot;).
        </p>
        <p>
          Estes termos valem entre o Nexus e a empresa que se cadastra (&quot;Cliente&quot;). Quem faz o cadastro declara ter
          poderes para aceitar em nome da empresa. Ao concluir o cadastro, o Cliente aceita estes Termos, a Política de
          privacidade e o Acordo de tratamento de dados (DPA), que fazem parte deste contrato.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="2. O serviço">
        <p>
          O Nexus reúne o atendimento por WhatsApp, Instagram e Messenger, o funil de vendas, as tarefas e as automações
          do Cliente em um só lugar. O plano inclui o núcleo da plataforma; módulos e itens adicionais (usuários,
          números, lojas) são contratados à parte, conforme a tabela vigente no momento da contratação.
        </p>
        <p>
          A conexão dos canais usa as APIs oficiais da Meta. O funcionamento desses canais depende também da Meta e das
          regras dela, que o Nexus não controla.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="3. Cadastro, usuários e acesso">
        <ul>
          <li>O Cliente informa dados verdadeiros e os mantém atualizados.</li>
          <li>Cada usuário tem login próprio. O Cliente responde pelo que seus usuários fazem na plataforma e pela guarda das senhas.</li>
          <li>O Cliente define quem da equipe acessa o quê; o Nexus oferece os papéis e as permissões para isso.</li>
          <li>Suspeita de acesso indevido deve ser comunicada imediatamente ao Nexus, {porContato}.</li>
        </ul>
      </SecaoLegal>

      <SecaoLegal titulo="4. Período de teste">
        <p>
          A empresa recém-cadastrada usa o Nexus gratuitamente por <strong>{CONDICOES.diasDeTeste} dias</strong>, sem
          cartão. Ao fim do teste sem contratação, a conta passa a <strong>só leitura</strong>: o Cliente continua vendo
          e exportando seus dados, mas não cria, edita nem envia mensagens até contratar. Nada é apagado por fim de teste.
        </p>
        <p>
          Empresas em <strong>piloto</strong> combinado com o Nexus usam a plataforma nas condições acordadas por escrito
          (prazo e escopo); no silêncio do acordo, valem estes Termos.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="5. Preço, cobrança e reajuste">
        <ul>
          <li>A cobrança é <strong>{CONDICOES.cobranca}</strong>: o Cliente paga mês a mês e pode sair a qualquer momento, sem multa.</li>
          <li>O valor é o do plano e dos adicionais contratados, cobrado antecipadamente a cada mês.</li>
          <li>Atraso de pagamento pode levar a conta a só leitura depois de aviso; os dados continuam preservados e exportáveis.</li>
          <li>Mudança de preço é avisada com pelo menos 30 dias de antecedência e vale a partir do ciclo seguinte.</li>
          <li>
            As tarifas que a Meta cobra pelas conversas do WhatsApp (por exemplo, mensagens iniciadas pela empresa) são
            cobradas pela própria Meta, na forma de pagamento cadastrada pelo Cliente na conta dele, e não fazem parte do
            preço do Nexus.
          </li>
        </ul>
      </SecaoLegal>

      <SecaoLegal titulo="6. Cancelamento e saída">
        <p>
          O Cliente cancela quando quiser, pedindo {porContato}. O acesso segue até o fim do mês já pago. Depois
          do encerramento, os dados ficam disponíveis para <strong>exportação por {CONDICOES.diasParaExportar} dias</strong>;
          passado esse prazo, são excluídos de forma definitiva, salvo o que a lei obrigue a guardar.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="7. Uso aceitável">
        <p>O Cliente se compromete a:</p>
        <ul>
          <li>cumprir a lei, inclusive a LGPD e o Código de Defesa do Consumidor, no contato com os clientes dele;</li>
          <li>seguir as políticas da Meta para WhatsApp, Instagram e Messenger (como a Política de Mensagens do WhatsApp Business);</li>
          <li>não enviar spam, conteúdo ilícito, enganoso ou ofensivo, nem mensagens a quem pediu para não receber;</li>
          <li>ter base legal para os dados que coloca no Nexus, inclusive os importados por planilha;</li>
          <li>não tentar acessar dados de outras empresas, burlar limites ou prejudicar o funcionamento da plataforma.</li>
        </ul>
        <p>O descumprimento grave pode levar à suspensão da conta, com aviso sempre que possível.</p>
      </SecaoLegal>

      <SecaoLegal titulo="8. Dados do Cliente e privacidade">
        <p>
          Os dados dos clientes e contatos do Cliente pertencem ao Cliente, que é o <strong>controlador</strong> desses dados;
          o Nexus é o <strong>operador</strong> e os trata só para prestar o serviço, conforme o{' '}
          <a href="/dpa" className="underline underline-offset-2">Acordo de tratamento de dados (DPA)</a>. Como o Nexus trata os
          dados de cadastro e de uso da plataforma está na{' '}
          <a href="/privacy" className="underline underline-offset-2">Política de privacidade</a>. O Cliente pode exportar
          seus dados a qualquer momento.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="9. Disponibilidade e suporte">
        <p>
          O Nexus emprega esforços razoáveis para manter a plataforma disponível e avisa com antecedência as manutenções
          programadas. Falhas de terceiros (Meta, provedores de internet, hospedagem) podem afetar o serviço. Durante o
          período de piloto não há acordo formal de nível de serviço; o suporte é feito pelos canais combinados com o
          Cliente{O.email ? ` e por ${O.email}` : ''}.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="10. Propriedade intelectual">
        <p>
          A plataforma, a marca e o código são do Nexus. O Cliente recebe o direito de usá-los enquanto o contrato durar,
          sem poder copiar, revender ou fazer engenharia reversa. Sugestões do Cliente podem ser usadas para melhorar o
          produto, sem expor dados dele.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="11. Responsabilidade">
        <p>
          O Nexus responde pelos danos diretos que causar ao Cliente, limitados ao valor pago pelo Cliente nos 12 meses
          anteriores ao fato. O Nexus não responde por lucros cessantes, por decisões comerciais do Cliente, pelo conteúdo
          das mensagens que o Cliente envia, nem por falhas ou bloqueios causados pela Meta. Esses limites não se aplicam
          a dolo ou ao que a lei não permitir limitar.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="12. Mudanças nestes Termos">
        <p>
          Estes Termos podem mudar. Mudança relevante é avisada com pelo menos 30 dias de antecedência na plataforma ou por
          e-mail, e o Cliente que não concordar pode cancelar sem custo antes de ela valer. Esta é a versão do período de
          piloto; a versão 1.0 substituirá esta quando publicada.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="13. Lei e foro">
        <p>
          Estes Termos seguem a lei brasileira. Fica eleito o foro da comarca de <strong>{O.foro}</strong> para resolver
          qualquer questão, com renúncia a qualquer outro.
        </p>
      </SecaoLegal>

      <SecaoLegal titulo="14. Contato">
        <p>
          {O.razaoSocial} · CNPJ {O.cnpj}<br />
          {O.endereco}
          {O.email && <><br />{O.email}</>}
        </p>
      </SecaoLegal>
    </PaginaLegal>
  )
}
