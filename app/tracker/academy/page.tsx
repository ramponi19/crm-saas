import { GraduationCap, Search, PlayCircle, ChevronRight, Rocket, Link2, Users, Radio, Megaphone, CalendarDays, GitBranch, MessagesSquare, Zap, Bot, Settings } from 'lucide-react'

export const metadata = { title: 'Academy · Tracker Ads' }

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884', tealDark: '#007e5f' }

const TRILHA = [
  { n: 1, t: 'Boas-vindas', d: '~1 min' },
  { n: 2, t: 'Dúvidas sobre WhatsApp', d: '~3–4 min' },
  { n: 3, t: 'Conectando canais', d: '~7 min' },
  { n: 4, t: 'Conectando conta de anúncios', d: '~6–7 min' },
  { n: 5, t: 'Tour completo da plataforma', d: '~9 min' },
]
const CATEGORIAS = [
  { icon: Rocket, nome: 'Primeiros passos', desc: 'Login, workspace e visão geral da plataforma.', n: 3 },
  { icon: Link2, nome: 'Vínculos Canal → Setor → CRM', desc: 'Como conversas, setores e funis se conectam.', n: 1 },
  { icon: Users, nome: 'Equipes e acessos', desc: 'Convites, vínculo com setor e níveis de permissão.', n: 2 },
  { icon: Radio, nome: 'Canais', desc: 'WhatsApp Business e API oficial da Meta.', n: 1 },
  { icon: Megaphone, nome: 'Contas de anúncio', desc: 'Meta Ads, página, ad account e Google Ads.', n: 2 },
  { icon: CalendarDays, nome: 'Google Calendar', desc: 'Conectar agenda, compromissos e RSVP.', n: 1 },
  { icon: GitBranch, nome: 'CRM e funil', desc: 'Pipelines, estágios, negócios e observações.', n: 2 },
  { icon: MessagesSquare, nome: 'Inbox', desc: 'Atendimento, detalhes, qualificação e CRM na conversa.', n: 2 },
  { icon: Zap, nome: 'Automações e disparos', desc: 'Fluxos automáticos e campanhas em escala.', n: 2 },
  { icon: Bot, nome: 'Agentes IA', desc: 'Agentes, base de conhecimento e vínculos.', n: 1 },
  { icon: Settings, nome: 'Configurações', desc: 'Empresa, faturamento e preferências.', n: 1 },
]
const ARTIGOS: { cat: string; itens: { t: string; d: string; min: number }[] }[] = [
  { cat: 'Primeiros passos', itens: [
    { t: 'Como começar', d: 'Trilha em 5 vídeos: boas-vindas, WhatsApp, canais, anúncios e tour da plataforma.', min: 28 },
    { t: 'Visão geral da plataforma', d: 'O que é cada área do menu: Dashboard, Conversas, CRM, Rastreamento e Configurações.', min: 5 },
    { t: 'Como usar no celular (mobile)', d: 'Atenda e gerencie leads pelo app no celular — sem abrir o WhatsApp.', min: 3 },
  ] },
  { cat: 'CRM e funil', itens: [
    { t: 'CRM: pipelines, estágios e negócios', d: 'Montar o funil, mover cards e fechar ganho/perda.', min: 7 },
    { t: 'Exportar contatos em CSV', d: 'Filtrar e baixar contatos — formato CRM ou pronto para públicos de anúncio.', min: 6 },
  ] },
  { cat: 'Inbox', itens: [
    { t: 'Inbox: visão geral do atendimento', d: 'Lista de conversas, filtros por setor, status, mídia e respostas rápidas.', min: 7 },
    { t: 'Inbox: painel de detalhes', d: 'Qualificado, estágio do CRM, valor do negócio, timeline e transferência.', min: 9 },
  ] },
  { cat: 'Automações e disparos', itens: [
    { t: 'Automações: primeiros fluxos', d: 'Galeria de templates, gatilhos e vínculo com setor/pipeline.', min: 6 },
    { t: 'Disparos em escala', d: 'Campanhas de mensagens com limites e saúde do canal.', min: 5 },
  ] },
  { cat: 'Agentes IA', itens: [
    { t: 'Agentes de IA e base de conhecimento', d: 'Tipos de agente, vínculos e documentos da base.', min: 7 },
  ] },
]

