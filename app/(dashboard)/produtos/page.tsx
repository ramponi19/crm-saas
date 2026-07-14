import { redirect } from 'next/navigation'

// Produtos foi unificado no módulo /catalogo (rotulado "Produtos" no menu).
// Estoque segue apartado em /estoque.
export default function ProdutosPage() {
  redirect('/catalogo')
}
