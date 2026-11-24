'use client'

import { useEffect, useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { Card, Input, Button, Select, notify } from '@/components/ui'
import { apiFetch } from '@/lib/api-cliente'
import { HORARIO_PADRAO, horarioValido, type Horario, type Semana } from '@/lib/horario'
import { cn } from '@/lib/utils'

/**
 * HORÁRIO DE FUNCIONAMENTO POR DIA E POR LOJA (24/11/2026). Universal.
 *
 * Cada dia: aberto ou fechado, e o horário de abrir e fechar. A empresa tem o seu; cada loja usa o da empresa ou tem
 * um próprio. "Dia útil" é dia em que a loja abre: o pós-venda empurra o passo de dia fechado para o próximo dia
 * aberto e reduz o teto diário nos dias de meio expediente. Grava por /api/configuracoes/horario (dono ou admin).
 */
const DIAS: { k: keyof Semana; label: string }[] = [
  { k: '1', label: 'Segunda' }, { k: '2', label: 'Terça' }, { k: '3', label: 'Quarta' }, { k: '4', label: 'Quinta' },
  { k: '5', label: 'Sexta' }, { k: '6', label: 'Sábado' }, { k: '0', label: 'Domingo' },
]

interface LojaHorario { id: number; nome: string; proprio: Horario | null }
interface Resposta { empresa: Horario; lojas: LojaHorario[] }

const copia = (h: Horario): Horario => JSON.parse(JSON.stringify(h))

export function HorarioCard() {
  const [dados, setDados] = useState<Resposta | null>(null)
  const [alvo, setAlvo] = useState<string>('empresa')            // 'empresa' ou o id da loja
  const [usaEmpresa, setUsaEmpresa] = useState(true)               // só para loja
  const [form, setForm] = useState<Horario>(copia(HORARIO_PADRAO))
  const [salvando, setSalvando] = useState(false)

  /** Põe no formulário o horário que vale para o alvo (empresa ou loja). */
  function mostrar(d: Resposta, a: string) {
    setAlvo(a)
    if (a === 'empresa') { setForm(copia(d.empresa)); setUsaEmpresa(false); return }
    const loja = d.lojas.find((l) => String(l.id) === a)
    setUsaEmpresa(!loja?.proprio)
    setForm(copia(loja?.proprio ?? d.empresa))
  }

  async function carregar(a: string) {
    const { ok, json } = await apiFetch<Resposta & { error?: string }>('/api/configuracoes/horario')
    if (!ok) { notify.bad(json.error ?? 'Não foi possível ler o horário'); return }
    setDados(json)
    mostrar(json, a)
  }
  // Carga inicial, uma vez. O estado só muda DEPOIS da resposta da rede (assíncrono), não no corpo do efeito:
  // a regra não enxerga o await. Mesma forma das outras telas de configuração.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void carregar('empresa') }, [])

  const valido = useMemo(() => horarioValido(form) != null, [form])
  const editavel = alvo === 'empresa' || !usaEmpresa

  function setDia(k: keyof Semana, aberto: boolean) {
    setForm((f) => ({ ...f, semana: { ...f.semana, [k]: aberto ? [{ abre: '09:00', fecha: '18:00' }] : [] } }))
  }
  function setHora(k: keyof Semana, campo: 'abre' | 'fecha', v: string) {
    setForm((f) => {
      const iv = f.semana[k].length ? f.semana[k].map((i, n) => (n === 0 ? { ...i, [campo]: v } : i)) : [{ abre: '09:00', fecha: '18:00', [campo]: v }]
      return { ...f, semana: { ...f.semana, [k]: iv } }
    })
  }

  async function salvar() {
    if (editavel && !valido) { notify.warn('Confira o horário', 'Pelo menos um dia aberto, e o fechamento depois da abertura.'); return }
    setSalvando(true)
    try {
      const corpo = alvo === 'empresa'
        ? { filialId: null, horario: form }
        : { filialId: Number(alvo), horario: usaEmpresa ? null : form }
      const { ok, json, sessaoExpirada } = await apiFetch<{ error?: string }>('/api/configuracoes/horario', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      })
      if (sessaoExpirada) return
      if (!ok) { notify.bad(json.error ?? 'Erro ao salvar o horário'); return }
      notify.ok('Horário de funcionamento salvo')
      await carregar(alvo)
    } finally { setSalvando(false) }
  }

  const multiLoja = (dados?.lojas.length ?? 0) >= 2

  return (
    <Card
      title="Horário de funcionamento"
      actions={
        <Button onClick={salvar} loading={salvando} icon={<Save size={15} strokeWidth={1.7} />}>
          {salvando ? 'Salvando…' : 'Salvar horário'}
        </Button>
      }
    >
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">
        Dia em que a loja abre é <strong className="text-ink">dia útil</strong>. As automações não disparam com a loja fechada, e o
        pós-venda leva o acompanhamento de dia fechado para o próximo dia aberto (em meio expediente, com menos passos por pessoa).
      </p>

      {multiLoja && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Select label="Horário de" value={alvo} onChange={(e) => dados && mostrar(dados, e.target.value)}>
            <option value="empresa">Empresa (padrão das lojas)</option>
            {dados!.lojas.map((l) => <option key={l.id} value={String(l.id)}>{l.nome}{l.proprio ? ' · horário próprio' : ''}</option>)}
          </Select>
          {alvo !== 'empresa' && (
            <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={usaEmpresa} onChange={(e) => { setUsaEmpresa(e.target.checked); if (e.target.checked && dados) setForm(copia(dados.empresa)) }} />
              Usa o horário da empresa
            </label>
          )}
        </div>
      )}

      <div className="divide-y divide-line rounded-control border border-line">
        {DIAS.map((d) => {
          const iv = form.semana[d.k]
          const aberto = iv.length > 0
          return (
            <div key={d.k} className={cn('flex flex-wrap items-center gap-3 px-3 py-2', !editavel && 'opacity-60')}>
              <label className="flex w-28 items-center gap-2 text-[13px] font-medium text-ink">
                <input type="checkbox" checked={aberto} disabled={!editavel} onChange={(e) => setDia(d.k, e.target.checked)} />
                {d.label}
              </label>
              {aberto ? (
                <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
                  <input type="time" aria-label={`${d.label}: abre`} disabled={!editavel} value={iv[0].abre}
                    onChange={(e) => setHora(d.k, 'abre', e.target.value)}
                    className="rounded-control border border-line bg-card px-2 py-1 text-ink" />
                  às
                  <input type="time" aria-label={`${d.label}: fecha`} disabled={!editavel} value={iv[iv.length - 1].fecha}
                    onChange={(e) => setHora(d.k, 'fecha', e.target.value)}
                    className="rounded-control border border-line bg-card px-2 py-1 text-ink" />
                  {iv.length > 1 && <span className="text-[11.5px] text-ink-3">(com pausa: {iv.length} períodos)</span>}
                </div>
              ) : <span className="text-[12.5px] text-ink-3">Fechado</span>}
            </div>
          )
        })}
      </div>

      {alvo === 'empresa' && (
        <div className="mt-4 max-w-[220px]">
          <Input
            label="SLA de 1ª resposta (min)"
            type="number"
            min={1}
            value={form.sla_resposta_min ?? 15}
            onChange={(e) => setForm((f) => ({ ...f, sla_resposta_min: Number(e.target.value) }))}
            hint="Meta de tempo para o primeiro retorno ao lead"
          />
        </div>
      )}
    </Card>
  )
}
