import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formatação de moeda BR
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

// Formatação de data
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return format(new Date(date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
}

export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return format(new Date(date), 'dd/MM/yyyy', { locale: ptBR })
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR })
}

// Iniciais para avatar
export function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

// Status do lead → label PT-BR
export const LEAD_STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  contato: 'Em contato',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  convertido: 'Convertido',
  perdido: 'Perdido',
}

// Cores por status do lead
export const LEAD_STATUS_COLORS: Record<string, string> = {
  novo: '#7FB0E8',
  contato: '#6E8BA8',
  proposta: '#C6A86A',
  negociacao: '#F4B740',
  convertido: '#34D399',
  perdido: '#6B7C92',
}

// Formas de pagamento
export const FORMAS_PAGAMENTO = [
  { value: 'pix', label: 'Pix' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'credito', label: 'Cartão de crédito' },
  { value: 'debito', label: 'Cartão de débito' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'fiado', label: 'Fiado' },
]

// Canais de venda
export const CANAIS_VENDA = [
  { value: 'loja_fisica', label: 'Loja física' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'indicacao', label: 'Indicação' },
]

// Truncar texto
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '…'
}
