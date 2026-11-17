import { Input, Select } from '@/components/ui'

/**
 * Os campos de VEÍCULO do Estoque (placa, ano, chassi, km, renavam) — do módulo
 * Avaliações. O Estoque do core só os mostra quando a página diz que a empresa
 * trabalha com veículo (módulo ligado + campo `placa` no item).
 */

type FormEntrada = { placa: string; chassi: string; renavam: string; km: string; ano: string }

/** Na entrada de estoque (formulário da aba Entrada). */
export function CamposVeiculoEntrada({ form, set }: {
  form: FormEntrada
  set: (k: keyof FormEntrada, v: string) => void
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Input label="Placa" value={form.placa} onChange={e => set('placa', e.target.value.toUpperCase())} placeholder="ABC1D23" className="num" />
        <Input label="Ano/modelo" type="number" value={form.ano} onChange={e => set('ano', e.target.value)} placeholder="2022" className="num" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Input label="Chassi" value={form.chassi} onChange={e => set('chassi', e.target.value.toUpperCase())} placeholder="9BW…" className="num" />
        <Input label="Km" type="number" value={form.km} onChange={e => set('km', e.target.value)} placeholder="45000" className="num" />
      </div>
      <Input label="Renavam" value={form.renavam} onChange={e => set('renavam', e.target.value)} placeholder="00000000000" className="num" />
    </>
  )
}

type FormModal = {
  placa: string | null; chassi: string | null; renavam: string | null; km: number | null; ano: number | null
  cor: string | null; condicao: string | null; estado: string | null
}

/** No modal de ver/editar a unidade. */
export function CamposVeiculoModal({ form, set }: {
  form: FormModal
  set: (k: keyof FormModal, v: string | number | null) => void
}) {
  return (
    <>
      <Input label="Placa" value={form.placa ?? ''} onChange={e => set('placa', e.target.value.toUpperCase() || null)} placeholder="ABC1D23" className="num" />
      <Input label="Ano/modelo" type="number" value={form.ano ?? ''} onChange={e => set('ano', e.target.value ? Number(e.target.value) : null)} placeholder="2022" className="num" />
      <Input label="Chassi" value={form.chassi ?? ''} onChange={e => set('chassi', e.target.value.toUpperCase() || null)} placeholder="9BW…" className="num" />
      <Input label="Renavam" value={form.renavam ?? ''} onChange={e => set('renavam', e.target.value || null)} placeholder="00000000000" className="num" />
      <Input label="Km" type="number" value={form.km ?? ''} onChange={e => set('km', e.target.value ? Number(e.target.value) : null)} placeholder="45000" className="num" />
      <Input label="Cor" value={form.cor ?? ''} onChange={e => set('cor', e.target.value || null)} placeholder="Prata, Preto…" />

      <Select label="Condição" value={form.condicao ?? ''} onChange={e => set('condicao', e.target.value || null)}>
        <option value="novo">0km</option>
        <option value="seminovo">Pouco rodado</option>
        <option value="usado">Usado</option>
      </Select>
      <Select label="Estado" value={form.estado ?? ''} onChange={e => set('estado', e.target.value || null)}>
        <option value="excelente">Excelente</option>
        <option value="otimo">Ótimo</option>
        <option value="bom">Bom</option>
        <option value="regular">Regular</option>
      </Select>
    </>
  )
}
