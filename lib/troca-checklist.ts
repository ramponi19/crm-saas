/**
 * O roteiro de teste do aparelho, antes de fechar a cotação.
 *
 * ══ POR QUE OS ITENS APONTAM PARA AVARIAS ══════════════════════════════════
 *
 * Um checklist que só marca "passou/não passou" não muda o valor: o vendedor
 * testa, reprova, e depois tem que lembrar qual caixa marcar no passo 2. Cada
 * item que reprova aqui aponta a avaria que ele significa lá — é a ponte entre
 * "achei defeito" e "o valor caiu".
 *
 * Itens sem `avarias` são testes que NÃO têm desconto: ou passam, ou o aparelho
 * não serve (flash, GPS, sensores, segurança). Não existe "iPhone sem GPS por
 * menos".
 *
 * ══ E POR QUE ALGUNS SÓ ALERTAM ════════════════════════════════════════════
 *
 * `recusar` marca o que não é questão de preço: `panic`/Cydia, iCloud de
 * terceiro e IMEI divergente. Ali o certo é não pegar o aparelho — desconto
 * nenhum cobre aparelho que pode voltar bloqueado ou ser produto de roubo.
 * O texto é o aviso que aparece no item, em tom de alerta.
 *
 * As chaves de `avarias` vêm de lib/troca-avarias.ts; a numeração (`n`) é a que
 * aparece na tela e é a chave gravada em `troca_cotacoes.checklist`.
 */

export interface ItemChecklist {
  /** Número na tela E chave no banco. Não renumere itens já publicados. */
  n: number
  titulo: string
  como: string
  /** Avarias que este teste indica quando reprova. Vazio = sem desconto. */
  avarias?: string[]
  /** Aviso em tom de alerta: aqui não se negocia preço, se recusa o aparelho. */
  recusar?: string
}

export interface SecaoChecklist {
  titulo: string
  intro: string
  itens: ItemChecklist[]
}

