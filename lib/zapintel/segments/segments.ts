// ─────────────────────────────────────────────────────────────────────────────
// ZapIntel — Segment Configuration System
// Each segment defines its own classification rules, signals, and UI
// ─────────────────────────────────────────────────────────────────────────────

export interface SegmentConfig {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  avgTicket: number;
  avgCycleDays: number;

  // Classification signals
  customerKeywords: string[];
  hotKeywords: string[];
  warmKeywords: string[];
  lostKeywords: string[];
  competitorKeywords: string[];

  // Objection categories
  objectionMap: {
    price: string[];
    timing: string[];
    authority: string[];
    trust: string[];
    competitor: string[];
  };

  // Buy signals to track
  buySignalMap: Record<string, string>;

  // Insight templates
  insights: {
    ghostTip: string;
    conversionTip: string;
    objectionTip: string;
    followupTip: string;
  };

  // Recommended metrics focus
  focusMetrics: string[];

  // Sample follow-up contexts
  followupContext: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOJA DE CELULARES / ELETRÔNICOS
// ─────────────────────────────────────────────────────────────────────────────
const CELULARES: SegmentConfig = {
  id: "celulares",
  name: "Loja de Celulares",
  icon: "📱",
  description: "iPhones, smartphones, eletrônicos e acessórios",
  color: "#7c5cfc",
  avgTicket: 5200,
  avgCycleDays: 4,
  customerKeywords: ["paguei", "comprovante", "imei", "nota fiscal", "entregou", "recebi", "chegou"],
  hotKeywords: ["pix", "cartão", "parcel", "18x", "12x", "saúde da bateria", "disponível", "reserva", "garantia", "entrega hoje", "entrega amanhã", "lacrado", "lacrad"],
  warmKeywords: ["qual o valor", "quanto está", "tem o modelo", "quais cores", "gostaria de saber", "tenho interesse"],
  lostKeywords: ["desisti", "comprei em outro", "mercado livre", "foi pra outro", "não preciso mais"],
  competitorKeywords: ["mercado livre", "shopee", "olx", "americanas", "magazine luiza", "mais barato em outro"],
  objectionMap: {
    price:     ["caro", "mais barato", "desconto", "mercado livre", "shopee", "olx", "abaixa"],
    timing:    ["vou pensar", "deixa eu ver", "depois", "mais tarde", "não decidi", "vou pesquisar"],
    authority: ["minha esposa", "meu marido", "patroa", "preciso ver com", "vou ver com"],
    trust:     ["seminovo", "original", "procedência", "garantia", "icloud limpo"],
    competitor:["mercado livre", "shopee", "olx", "comprei em outro"],
  },
  buySignalMap: {
    "pix": "Pediu chave Pix",
    "cartão": "Mencionou cartão",
    "18x": "Pediu 18x",
    "12x": "Pediu 12x",
    "reserva": "Pediu reserva",
    "nota fiscal": "Pediu nota fiscal",
    "saúde da bateria": "Verificou bateria",
    "disponível": "Verificou disponibilidade",
    "lacrado": "Quer produto lacrado",
    "garantia": "Perguntou sobre garantia",
  },
  insights: {
    ghostTip: "Notification_template bloqueia ~30% dos leads. Revisar automação do anúncio.",
    conversionTip: "Troca de aparelho é o maior gatilho — destacar 'Pegamos seu iPhone de entrada' em todo anúncio.",
    objectionTip: "Criar comparativo da sua loja vs Mercado Livre com diferenciais claros.",
    followupTip: "Leads que mencionam terceiros (esposa, amigo) têm ticket 2–3x maior. Perguntar sempre.",
  },
  focusMetrics: ["speed_to_lead", "pipeline_value", "ghost_rate", "top_models", "win_rate_vs_competitor"],
  followupContext: "Vendedor de iPhones seminovos e perfumes importados. Aceita iPhone usado como entrada. Parcela até 18x.",
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. RESTAURANTE / DELIVERY / FOOD
// ─────────────────────────────────────────────────────────────────────────────
const RESTAURANTE: SegmentConfig = {
  id: "restaurante",
  name: "Restaurante / Delivery",
  icon: "🍕",
  description: "Restaurantes, lanchonetes, delivery e food service",
  color: "#f97316",
  avgTicket: 85,
  avgCycleDays: 1,
  customerKeywords: ["pedido feito", "confirmado", "paguei", "comprovante", "obrigado pelo pedido", "chegou", "entregue", "recebi"],
  hotKeywords: ["quero pedir", "qual o endereço", "entrega", "quanto tempo", "mínimo", "taxa de entrega", "cardápio", "aceita cartão", "pix", "link do pedido"],
  warmKeywords: ["qual o horário", "vocês abrem", "têm opção", "tem delivery", "qual o preço", "quanto custa"],
  lostKeywords: ["não vou pedir", "achei mais barato", "ifood", "rappi", "muito caro", "não quero mais"],
  competitorKeywords: ["ifood", "rappi", "uber eats", "99food", "mais barato", "outro restaurante"],
  objectionMap: {
    price:     ["caro", "muito", "desconto", "promoção", "mais barato", "ifood cobra menos"],
    timing:    ["demora quanto", "muito tempo", "rápido", "urgente", "preciso agora"],
    authority: ["vou ver com minha família", "vou confirmar com o pessoal"],
    trust:     ["fresco", "confiável", "higiênico", "qualidade", "nota no google"],
    competitor:["ifood", "rappi", "uber eats", "outro lugar"],
  },
  buySignalMap: {
    "quero pedir": "Demonstrou intenção de pedido",
    "cardápio": "Pediu o cardápio",
    "entrega": "Perguntou sobre entrega",
    "pix": "Pediu chave Pix",
    "quanto tempo": "Verificou tempo de entrega",
    "endereço": "Confirmou endereço",
    "mínimo": "Verificou pedido mínimo",
    "aceita cartão": "Perguntou sobre pagamento",
  },
  insights: {
    ghostTip: "Leads que pedem o cardápio e somem — enviar 3 opções mais populares já com preço reduz fricção.",
    conversionTip: "Tempo de resposta é crítico no food. Responder em menos de 3 minutos aumenta conversão em 60%.",
    objectionTip: "Comparar com iFood: sem taxa de plataforma + entrega própria pode ser mais barato para o cliente.",
    followupTip: "Clientes recorrentes pedem de novo quando são lembrados. Programa de fidelidade via WhatsApp funciona.",
  },
  focusMetrics: ["speed_to_lead", "avg_ticket", "returning_customers", "peak_hours", "competitor_mentions"],
  followupContext: "Atendimento de restaurante/delivery. Foco em confirmar pedidos e fidelizar clientes.",
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. INTERCÂMBIO / EDUCAÇÃO
// ─────────────────────────────────────────────────────────────────────────────
const INTERCAMBIO: SegmentConfig = {
  id: "intercambio",
  name: "Intercâmbio / Educação",
  icon: "🌍",
  description: "Agências de intercâmbio, cursos, escolas e treinamentos",
  color: "#3b82f6",
  avgTicket: 15000,
  avgCycleDays: 30,
  customerKeywords: ["matriculei", "paguei", "contrato assinado", "inscrição confirmada", "aprovado", "visto aprovado", "passagem comprada"],
  hotKeywords: ["quando começa", "tem vaga", "qual o valor", "formas de pagamento", "bolsa", "desconto", "prazo", "documentos necessários", "qual o processo"],
  warmKeywords: ["gostaria de saber", "tenho interesse", "quero fazer intercâmbio", "estou pesquisando", "me manda informações"],
  lostKeywords: ["desisti", "não vou mais", "escolhi outra agência", "muito caro", "não consigo", "minha família não deixou"],
  competitorKeywords: ["outra agência", "ci", "yázigi", "wizard", "fisk", "kultivi", "mais barato em outro"],
  objectionMap: {
    price:     ["caro", "não tenho dinheiro", "financiamento", "parcelar", "bolsa", "desconto"],
    timing:    ["ano que vem", "depois", "ainda não é o momento", "preciso me preparar", "vou pensar"],
    authority: ["meus pais", "minha família", "meu marido", "vou ver com", "preciso confirmar"],
    trust:     ["idôneo", "confiável", "já foi alguém", "referência", "depoimento", "certificado"],
    competitor:["outra agência", "ci intercâmbio", "mais barato"],
  },
  buySignalMap: {
    "quando começa": "Perguntou sobre início",
    "tem vaga": "Verificou disponibilidade",
    "documentos": "Pediu lista de documentos",
    "financiamento": "Perguntou sobre financiamento",
    "passaporte": "Mencionou passaporte",
    "visto": "Perguntou sobre visto",
    "qual o valor": "Pediu cotação",
    "contrato": "Perguntou sobre contrato",
  },
  insights: {
    ghostTip: "Leads que somem após receber o preço geralmente precisam de aprovação familiar. Oferecer material para apresentar aos pais.",
    conversionTip: "Ciclo longo — criar sequência de follow-up de 30 dias com conteúdo educacional sobre o destino.",
    objectionTip: "Objeção de preço é a mais comum. Mostrar ROI do intercâmbio (salário maior, inglês fluente) ajuda a justificar.",
    followupTip: "Depoimentos de ex-alunos convertem muito nesse segmento. Enviar cases reais no follow-up.",
  },
  focusMetrics: ["avg_cycle", "authority_objections", "funnel_stages", "loss_rate", "rapport_score"],
  followupContext: "Consultora de intercâmbio e educação internacional. Ciclo de venda longo, decisão familiar.",
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. CLÍNICA / SAÚDE / ESTÉTICA
// ─────────────────────────────────────────────────────────────────────────────
const CLINICA: SegmentConfig = {
  id: "clinica",
  name: "Clínica / Saúde / Estética",
  icon: "💆",
  description: "Clínicas estéticas, odontológicas, psicologia, fisioterapia",
  color: "#14b8a6",
  avgTicket: 800,
  avgCycleDays: 5,
  customerKeywords: ["agendei", "confirmei", "já estou aqui", "obrigada pela consulta", "paguei", "adorei", "vou voltar"],
  hotKeywords: ["quero agendar", "tem horário", "qual o valor", "aceita plano", "convênio", "quanto custa", "como funciona o procedimento", "tem vaga"],
  warmKeywords: ["gostaria de saber", "tenho dúvida", "é indicado para", "funciona para", "quero informações"],
  lostKeywords: ["não vou mais", "achei em outro lugar", "muito caro", "não preciso", "desisti"],
  competitorKeywords: ["outra clínica", "outro profissional", "mais barato", "vi em outro lugar", "online"],
  objectionMap: {
    price:     ["caro", "parcelar", "desconto", "promoção", "plano", "convênio", "sem plano"],
    timing:    ["depois", "mês que vem", "quando tiver tempo", "estou ocupada"],
    authority: ["vou ver com meu marido", "vou confirmar com minha família"],
    trust:     ["é seguro", "tem resultado", "experiência", "avaliações", "antes e depois", "quanto tempo de mercado"],
    competitor:["outra clínica", "vi mais barato", "outro profissional"],
  },
  buySignalMap: {
    "agendar": "Pediu para agendar",
    "horário": "Perguntou horários",
    "convênio": "Perguntou sobre convênio",
    "como funciona": "Pediu detalhes do procedimento",
    "quanto custa": "Pediu o preço",
    "resultado": "Perguntou sobre resultados",
    "antes e depois": "Pediu fotos de resultado",
    "tem vaga": "Verificou disponibilidade",
  },
  insights: {
    ghostTip: "Leads que somem após ver o preço geralmente estão comparando. Enviar depoimentos e fotos de resultado faz diferença.",
    conversionTip: "Avaliação gratuita ou consulta inicial sem custo reduz a barreira de entrada e aumenta conversão.",
    objectionTip: "Objeção de confiança é a mais cara nesse segmento. Portfolio com antes/depois é o principal gatilho.",
    followupTip: "Pacientes que fizeram um procedimento têm 70% de chance de fazer outro. Reativar com novidade.",
  },
  focusMetrics: ["trust_objections", "returning_customers", "rapport_score", "speed_to_lead", "avg_ticket"],
  followupContext: "Recepcionista de clínica. Foco em agendamentos, esclarecimento de dúvidas e fidelização de pacientes.",
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. IMOBILIÁRIA / CORRETORES
// ─────────────────────────────────────────────────────────────────────────────
const IMOBILIARIA: SegmentConfig = {
  id: "imobiliaria",
  name: "Imobiliária / Corretores",
  icon: "🏠",
  description: "Venda e locação de imóveis, corretores autônomos",
  color: "#f59e0b",
  avgTicket: 350000,
  avgCycleDays: 90,
  customerKeywords: ["proposta aceita", "contrato assinado", "fechamos", "escritura", "financiamento aprovado", "chave na mão"],
  hotKeywords: ["quero visitar", "tem disponível", "qual o valor do condomínio", "aceita financiamento", "fgts", "quanto de entrada", "posso ver o imóvel", "quando posso visitar"],
  warmKeywords: ["gostaria de saber", "tenho interesse", "quero informações", "me manda fotos", "qual o tamanho"],
  lostKeywords: ["desisti", "comprei em outro", "não tenho perfil", "banco reprovou", "não tenho entrada"],
  competitorKeywords: ["outra imobiliária", "zap imóveis", "viva real", "olx", "encontrei em outro", "mais barato"],
  objectionMap: {
    price:     ["caro", "muito alto", "acima do orçamento", "desconto", "negociar"],
    timing:    ["ainda não é o momento", "preciso organizar as finanças", "ano que vem", "esperando aprovação"],
    authority: ["preciso mostrar para minha esposa", "vou ver com minha família", "depende do banco"],
    trust:     ["regularizado", "documentação", "sem pendências", "escritura", "habite-se"],
    competitor:["outra imobiliária", "zap imóveis", "direto com o dono"],
  },
  buySignalMap: {
    "visitar": "Pediu visita ao imóvel",
    "financiamento": "Perguntou sobre financiamento",
    "fgts": "Mencionou FGTS",
    "entrada": "Perguntou sobre entrada",
    "documentação": "Pediu documentação",
    "planta": "Pediu planta do imóvel",
    "condomínio": "Perguntou sobre condomínio",
    "escritura": "Mencionou escritura",
  },
  insights: {
    ghostTip: "Ciclo longo — leads que somem precisam de conteúdo regular sobre o imóvel. Enviar novidades e comparações de bairro.",
    conversionTip: "Visita presencial é o maior gatilho de fechamento. Priorizar agendamento de visita acima de tudo.",
    objectionTip: "Objeção de aprovação de crédito — ter parceria com correspondente bancário para simular na hora.",
    followupTip: "90% das decisões de imóvel levam mais de 60 dias. Sequência de follow-up longa é essencial.",
  },
  focusMetrics: ["avg_cycle", "funnel_stages", "authority_objections", "rapport_score", "pipeline_value"],
  followupContext: "Corretor de imóveis. Ciclo de venda muito longo, decisão familiar, dependência de financiamento.",
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. E-COMMERCE / MODA / VAREJO
// ─────────────────────────────────────────────────────────────────────────────
const ECOMMERCE: SegmentConfig = {
  id: "ecommerce",
  name: "E-commerce / Moda / Varejo",
  icon: "🛍️",
  description: "Lojas online, moda, acessórios e varejo em geral",
  color: "#ec4899",
  avgTicket: 280,
  avgCycleDays: 2,
  customerKeywords: ["paguei", "pedido confirmado", "comprovante", "já comprei", "obrigada pela compra", "rastreio", "chegou"],
  hotKeywords: ["tem disponível", "qual o tamanho", "prazo de entrega", "aceita pix", "link para comprar", "frete grátis", "parcelar", "cupom"],
  warmKeywords: ["quanto custa", "tem foto", "como é o tecido", "qual a medida", "tem em outra cor"],
  lostKeywords: ["não quero mais", "achei em outro lugar", "mercado livre", "shein", "muito caro"],
  competitorKeywords: ["shein", "shopee", "mercado livre", "amazon", "mais barato em outro", "aliexpress"],
  objectionMap: {
    price:     ["caro", "shopee", "shein", "desconto", "cupom", "mais barato"],
    timing:    ["mês que vem", "quando tiver promoção", "na black friday"],
    authority: ["vou mostrar para minha amiga", "vou ver com meu marido"],
    trust:     ["é original", "qualidade", "devolver se não gostar", "troca", "reembolso", "avaliações"],
    competitor:["shopee", "shein", "mercado livre", "amazon", "aliexpress"],
  },
  buySignalMap: {
    "pix": "Pediu chave Pix",
    "disponível": "Verificou disponibilidade",
    "tamanho": "Perguntou sobre tamanho",
    "entrega": "Perguntou sobre entrega",
    "parcelar": "Pediu parcelamento",
    "frete": "Perguntou sobre frete",
    "cupom": "Pediu cupom",
    "link": "Pediu link de compra",
  },
  insights: {
    ghostTip: "Abandono de carrinho é alto no varejo. Enviar lembrete após 2h de silêncio aumenta conversão.",
    conversionTip: "Foto de produto no contexto de uso (lifestyle) converte muito mais que foto em fundo branco.",
    objectionTip: "Shein e Shopee são os principais concorrentes. Destacar qualidade, troca fácil e atendimento humano.",
    followupTip: "Clientes que compraram uma vez têm 5x mais chance de comprar de novo. Reativar com novidade.",
  },
  focusMetrics: ["speed_to_lead", "ghost_rate", "competitor_mentions", "returning_customers", "avg_ticket"],
  followupContext: "Atendente de loja de moda/varejo. Foco em conversão rápida, disponibilidade de estoque e entrega.",
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. SERVIÇOS (ADVOCACIA, CONTABILIDADE, CONSULTORIA)
// ─────────────────────────────────────────────────────────────────────────────
const SERVICOS: SegmentConfig = {
  id: "servicos",
  name: "Serviços / B2B",
  icon: "💼",
  description: "Advocacia, contabilidade, consultoria, serviços B2B",
  color: "#6366f1",
  avgTicket: 3500,
  avgCycleDays: 20,
  customerKeywords: ["contratamos", "assinamos", "contrato assinado", "estamos de acordo", "envie a proposta", "aprovado", "pode iniciar"],
  hotKeywords: ["qual o valor", "como funciona", "o que está incluído", "prazo", "contrato", "proposta", "posso agendar uma reunião", "disponível para uma call"],
  warmKeywords: ["tenho interesse", "gostaria de entender melhor", "me manda mais informações", "como vocês trabalham"],
  lostKeywords: ["não preciso mais", "contratamos outro", "vamos fazer interno", "não é o momento"],
  competitorKeywords: ["outro escritório", "outro contador", "outra consultoria", "mais barato", "freelancer"],
  objectionMap: {
    price:     ["caro", "acima do orçamento", "freelancer mais barato", "desconto", "negociar"],
    timing:    ["depois", "ano que vem", "quando a empresa estabilizar", "não é agora"],
    authority: ["preciso aprovar com os sócios", "vou ver com o conselho", "diretor tem que aprovar"],
    trust:     ["experiência", "cases", "referências", "quanto tempo de mercado", "quem já atenderam"],
    competitor:["outro escritório", "freelancer", "mais barato em outro lugar"],
  },
  buySignalMap: {
    "proposta": "Pediu proposta formal",
    "reunião": "Quer reunião/call",
    "contrato": "Perguntou sobre contrato",
    "prazo": "Verificou prazos",
    "referência": "Pediu referências",
    "cnpj": "Forneceu dados da empresa",
    "call": "Pediu call/videochamada",
    "escopo": "Perguntou sobre escopo",
  },
  insights: {
    ghostTip: "Leads que somem após ver a proposta geralmente estão comparando. Follow-up com case de sucesso no dia seguinte.",
    conversionTip: "Reunião de diagnóstico gratuita aumenta muito a conversão — reduz o risco percebido pelo cliente.",
    objectionTip: "Objeção de aprovação interna é muito comum no B2B. Perguntar quem são os outros tomadores de decisão.",
    followupTip: "Ciclo B2B é longo — sequência de conteúdo educacional (artigos, cases) mantém o lead aquecido.",
  },
  focusMetrics: ["avg_cycle", "rapport_score", "authority_objections", "pipeline_value", "funnel_stages"],
  followupContext: "Consultor/vendedor B2B. Ciclo de venda médio-longo, múltiplos decisores, proposta formal necessária.",
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. ACADEMIA / FITNESS (BÔNUS)
// ─────────────────────────────────────────────────────────────────────────────
const ACADEMIA: SegmentConfig = {
  id: "academia",
  name: "Academia / Fitness",
  icon: "🏋️",
  description: "Academias, personal trainers, studios e nutrição",
  color: "#ef4444",
  avgTicket: 150,
  avgCycleDays: 3,
  customerKeywords: ["matriculei", "paguei", "confirmei", "comecei", "já estou treinando", "adorei"],
  hotKeywords: ["quero me matricular", "qual o plano", "tem aula experimental", "horário de funcionamento", "tem personal", "aceita cartão"],
  warmKeywords: ["quero saber mais", "qual o valor", "tem musculação", "tem estacionamento", "fica onde"],
  lostKeywords: ["desisti", "muito caro", "encontrei mais barato", "não vou mais", "cancelar"],
  competitorKeywords: ["smartfit", "bluefit", "another academia", "mais barato", "outra academia"],
  objectionMap: {
    price:     ["caro", "smartfit", "bluefit", "desconto", "promoção", "anual mais barato"],
    timing:    ["depois do carnaval", "quando emagrecer um pouco", "mês que vem", "depois das férias"],
    authority: ["vou ver com meu marido", "vou confirmar"],
    trust:     ["resultado", "antes e depois", "profissionais", "equipamentos", "higiene"],
    competitor:["smartfit", "bluefit", "outra academia"],
  },
  buySignalMap: {
    "matricular": "Quer se matricular",
    "plano": "Perguntou sobre planos",
    "experimental": "Pediu aula experimental",
    "horário": "Verificou horários",
    "personal": "Perguntou sobre personal",
    "desconto": "Pediu desconto",
    "anual": "Perguntou sobre plano anual",
    "aceita cartão": "Verificou forma de pagamento",
  },
  insights: {
    ghostTip: "Aula experimental gratuita é o maior conversor nesse segmento. Oferecer proativamente.",
    conversionTip: "Janeiro e início do semestre são picos de interesse. Ter resposta rápida nesses períodos é crucial.",
    objectionTip: "SmartFit é o principal concorrente de preço. Destacar diferenciais: professores, ambiente, resultados.",
    followupTip: "Alunos que param de frequentar ainda têm contrato — reativar com desafio ou novidade antes do cancelamento.",
  },
  focusMetrics: ["speed_to_lead", "competitor_mentions", "returning_customers", "peak_hours", "conversion_rate"],
  followupContext: "Atendente de academia. Foco em matrículas, planos e fidelização de alunos.",
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. CURSOS / INFOPRODUTOS (BÔNUS)
// ─────────────────────────────────────────────────────────────────────────────
const CURSOS: SegmentConfig = {
  id: "cursos",
  name: "Cursos / Infoprodutos",
  icon: "🎓",
  description: "Cursos online, mentorias, infoprodutos e treinamentos",
  color: "#8b5cf6",
  avgTicket: 1200,
  avgCycleDays: 7,
  customerKeywords: ["comprei", "paguei", "estou dentro", "acesso liberado", "adorando o curso", "já assisti"],
  hotKeywords: ["como acesso", "tem garantia", "quando abre", "posso parcelar", "tem certificado", "é ao vivo", "tem suporte", "turma nova"],
  warmKeywords: ["tenho interesse", "gostaria de saber mais", "é para iniciantes", "qual a carga horária", "tem mentoria"],
  lostKeywords: ["não quero mais", "achei no youtube", "muito caro", "desisti", "não é para mim"],
  competitorKeywords: ["hotmart", "udemy", "coursera", "youtube", "mais barato", "outro curso"],
  objectionMap: {
    price:     ["caro", "desconto", "cupom", "parcelar", "bolsa", "muito para mim"],
    timing:    ["quando abrir nova turma", "mês que vem", "não tenho tempo agora"],
    authority: ["vou ver com meu marido", "preciso pensar"],
    trust:     ["resultado", "depoimento", "garantia", "é confiável", "é bom mesmo"],
    competitor:["youtube", "udemy", "mais barato", "outro curso"],
  },
  buySignalMap: {
    "turma": "Perguntou sobre turma/acesso",
    "garantia": "Perguntou sobre garantia",
    "certificado": "Perguntou sobre certificado",
    "parcelar": "Pediu parcelamento",
    "mentoria": "Perguntou sobre mentoria",
    "suporte": "Perguntou sobre suporte",
    "ao vivo": "Perguntou sobre aulas ao vivo",
    "acesso": "Perguntou sobre acesso",
  },
  insights: {
    ghostTip: "Leads que pedem informações e somem — enviar depoimento de aluno com resultado parecido com o deles.",
    conversionTip: "Urgência real (vagas limitadas, desconto por tempo) é o principal gatilho de conversão em infoprodutos.",
    objectionTip: "Garantia de 7 dias elimina a objeção de confiança mais comum. Destacar proativamente.",
    followupTip: "Sequência de 5 e-mails/mensagens de follow-up com conteúdo gratuito antes de fazer a oferta.",
  },
  focusMetrics: ["speed_to_lead", "trust_objections", "funnel_stages", "ghost_rate", "rapport_score"],
  followupContext: "Especialista em cursos online e mentorias. Foco em mostrar resultados e superar objeção de confiança.",
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
export const SEGMENTS: SegmentConfig[] = [
  CELULARES, RESTAURANTE, INTERCAMBIO, CLINICA,
  IMOBILIARIA, ECOMMERCE, SERVICOS, ACADEMIA, CURSOS,
];

export const SEGMENT_MAP = Object.fromEntries(SEGMENTS.map(s => [s.id, s]));

export function getSegment(id: string): SegmentConfig {
  return SEGMENT_MAP[id] || CELULARES;
}

export const DEFAULT_SEGMENT_ID = "celulares";

export function isValidSegment(id: string | null | undefined): boolean {
  return !!id && id in SEGMENT_MAP;
}

// Mapeia o segmento do CRM (empresas.segmento) para o segmento do ZapIntel.
// É só o PADRÃO — o usuário pode sobrescrever (guardado em tracker_addons).
export const CRM_TO_ZAPINTEL: Record<string, string> = {
  varejo: "ecommerce",
  assistencia: "servicos",
  servicos: "servicos",
  imobiliaria: "imobiliaria",
  saude: "clinica",
  food: "restaurante",
  concessionaria: "ecommerce",
};
export function mapCrmSegmento(crm: string | null | undefined): string {
  return (crm && CRM_TO_ZAPINTEL[crm]) || DEFAULT_SEGMENT_ID;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexto dinâmico por segmento (evita textos fixos "Pedro"/"iPhone").
// roleLabel: como chamar o lado da loja nas telas/prompts.
// products:  vocabulário de produtos para detectar "produto de interesse".
// ─────────────────────────────────────────────────────────────────────────────
export const SEGMENT_ROLE: Record<string, string> = {
  celulares: "Vendedor", restaurante: "Atendente", intercambio: "Consultor",
  clinica: "Recepcionista", imobiliaria: "Corretor", ecommerce: "Atendente",
  servicos: "Consultor", academia: "Atendente", cursos: "Consultor",
};
export function getRole(id: string): string { return SEGMENT_ROLE[id] || "Vendedor"; }

export const SEGMENT_PRODUCTS: Record<string, string[]> = {
  celulares: [
    "iPhone 17 Pro Max", "iPhone 17 Pro", "iPhone 17", "iPhone 17 Plus",
    "iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16", "iPhone 16 Plus",
    "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15",
    "iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max",
    "iPhone 13", "iPhone 12", "iPhone 11",
    "Apple Watch", "iPad", "AirPods", "MacBook",
  ],
};
export function getProducts(id: string): string[] { return SEGMENT_PRODUCTS[id] || []; }

// Sugestões de cross-sell (pós-venda) por segmento. Só celulares tem mapa próprio;
// os demais caem no fallback genérico (indicação, sem produto específico).
export const SEGMENT_CROSSSELL: Record<string, Record<string, { product: string; reason: string; icon: string }[]>> = {
  celulares: {
    iphone: [
      { product: "Apple Watch", reason: "Integração perfeita — notificações, saúde e pagamentos no pulso.", icon: "⌚" },
      { product: "AirPods", reason: "Áudio sem fio com pareamento instantâneo.", icon: "🎧" },
      { product: "Capinha Premium", reason: "Proteção e estilo para o novo aparelho.", icon: "📱" },
    ],
    "apple watch": [
      { product: "iPhone", reason: "Watch funciona melhor integrado com iPhone. Upgrade natural.", icon: "📱" },
      { product: "Pulseira extra", reason: "Troca de estilo para cada ocasião.", icon: "⌚" },
    ],
    ipad: [
      { product: "Apple Pencil", reason: "Transforma o iPad em ferramenta criativa.", icon: "✏️" },
      { product: "iPhone", reason: "Ecossistema Apple completo.", icon: "📱" },
    ],
    airpods: [
      { product: "iPhone", reason: "AirPods com iPhone é a experiência mais fluida.", icon: "📱" },
      { product: "Apple Watch", reason: "Trio completo para máxima integração.", icon: "⌚" },
    ],
    default: [
      { product: "Apple Watch", reason: "Alta demanda e boa margem.", icon: "⌚" },
      { product: "AirPods", reason: "Acessório de giro rápido.", icon: "🎧" },
    ],
  },
};
export function getCrossSell(id: string): Record<string, { product: string; reason: string; icon: string }[]> | null {
  return SEGMENT_CROSSSELL[id] || null;
}

// Guia de exportação de conversas do Instagram (usado na tela de Importar).
export const INSTAGRAM_EXPORT_GUIDE: { method: string; time: string; steps: string[] }[] = [
  {
    method: "Baixar suas informações (recomendado)",
    time: "~5–15 min",
    steps: [
      "No Instagram, vá em Configurações → Central de Contas → Suas informações e permissões.",
      "Toque em \"Baixar suas informações\" e escolha a conta.",
      "Selecione apenas \"Mensagens\", formato JSON e intervalo de datas desejado.",
      "Confirme o pedido — o Instagram prepara o arquivo e envia por e-mail.",
      "Baixe o .zip, extraia e envie aqui o arquivo .json das mensagens.",
    ],
  },
  {
    method: "Exportação rápida por conversa",
    time: "~2 min",
    steps: [
      "Abra a conversa desejada no Instagram Direct.",
      "Copie o histórico visível ou exporte pela ferramenta do seu dispositivo.",
      "Cole/importe aqui como .csv ou .json.",
    ],
  },
];
