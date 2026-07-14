/**
 * Modelos Apple recentes com cores e armazenamentos oficiais (pt-BR).
 * Usado para pré-preencher o cadastro de Produto — o lojista escolhe o modelo
 * e as cores/armazenamentos vêm prontos (editáveis). Foco no iPhone (núcleo do
 * negócio); dá pra ampliar para iPad/Mac/Watch adicionando entradas aqui.
 */
export interface AppleModelo { nome: string; linha: 'iPhone' | 'iPad' | 'Mac' | 'Watch'; cores: string[]; armazenamentos: string[] }

export const APPLE_MODELOS: AppleModelo[] = [
  // iPhone 16
  { nome: 'iPhone 16 Pro Max', linha: 'iPhone', cores: ['Titânio-deserto', 'Titânio Natural', 'Titânio Branco', 'Titânio Preto'], armazenamentos: ['256GB', '512GB', '1TB'] },
  { nome: 'iPhone 16 Pro', linha: 'iPhone', cores: ['Titânio-deserto', 'Titânio Natural', 'Titânio Branco', 'Titânio Preto'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  { nome: 'iPhone 16 Plus', linha: 'iPhone', cores: ['Ultramarino', 'Verde-acinzentado', 'Rosa', 'Branco', 'Preto'], armazenamentos: ['128GB', '256GB', '512GB'] },
  { nome: 'iPhone 16', linha: 'iPhone', cores: ['Ultramarino', 'Verde-acinzentado', 'Rosa', 'Branco', 'Preto'], armazenamentos: ['128GB', '256GB', '512GB'] },
  // iPhone 15
  { nome: 'iPhone 15 Pro Max', linha: 'iPhone', cores: ['Titânio Natural', 'Titânio Azul', 'Titânio Branco', 'Titânio Preto'], armazenamentos: ['256GB', '512GB', '1TB'] },
  { nome: 'iPhone 15 Pro', linha: 'iPhone', cores: ['Titânio Natural', 'Titânio Azul', 'Titânio Branco', 'Titânio Preto'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  { nome: 'iPhone 15 Plus', linha: 'iPhone', cores: ['Rosa', 'Amarelo', 'Verde', 'Azul', 'Preto'], armazenamentos: ['128GB', '256GB', '512GB'] },
  { nome: 'iPhone 15', linha: 'iPhone', cores: ['Rosa', 'Amarelo', 'Verde', 'Azul', 'Preto'], armazenamentos: ['128GB', '256GB', '512GB'] },
  // iPhone 14
  { nome: 'iPhone 14 Pro Max', linha: 'iPhone', cores: ['Roxo-profundo', 'Dourado', 'Prateado', 'Preto-espacial'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  { nome: 'iPhone 14 Pro', linha: 'iPhone', cores: ['Roxo-profundo', 'Dourado', 'Prateado', 'Preto-espacial'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  { nome: 'iPhone 14 Plus', linha: 'iPhone', cores: ['Azul', 'Roxo', 'Meia-noite', 'Estelar', 'PRODUCT(RED)', 'Amarelo'], armazenamentos: ['128GB', '256GB', '512GB'] },
  { nome: 'iPhone 14', linha: 'iPhone', cores: ['Azul', 'Roxo', 'Meia-noite', 'Estelar', 'PRODUCT(RED)', 'Amarelo'], armazenamentos: ['128GB', '256GB', '512GB'] },
  // iPhone 13
  { nome: 'iPhone 13 Pro Max', linha: 'iPhone', cores: ['Grafite', 'Dourado', 'Prateado', 'Azul-Sierra', 'Verde-alpino'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  { nome: 'iPhone 13 Pro', linha: 'iPhone', cores: ['Grafite', 'Dourado', 'Prateado', 'Azul-Sierra', 'Verde-alpino'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  { nome: 'iPhone 13', linha: 'iPhone', cores: ['Rosa', 'Azul', 'Meia-noite', 'Estelar', 'PRODUCT(RED)', 'Verde'], armazenamentos: ['128GB', '256GB', '512GB'] },
  { nome: 'iPhone 13 mini', linha: 'iPhone', cores: ['Rosa', 'Azul', 'Meia-noite', 'Estelar', 'PRODUCT(RED)', 'Verde'], armazenamentos: ['128GB', '256GB', '512GB'] },
  { nome: 'iPhone SE (3ª geração)', linha: 'iPhone', cores: ['Meia-noite', 'Estelar', 'PRODUCT(RED)'], armazenamentos: ['64GB', '128GB', '256GB'] },
  // iPad (exemplos — ampliar conforme necessário)
  { nome: 'iPad Pro 13" (M4)', linha: 'iPad', cores: ['Prateado', 'Preto-espacial'], armazenamentos: ['256GB', '512GB', '1TB', '2TB'] },
  { nome: 'iPad Air 13" (M2)', linha: 'iPad', cores: ['Cinza-espacial', 'Estelar', 'Roxo', 'Azul'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  // Mac (exemplos)
  { nome: 'MacBook Air 13" (M3)', linha: 'Mac', cores: ['Meia-noite', 'Estelar', 'Cinza-espacial', 'Prateado'], armazenamentos: ['256GB', '512GB', '1TB', '2TB'] },
  { nome: 'MacBook Pro 14" (M4)', linha: 'Mac', cores: ['Preto-espacial', 'Prateado'], armazenamentos: ['512GB', '1TB', '2TB'] },
  // Watch (cores = caixa; "armazenamento" usado como tamanho)
  { nome: 'Apple Watch Series 10', linha: 'Watch', cores: ['Alumínio Preto-jato', 'Alumínio Rosé', 'Alumínio Prateado', 'Titânio Ardósia', 'Titânio Ouro', 'Titânio Natural'], armazenamentos: ['42mm', '46mm'] },
  { nome: 'Apple Watch Ultra 2', linha: 'Watch', cores: ['Titânio Natural', 'Titânio Preto'], armazenamentos: ['49mm'] },
]