export default function AcademyPage() {
  return (
    <div className="px-5 py-5 sm:px-7">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.02em]" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}><GraduationCap size={22} strokeWidth={1.9} style={{ color: C.teal }} /> Academy</h1>
          <p className="text-[13px]" style={{ color: C.ink3 }}>Tutoriais passo a passo, FAQ e documentos — com links públicos para enviar ao cliente.</p>
        </div>
        <div className="flex items-center gap-2 rounded-[10px] border px-3 py-2" style={{ borderColor: C.line, background: C.card }}><Search size={15} style={{ color: C.ink3 }} /><input placeholder="Buscar artigo…" className="w-40 bg-transparent text-[13px] outline-none" style={{ color: C.ink }} /></div>
      </header>

      {/* Trilha de onboarding */}
      <section className="mb-6 overflow-hidden rounded-[16px] border" style={{ borderColor: '#cfe8df', background: 'linear-gradient(135deg,#f6faf8,#eef7f3)' }}>
        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.tealDark }}>Trilha de onboarding</span>
            <h2 className="mt-1 text-[19px] font-bold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Como começar</h2>
            <p className="mt-1 text-[13px]" style={{ color: C.ink2 }}>Trilha em 5 vídeos: boas-vindas, WhatsApp, canais, anúncios e tour completo. Assista na ordem — cerca de <strong>28 minutos</strong> no total.</p>
            <button className="mt-3 inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white" style={{ background: C.teal }}><PlayCircle size={16} /> Começar a trilha</button>
          </div>
          <div className="space-y-1.5">
            {TRILHA.map((s) => (
              <div key={s.n} className="flex items-center gap-3 rounded-[10px] border bg-white px-3 py-2" style={{ borderColor: C.line }}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: C.teal }}>{s.n}</span>
                <span className="flex-1 truncate text-[13px] font-medium" style={{ color: C.ink }}>{s.t}</span>
                <span className="text-[11.5px]" style={{ color: C.ink3 }}>{s.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categorias */}
      <h2 className="mb-3 text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Categorias</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIAS.map((c) => (
          <div key={c.nome} className="flex items-start gap-3 rounded-[14px] border p-4 transition-shadow hover:shadow-sm" style={{ borderColor: C.line, background: C.card }}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px]" style={{ background: 'rgba(0,168,132,0.10)', color: C.teal }}><c.icon size={18} strokeWidth={1.8} /></span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold" style={{ color: C.ink }}>{c.nome}</div>
              <div className="text-[12px]" style={{ color: C.ink3 }}>{c.desc}</div>
              <div className="mt-1 text-[11px] font-medium" style={{ color: C.tealDark }}>{c.n} {c.n === 1 ? 'artigo' : 'artigos'}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Todos os artigos */}
      <h2 className="mb-3 text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Todos os artigos</h2>
      <div className="space-y-6">
        {ARTIGOS.map((g) => (
          <div key={g.cat}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.ink3 }}>{g.cat}</h3>
            <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: C.line, background: C.card }}>
              {g.itens.map((a, i) => (
                <div key={a.t} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? `1px solid ${C.line}` : 'none' }}>
                  <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-semibold" style={{ color: C.ink }}>{a.t}</div><div className="truncate text-[12px]" style={{ color: C.ink3 }}>{a.d}</div></div>
                  <span className="shrink-0 text-[11.5px]" style={{ color: C.ink3 }}>{a.min} min</span>
                  <ChevronRight size={16} style={{ color: C.ink3 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