export const CHECKLIST: SecaoChecklist[] = [
  {
    titulo: 'Inspeção visual',
    intro: 'Antes de ligar: aparelho na mão, sob boa luz, girando devagar.',
    itens: [
      { n: 1, titulo: 'Tela trincada ou estourada', como: 'Olhe a tela apagada sob a luz — trinco fino desaparece com a tela acesa.', avarias: ['tela'] },
      { n: 2, titulo: 'Riscos na tela', como: 'Risco que só aparece na luz é leve; risco que a unha sente é moderado.', avarias: ['marcas_leves', 'marcas_moderadas'] },
      { n: 3, titulo: 'Traseira trincada ou estourada', como: 'Vidro de trás, incluindo o anel das câmeras.', avarias: ['traseira'] },
      { n: 4, titulo: 'Carcaça', como: 'Quinas, laterais e a região da base. Amassado indica queda.', avarias: ['marcas_leves', 'marcas_moderadas'] },
    ],
  },
  {
    titulo: 'Peças e notificações',
    intro: 'Ligue o aparelho e veja o que o sistema já denuncia sozinho.',
    itens: [
      { n: 5, titulo: 'Notificação de peça', como: 'Ajustes › Geral › Sobre: mensagens de "peça desconhecida" em bateria, tela ou câmera. Marque conforme o caso.', avarias: ['notif_bateria', 'notif_tela', 'notif_camera'] },
      { n: 6, titulo: 'Saúde da bateria', como: 'Ajustes › Bateria › Saúde da bateria. Abaixo do corte da sua loja, reprova.', avarias: ['bateria'] },
    ],
  },
  {
    titulo: 'Botões e conectores',
    intro: 'Mostre pro cliente onde fica cada um, testando na hora.',
    itens: [
      { n: 7, titulo: 'Botão de bloquear', como: 'Lado direito: aperte pra ligar/bloquear a tela. A resposta tem que ser firme, sem precisar apertar de novo.' },
      { n: 8, titulo: 'Volume e silencioso (ou Ação)', como: 'Lado esquerdo: os dois botões de volume. Acima deles, no 15 Pro/16 em diante é o botão de Ação; nos outros é a chavinha de silencioso, que troca o ícone de sino na tela. Teste os três, conforme o modelo.' },
      { n: 9, titulo: 'Doc de carga', como: 'Conecte o cabo. Conexão falhando ou que só funciona numa posição: encaminhe pro técnico — só ele diagnostica.', avarias: ['doc_carga'] },
      { n: 10, titulo: 'Vedação suspeita', como: 'Parafusos da base espanados ou riscados indicam abertura anterior. Redobre a atenção nos testes de notificação de peça, saúde da bateria e doc de carga.' },
    ],
  },
  {
    titulo: 'Ligar, câmeras e áudio',
    intro: 'Sequência de desbloquear e testar tudo que grava ou reproduz.',
    itens: [
      { n: 11, titulo: 'Face ID cadastra e desbloqueia', como: 'Apague e recadastre um rosto na hora. Falhou ou aparece "indisponível", reprova. Modelo com Touch ID (8/8 Plus): o mesmo teste com a digital.', avarias: ['face_id'] },
      { n: 12, titulo: 'Flash', como: 'Dispare o flash numa foto no escuro, ou ligue a lanterna. Não acender reprova.' },
      { n: 13, titulo: 'Câmera traseira', como: 'Foto nítida em todas as lentes que o modelo tiver (principal, ultra angular, telefoto), foco fecha, sem manchas nem tremido. Grave um vídeo curto e confira se o áudio do microfone traseiro está saindo.', avarias: ['camera_traseira'] },
      { n: 14, titulo: 'Câmera frontal', como: 'Selfie nítida. Grave um vídeo curto e confira se o áudio está saindo.' },
      { n: 15, titulo: 'Alto-falantes, microfones, campainha', como: 'Alto-falantes: ligação em viva-voz e música. Microfones: grave um áudio. Teste também a campainha e o modo silencioso com vibração.' },
    ],
  },
  {
    titulo: 'Tela, conectividade e sensores',
    intro: 'Com o aparelho ligado e desbloqueado.',
    itens: [
      { n: 16, titulo: 'Toque em toda a área', como: 'Arraste um ícone pelos 4 cantos. Região que não responde é tela com defeito.', avarias: ['tela'] },
      { n: 17, titulo: 'Manchas, queimado, linhas, True Tone ausente', como: 'Fundo branco e fundo preto, no brilho máximo. Reprovou? Cheque também a notificação de peça.', avarias: ['tela'] },
      { n: 18, titulo: 'Wi-Fi, Bluetooth e rede', como: 'Wi-Fi conecta, Bluetooth liga, 4G/5G navega.' },
      { n: 19, titulo: 'GPS', como: 'Abra o Mapas e veja a localização fixar.' },
      { n: 20, titulo: 'Sensores', como: 'Rotação de tela, e sensor de proximidade (a tela apaga durante a ligação).' },
    ],
  },
  {
    titulo: 'Dados de análise',
    intro: 'O histórico que o próprio iOS guarda de travamentos e de software estranho.',
    itens: [
      { n: 21, titulo: 'Panic e jailbreak',
        como: 'Ajustes › Privacidade e Segurança › Análise e Melhorias › Dados de Análise e Uso. Na busca do topo, procure por "panic" (aparece como panic-full ou panic-base) e por "Cydia".',
        recusar: 'Achou panic ou Cydia nos dados de análise? Recomendado não pegar o aparelho na troca.' },
    ],
  },
  {
    titulo: 'Segurança',
    intro: 'Antes de fechar negócio: elimina qualquer vínculo do aparelho com o dono anterior.',
    itens: [
      { n: 22, titulo: 'Buscar iPhone desativado',
        como: 'Ajustes › [nome] › Buscar. Peça pro cliente desativar na sua frente, com a senha dele.',
        recusar: 'Nunca aceite aparelho com conta iCloud de terceiro.' },
      { n: 23, titulo: 'Conta iCloud removida', como: 'Ajustes › topo: não pode haver conta logada ao finalizar a compra.' },
      { n: 24, titulo: 'IMEI confere e sem restrição',
        como: 'Disque *#06#, compare com o IMEI de Ajustes › Geral › Sobre e com o da bandeja ou da caixa. Consulte restrição e roubo antes de pagar.',
        recusar: 'IMEIs diferentes entre si = aparelho adulterado. Recuse.' },
      { n: 25, titulo: 'Sem MDM/supervisão', como: 'Ajustes › Geral › VPN e Gerenciamento de Dispositivo: tem que estar vazio. Aparelho corporativo bloqueia depois.' },
      { n: 26, titulo: 'Sem modo perdido/bloqueio de operadora', como: 'Ajustes › Geral › Sobre: "Bloqueio de operadora" deve mostrar "Sem restrições de SIM". Chamada com o chip da loja não basta — chip da mesma operadora do bloqueio passa. Confirme também que o chip funciona e faz chamada.' },
    ],
  },
]

/** Quantos itens o roteiro tem. Calculado, para não desencontrar da lista. */
export const TOTAL_ITENS = CHECKLIST.reduce((s, sec) => s + sec.itens.length, 0)
