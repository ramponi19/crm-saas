/**
 * Modelos Apple com cores e armazenamentos oficiais (pt-BR, fonte: Apple).
 * Usado para pré-preencher o cadastro de Produto na JM Store — o lojista
 * escolhe o modelo e as cores/armazenamentos vêm prontos (editáveis).
 * iPhone: linha completa do 17 até o 6. Ampliar = adicionar entradas aqui.
 */
export interface AppleModelo { nome: string; linha: 'iPhone' | 'iPad' | 'Mac' | 'Watch'; cores: string[]; armazenamentos: string[] }

export const APPLE_MODELOS: AppleModelo[] = [
  // ── iPhone 17 / Air / 17e ──
  { nome: 'iPhone 17 Pro Max', linha: 'iPhone', cores: ['Prateado', 'Laranja-cósmico', 'Azul-intenso'], armazenamentos: ['256GB', '512GB', '1TB', '2TB'] },
  { nome: 'iPhone 17 Pro', linha: 'iPhone', cores: ['Prateado', 'Laranja-cósmico', 'Azul-intenso'], armazenamentos: ['256GB', '512GB', '1TB'] },
  { nome: 'iPhone 17', linha: 'iPhone', cores: ['Preto', 'Branco', 'Azul-névoa', 'Sálvia', 'Lavanda'], armazenamentos: ['256GB', '512GB'] },
  { nome: 'iPhone Air', linha: 'iPhone', cores: ['Preto-espacial', 'Branco-nuvem', 'Dourado-claro', 'Azul-céu'], armazenamentos: ['256GB', '512GB', '1TB'] },
  { nome: 'iPhone 17e', linha: 'iPhone', cores: ['Preto', 'Branco', 'Rosa-pálido'], armazenamentos: ['256GB', '512GB'] },
  // ── iPhone 16 / 16e ──
  { nome: 'iPhone 16 Pro Max', linha: 'iPhone', cores: ['Titânio Preto', 'Titânio Branco', 'Titânio Natural', 'Titânio-deserto'], armazenamentos: ['256GB', '512GB', '1TB'] },
  { nome: 'iPhone 16 Pro', linha: 'iPhone', cores: ['Titânio Preto', 'Titânio Branco', 'Titânio Natural', 'Titânio-deserto'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  { nome: 'iPhone 16 Plus', linha: 'iPhone', cores: ['Preto', 'Branco', 'Rosa', 'Verde-acinzentado', 'Ultramarino'], armazenamentos: ['128GB', '256GB', '512GB'] },
  { nome: 'iPhone 16', linha: 'iPhone', cores: ['Preto', 'Branco', 'Rosa', 'Verde-acinzentado', 'Ultramarino'], armazenamentos: ['128GB', '256GB', '512GB'] },
  { nome: 'iPhone 16e', linha: 'iPhone', cores: ['Preto', 'Branco'], armazenamentos: ['128GB', '256GB', '512GB'] },
  // ── iPhone 15 ──
  { nome: 'iPhone 15 Pro Max', linha: 'iPhone', cores: ['Titânio Preto', 'Titânio Branco', 'Titânio Azul', 'Titânio Natural'], armazenamentos: ['256GB', '512GB', '1TB'] },
  { nome: 'iPhone 15 Pro', linha: 'iPhone', cores: ['Titânio Preto', 'Titânio Branco', 'Titânio Azul', 'Titânio Natural'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  { nome: 'iPhone 15 Plus', linha: 'iPhone', cores: ['Preto', 'Azul', 'Verde', 'Amarelo', 'Rosa'], armazenamentos: ['128GB', '256GB', '512GB'] },
  { nome: 'iPhone 15', linha: 'iPhone', cores: ['Preto', 'Azul', 'Verde', 'Amarelo', 'Rosa'], armazenamentos: ['128GB', '256GB', '512GB'] },
  // ── iPhone 14 ──
  { nome: 'iPhone 14 Pro Max', linha: 'iPhone', cores: ['Prateado', 'Dourado', 'Preto-espacial', 'Roxo-profundo'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  { nome: 'iPhone 14 Pro', linha: 'iPhone', cores: ['Prateado', 'Dourado', 'Preto-espacial', 'Roxo-profundo'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  { nome: 'iPhone 14 Plus', linha: 'iPhone', cores: ['Meia-noite', 'Estelar', '(PRODUCT)RED', 'Azul', 'Roxo', 'Amarelo'], armazenamentos: ['128GB', '256GB', '512GB'] },
  { nome: 'iPhone 14', linha: 'iPhone', cores: ['Meia-noite', 'Estelar', '(PRODUCT)RED', 'Azul', 'Roxo', 'Amarelo'], armazenamentos: ['128GB', '256GB', '512GB'] },
  // ── iPhone SE 3 ──
  { nome: 'iPhone SE (3ª geração)', linha: 'iPhone', cores: ['(PRODUCT)RED', 'Estelar', 'Meia-noite'], armazenamentos: ['64GB', '128GB', '256GB'] },
  // ── iPhone 13 ──
  { nome: 'iPhone 13 Pro Max', linha: 'iPhone', cores: ['Grafite', 'Dourado', 'Prateado', 'Azul-Sierra', 'Verde-alpino'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  { nome: 'iPhone 13 Pro', linha: 'iPhone', cores: ['Grafite', 'Dourado', 'Prateado', 'Azul-Sierra', 'Verde-alpino'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  { nome: 'iPhone 13', linha: 'iPhone', cores: ['(PRODUCT)RED', 'Estelar', 'Meia-noite', 'Azul', 'Rosa', 'Verde'], armazenamentos: ['128GB', '256GB', '512GB'] },
  { nome: 'iPhone 13 mini', linha: 'iPhone', cores: ['(PRODUCT)RED', 'Estelar', 'Meia-noite', 'Azul', 'Rosa', 'Verde'], armazenamentos: ['128GB', '256GB', '512GB'] },
  // ── iPhone 12 ──
  { nome: 'iPhone 12 Pro Max', linha: 'iPhone', cores: ['Prateado', 'Grafite', 'Dourado', 'Azul-Pacífico'], armazenamentos: ['128GB', '256GB', '512GB'] },
  { nome: 'iPhone 12 Pro', linha: 'iPhone', cores: ['Prateado', 'Grafite', 'Dourado', 'Azul-Pacífico'], armazenamentos: ['128GB', '256GB', '512GB'] },
  { nome: 'iPhone 12', linha: 'iPhone', cores: ['Preto', 'Branco', '(PRODUCT)RED', 'Verde', 'Azul', 'Roxo'], armazenamentos: ['64GB', '128GB', '256GB'] },
  { nome: 'iPhone 12 mini', linha: 'iPhone', cores: ['Preto', 'Branco', '(PRODUCT)RED', 'Verde', 'Azul', 'Roxo'], armazenamentos: ['64GB', '128GB', '256GB'] },
  // ── iPhone SE 2 ──
  { nome: 'iPhone SE (2ª geração)', linha: 'iPhone', cores: ['Branco', 'Preto', '(PRODUCT)RED'], armazenamentos: ['64GB', '128GB', '256GB'] },
  // ── iPhone 11 ──
  { nome: 'iPhone 11 Pro Max', linha: 'iPhone', cores: ['Prateado', 'Cinza-espacial', 'Dourado', 'Verde meia-noite'], armazenamentos: ['64GB', '256GB', '512GB'] },
  { nome: 'iPhone 11 Pro', linha: 'iPhone', cores: ['Prateado', 'Cinza-espacial', 'Dourado', 'Verde meia-noite'], armazenamentos: ['64GB', '256GB', '512GB'] },
  { nome: 'iPhone 11', linha: 'iPhone', cores: ['Roxo', 'Verde', 'Amarelo', 'Preto', 'Branco', '(PRODUCT)RED'], armazenamentos: ['64GB', '128GB', '256GB'] },
  // ── iPhone X ──
  { nome: 'iPhone XS Max', linha: 'iPhone', cores: ['Prateado', 'Cinza-espacial', 'Dourado'], armazenamentos: ['64GB', '256GB', '512GB'] },
  { nome: 'iPhone XS', linha: 'iPhone', cores: ['Prateado', 'Cinza-espacial', 'Dourado'], armazenamentos: ['64GB', '256GB', '512GB'] },
  { nome: 'iPhone XR', linha: 'iPhone', cores: ['Preto', 'Branco', 'Azul', 'Amarelo', 'Coral', '(PRODUCT)RED'], armazenamentos: ['64GB', '128GB', '256GB'] },
  { nome: 'iPhone X', linha: 'iPhone', cores: ['Prateado', 'Cinza-espacial'], armazenamentos: ['64GB', '256GB'] },
  // ── iPhone 8 ──
  { nome: 'iPhone 8 Plus', linha: 'iPhone', cores: ['Dourado', 'Prateado', 'Cinza-espacial', '(PRODUCT)RED'], armazenamentos: ['64GB', '128GB', '256GB'] },
  { nome: 'iPhone 8', linha: 'iPhone', cores: ['Dourado', 'Prateado', 'Cinza-espacial', '(PRODUCT)RED'], armazenamentos: ['64GB', '128GB', '256GB'] },
  // ── iPhone 7 ──
  { nome: 'iPhone 7 Plus', linha: 'iPhone', cores: ['Preto matte', 'Preto brilhante', 'Dourado', 'Ouro rosa', 'Prateado', '(PRODUCT)RED'], armazenamentos: ['32GB', '128GB', '256GB'] },
  { nome: 'iPhone 7', linha: 'iPhone', cores: ['Preto matte', 'Preto brilhante', 'Dourado', 'Ouro rosa', 'Prateado', '(PRODUCT)RED'], armazenamentos: ['32GB', '128GB', '256GB'] },
  // ── iPhone SE 1 / 6s / 6 ──
  { nome: 'iPhone SE (1ª geração)', linha: 'iPhone', cores: ['Cinza-espacial', 'Prateado', 'Dourado', 'Ouro rosa'], armazenamentos: ['16GB', '32GB', '64GB', '128GB'] },
  { nome: 'iPhone 6s Plus', linha: 'iPhone', cores: ['Cinza-espacial', 'Prateado', 'Dourado', 'Ouro rosa'], armazenamentos: ['16GB', '32GB', '64GB', '128GB'] },
  { nome: 'iPhone 6s', linha: 'iPhone', cores: ['Cinza-espacial', 'Prateado', 'Dourado', 'Ouro rosa'], armazenamentos: ['16GB', '32GB', '64GB', '128GB'] },
  { nome: 'iPhone 6 Plus', linha: 'iPhone', cores: ['Cinza-espacial', 'Prateado', 'Dourado'], armazenamentos: ['16GB', '64GB', '128GB'] },
  { nome: 'iPhone 6', linha: 'iPhone', cores: ['Cinza-espacial', 'Prateado', 'Dourado'], armazenamentos: ['16GB', '32GB', '64GB', '128GB'] },
  // ── iPad (exemplos) ──
  { nome: 'iPad Pro 13" (M4)', linha: 'iPad', cores: ['Prateado', 'Preto-espacial'], armazenamentos: ['256GB', '512GB', '1TB', '2TB'] },
  { nome: 'iPad Air 13" (M2)', linha: 'iPad', cores: ['Cinza-espacial', 'Estelar', 'Roxo', 'Azul'], armazenamentos: ['128GB', '256GB', '512GB', '1TB'] },
  // ── Mac (exemplos) ──
  { nome: 'MacBook Air 13" (M3)', linha: 'Mac', cores: ['Meia-noite', 'Estelar', 'Cinza-espacial', 'Prateado'], armazenamentos: ['256GB', '512GB', '1TB', '2TB'] },
  { nome: 'MacBook Pro 14" (M4)', linha: 'Mac', cores: ['Preto-espacial', 'Prateado'], armazenamentos: ['512GB', '1TB', '2TB'] },
  // ── Watch (cores = caixa; "armazenamento" = tamanho) ──
  { nome: 'Apple Watch Series 10', linha: 'Watch', cores: ['Alumínio Preto-jato', 'Alumínio Rosé', 'Alumínio Prateado', 'Titânio Ardósia', 'Titânio Ouro', 'Titânio Natural'], armazenamentos: ['42mm', '46mm'] },
  { nome: 'Apple Watch Ultra 2', linha: 'Watch', cores: ['Titânio Natural', 'Titânio Preto'], armazenamentos: ['49mm'] },
]
