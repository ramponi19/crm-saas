import { Input } from '@/components/ui'

/**
 * Os campos de APARELHO no modal de ver/editar a unidade do Estoque (módulo
 * Celulares): IMEI 1, IMEI 2 e saúde da bateria. Fragmentos de grade — o modal
 * os põe no lugar de sempre, entre os campos do core.
 */

type FormUnidade = { imei: string | null; imei2: string | null; bateria: string | null }
type Setter = (k: keyof FormUnidade, v: string | null) => void

export function CamposCelularModal({ form, set }: { form: FormUnidade; set: Setter }) {
  return (
    <>
      <Input label="IMEI 1" value={form.imei ?? ''} onChange={e => set('imei', e.target.value || null)} placeholder="000000000000000" className="num" />
      <Input label="IMEI 2 / Série" value={form.imei2 ?? ''} onChange={e => set('imei2', e.target.value || null)} placeholder="000000000000000" className="num" />
    </>
  )
}

export function CampoBateriaModal({ form, set }: { form: FormUnidade; set: Setter }) {
  return (
    <Input label="Bateria %" value={form.bateria ?? ''} onChange={e => set('bateria', e.target.value || null)} placeholder="95" className="num" />
  )
}
