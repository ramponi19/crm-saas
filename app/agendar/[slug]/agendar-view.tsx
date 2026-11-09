'use client'

import { useState, useMemo } from 'react'
import { diaDaSemana, formatarHora, formatarNoFuso, rotuloDoMes } from '@/lib/datas'
import { chavesOcupadas, diasDeAgenda, horariosDoDia, type HorarioAgenda } from '@/lib/agendar-slots'

/** O tipo de sempre, agora em lib/agendar-slots (a API usa a mesma regra). */
export type Horario = HorarioAgenda

const DIA_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/**
 * Tudo no FUSO DA EMPRESA e no "agora" do servidor (`agoraMs`): servidor e navegador
 * calculam os mesmos dias, os mesmos horários e os mesmos passados — sem #418 e sem
 * horário livre aparecendo bloqueado (ou ocupado aparecendo livre).
 */
export function AgendarView({ slug, nome, cor, logo, horario, ocupadas, fuso, agoraMs }: {
  slug: string; nome: string; cor: string; logo: string | null; horario: Horario; ocupadas: string[]; fuso: string; agoraMs: number
}) {
  const dias = useMemo(() => diasDeAgenda(horario, agoraMs, fuso), [horario, agoraMs, fuso])
  const [diaIdx, setDiaIdx] = useState(0)
  const [slotIso, setSlotIso] = useState('')
  const [nomePac, setNomePac] = useState('')
  const [tel, setTel] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState(false)

  // Pelo INSTANTE (ms), não pelo texto: o banco devolve `…+00:00`, o navegador `….000Z`.
  const ocupadasSet = useMemo(() => chavesOcupadas(ocupadas), [ocupadas])
  const slots = useMemo(() => (dias[diaIdx] ? horariosDoDia(dias[diaIdx], horario, fuso) : []), [dias, diaIdx, horario, fuso])


  async function confirmar() {
    if (!slotIso || !nomePac.trim()) return
    setEnviando(true)
    const r = await fetch(`/api/agendar/${slug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nomePac, telefone: tel, data_hora: slotIso }),
    })
    setEnviando(false)
    if (r.ok) setPronto(true)
    else { const j = await r.json().catch(() => ({})); alert(j.error || 'Não foi possível agendar. Tente outro horário.') }
  }

  if (dias.length === 0) {
    return <Casca nome={nome} cor={cor} logo={logo}><p className="text-center text-[14px] text-ink-2">Nenhum horário disponível no momento.</p></Casca>
  }

  if (pronto) {
    return (
      <Casca nome={nome} cor={cor} logo={logo}>
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full" style={{ background: `${cor}1a`, color: cor }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <h2 className="text-[18px] font-semibold text-ink">Agendamento confirmado!</h2>
          <p className="mt-1 text-[14px] text-ink-2">{formatarNoFuso(slotIso, { weekday: 'short', day: '2-digit', month: '2-digit' }, '', fuso)} às {formatarHora(slotIso, '', fuso)}</p>
          <p className="mt-3 text-[12.5px] text-ink-3">Você receberá a confirmação. Se precisar remarcar, entre em contato.</p>
        </div>
      </Casca>
    )
  }

  return (
    <Casca nome={nome} cor={cor} logo={logo}>
      <h2 className="mb-1 text-[16px] font-semibold text-ink">Escolha o melhor horário</h2>
      <p className="mb-4 text-[13px] text-ink-3">Marque online, a qualquer hora.</p>

      {/* Dias */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {dias.map((d, i) => {
          const sel = i === diaIdx
          return (
            <button key={d} onClick={() => { setDiaIdx(i); setSlotIso('') }}
              className="flex min-w-[58px] flex-col items-center rounded-control border px-2 py-2 text-center transition-colors"
              style={sel ? { borderColor: cor, background: `${cor}12` } : { borderColor: 'var(--line, #e5e5e5)' }}>
              <span className="text-[11px] text-ink-3">{DIA_LABEL[diaDaSemana(d)]}</span>
              <span className="num text-[15px] font-semibold text-ink">{Number(d.slice(8, 10))}</span>
              <span className="text-[10px] text-ink-3">{rotuloDoMes(d, { month: 'short' }).replace('.', '')}</span>
            </button>
          )
        })}
      </div>

      {/* Slots */}
      <div className="mb-5 grid grid-cols-4 gap-2 sm:grid-cols-5">
        {slots.map((s) => {
          const iso = s.toISOString()
          const indisp = ocupadasSet.has(s.getTime()) || s.getTime() < agoraMs
          const sel = slotIso === iso
          return (
            <button key={iso} disabled={indisp} onClick={() => setSlotIso(iso)}
              className={`rounded-control border py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${sel ? 'text-white' : 'text-ink'}`}
              style={sel ? { background: cor, borderColor: cor } : { borderColor: 'var(--line, #e5e5e5)' }}>
              {formatarHora(s, '', fuso)}
            </button>
          )
        })}
        {slots.length === 0 && <p className="col-span-full text-center text-[13px] text-ink-3">Sem horários neste dia.</p>}
      </div>

      {/* Dados */}
      <div className="space-y-2.5">
        <input value={nomePac} onChange={(e) => setNomePac(e.target.value)} placeholder="Seu nome"
          className="h-11 w-full rounded-control border border-line bg-bg px-3.5 text-[15px] text-ink outline-none focus:border-accent" />
        <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="WhatsApp / telefone" inputMode="tel"
          className="h-11 w-full rounded-control border border-line bg-bg px-3.5 text-[15px] text-ink outline-none focus:border-accent" />
        <button onClick={confirmar} disabled={!slotIso || !nomePac.trim() || enviando}
          className="h-12 w-full rounded-control text-[15px] font-semibold text-white transition-opacity disabled:opacity-40" style={{ background: cor }}>
          {enviando ? 'Agendando…' : 'Confirmar agendamento'}
        </button>
      </div>
    </Casca>
  )
}

function Casca({ nome, cor, logo, children }: { nome: string; cor: string; logo: string | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-[440px] px-4 py-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          {logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logo} alt={nome} className="h-14 w-auto object-contain" />
            : <div className="flex size-12 items-center justify-center rounded-card text-[18px] font-bold text-white" style={{ background: cor }}>{nome.charAt(0)}</div>}
          <h1 className="text-[17px] font-semibold text-ink">{nome}</h1>
        </div>
        <div className="rounded-card border border-line bg-card p-5">{children}</div>
        <p className="mt-4 text-center text-[11px] text-ink-3">Agendamento online</p>
      </div>
    </div>
  )
}
