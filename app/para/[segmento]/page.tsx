import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import Sections, { type PlanData } from '@/app/landing/Sections'

/** Conteúdo por segmento (páginas de SEO /para/*). */
const PARA: Record<string, { titulo: string; desc: string; eyebrow: string; h1: string; lede: string; bullets: string[] }> = {
  lojas: {
    titulo: 'CRM para lojas e varejo',
    desc: 'PDV, estoque, clientes e WhatsApp num sistema só. Venda com processo e controle total da sua loja.',
    eyebrow: 'Varejo · Lojas',
    h1: 'O CRM da sua loja: venda, estoque e WhatsApp num lugar só.',
    lede: 'PDV rápido, controle de estoque, cobrança por Pix e o funil de leads do WhatsApp — tudo integrado, feito para quem vende no balcão e online.',
    bullets: ['PDV com Pix e cartão', 'Estoque e catálogo sincronizados', 'Leads do WhatsApp e Instagram no funil'],
  },
  imobiliarias: {
    titulo: 'CRM para imobiliárias',
    desc: 'Imóveis, proprietários, visitas e captação sem planilha. Funil imobiliário e leads dos portais no mesmo lugar.',
    eyebrow: 'Imobiliária',
    h1: 'O CRM da sua imobiliária: imóveis, visitas e captação sem planilha.',
    lede: 'Cadastro de imóveis com fotos, agenda de visitas, match imóvel↔cliente e leads dos portais (ZAP, VivaReal, OLX) caindo direto no funil.',
    bullets: ['Imóveis e proprietários organizados', 'Agenda de visitas com lembrete', 'Leads dos portais e do site no funil'],
  },
  concessionarias: {
    titulo: 'CRM para concessionárias',
    desc: 'Test-drive, avaliação de usado, F&I e pátio. O funil de seminovos e novos no mesmo sistema.',
    eyebrow: 'Concessionária',
    h1: 'O CRM da sua concessionária: do test-drive ao F&I.',
    lede: 'Interesse de compra estruturado, avaliação de usado, ficha de financiamento e o pátio de veículos — o funil comercial que a revenda precisa.',
    bullets: ['Test-drive e avaliação de usado', 'Ficha de F&I e proposta', 'Pátio e leads da Webmotors/OLX'],
  },
  clinicas: {
    titulo: 'CRM para clínicas e consultórios',
    desc: 'Agenda cheia, confirmação D-1 automática e menos faltas. Jornada do paciente ponta a ponta.',
    eyebrow: 'Saúde · Clínica',
    h1: 'O CRM da sua clínica: agenda cheia e menos faltas.',
    lede: 'Agendamento, confirmação automática no WhatsApp um dia antes, lista de espera e retorno — a jornada do paciente organizada.',
    bullets: ['Agenda como tela inicial', 'Confirmação D-1 automática', 'Retornos e lista de espera'],
  },
  restaurantes: {
    titulo: 'CRM para restaurantes e delivery',
    desc: 'Cardápio digital com QR, pedidos por WhatsApp e comandas. O fluxo de pedidos em tempo real.',
    eyebrow: 'Food · Restaurante',
    h1: 'O CRM do seu restaurante: cardápio, comandas e delivery.',
    lede: 'Cardápio digital com QR code, pedidos pelo WhatsApp, comandas por mesa e o fluxo de pedidos da cozinha à entrega.',
    bullets: ['Cardápio digital com QR', 'Pedidos via WhatsApp', 'Comandas por mesa'],
  },
  servicos: {
    titulo: 'CRM para serviços e assistência técnica',
    desc: 'Ordens de serviço, orçamentos com aprovação por link e garantias. A esteira da OS ponta a ponta.',
    eyebrow: 'Serviços & OS',
    h1: 'O CRM de serviços: ordens, orçamentos e garantias.',
    lede: 'Abra ordens de serviço, envie orçamento com aprovação por link no WhatsApp, avise "pronto para retirada" e controle garantias.',
    bullets: ['Ordens de serviço na esteira', 'Orçamento aprovado por link', 'Aviso de retirada e garantias'],
  },
}

export function generateStaticParams() {
  return Object.keys(PARA).map((segmento) => ({ segmento }))
}

export async function generateMetadata({ params }: { params: Promise<{ segmento: string }> }): Promise<Metadata> {
  const { segmento } = await params
  const p = PARA[segmento]
  if (!p) return { title: 'Nexus' }
  return { title: p.titulo, description: p.desc }
}

async function getPlans(): Promise<PlanData[]> {
  try {
    const svc = createServiceClient()
    const { data } = await svc
      .from('planos_config')
      .select('id, nome, descricao, preco_centavos, features, destaque, ordem')
      .eq('ativo', true).gt('preco_centavos', 0).order('ordem')
    return (data ?? []).map((p) => ({
      id: p.id, name: p.nome, priceCents: p.preco_centavos, tagline: p.descricao ?? '',
      features: Array.isArray(p.features) ? (p.features as string[]) : [], featured: !!p.destaque,
    }))
  } catch { return [] }
}

export default async function ParaSegmentoPage({ params }: { params: Promise<{ segmento: string }> }) {
  const { segmento } = await params
  const p = PARA[segmento]
  if (!p) notFound()
  const plans = await getPlans()

  return (
    <div className="min-h-screen bg-bg text-ink">
      <nav className="sticky top-0 z-50 border-b border-line-soft bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-[60px] max-w-[1080px] items-center gap-4 px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/nexus-logo.png" alt="Nexus" width={503} height={431} className="h-8 w-auto" priority />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/login" className="text-[13.5px] font-medium text-ink-2 hover:text-ink">Entrar</Link>
            <Link href="/register" className="rounded-control bg-ink px-4 py-2 text-[13.5px] font-semibold text-white transition-colors hover:bg-ink/90">Testar grátis</Link>
          </div>
        </div>
      </nav>

      <header className="mx-auto max-w-[1080px] px-6 pb-8 pt-[72px]">
        <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-3">{p.eyebrow}</div>
        <h1 className="mt-4 max-w-[760px] text-[clamp(32px,5vw,52px)] font-bold leading-[1.05] tracking-[-0.04em]">{p.h1}</h1>
        <p className="mt-4 max-w-[560px] text-[17px] leading-relaxed text-ink-2">{p.lede}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href="/register" className="rounded-[9px] bg-ink px-6 py-3 text-[14.5px] font-semibold text-white transition-colors hover:bg-ink/90">Começar grátis por 14 dias</Link>
          <Link href="/" className="rounded-[9px] border border-line bg-card px-6 py-3 text-[14.5px] font-semibold text-ink transition-colors hover:border-ink/20">Ver o produto</Link>
        </div>
        <ul className="mt-8 grid max-w-[720px] gap-2 sm:grid-cols-3">
          {p.bullets.map((b) => (
            <li key={b} className="rounded-card border border-line bg-card px-3.5 py-3 text-[13px] font-medium text-ink">{b}</li>
          ))}
        </ul>
      </header>

      <Sections plans={plans} />
    </div>
  )
}
