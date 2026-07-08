'use client'

import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, Input, Select, Button, notify } from '@/components/ui'
import type { Json } from '@/types/database'

interface DadosLoja {
  nome: string
  cnpj: string
  telefone: string
  email: string
  endereco: string
  cidade: string
  estado: string
  site: string
  descricao: string
}

interface Props {
  config: DadosLoja | null
  onSaved: () => void
}

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export function DadosLojaCard({ config, onSaved }: Props) {
  const supabase = createClient()
  const [form, setForm] = useState<DadosLoja>({
    nome:       config?.nome      ?? '',
    cnpj:       config?.cnpj      ?? '',
    telefone:   config?.telefone  ?? '',
    email:      config?.email     ?? '',
    endereco:   config?.endereco  ?? '',
    cidade:     config?.cidade    ?? '',
    estado:     config?.estado    ?? 'SP',
    site:       config?.site      ?? '',
    descricao:  config?.descricao ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [empresaId, setEmpresaId] = useState<number | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: vinculo } = await supabase
        .from('empresa_usuarios')
        .select('empresa_id')
        .eq('usuario_id', user.id)
        .eq('ativo', true)
        .single()
      if (vinculo) setEmpresaId(vinculo.empresa_id)
    })()
  }, [supabase])

  const set = (k: keyof DadosLoja, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function salvar() {
    if (!empresaId) { notify.bad('Empresa não identificada'); return }
    setLoading(true)
    const { error } = await supabase
      .from('configuracoes_sistema')
      .upsert({ chave: 'dados_loja', valor: form as unknown as Json, empresa_id: empresaId }, { onConflict: 'empresa_id,chave' })
    setLoading(false)
    if (error) { notify.bad('Erro ao salvar dados da loja'); return }
    notify.ok('Dados da loja salvos')
    onSaved()
  }

  return (
    <Card title="Dados da loja">
      <p className="-mt-0.5 mb-4 text-[12.5px] text-ink-2">Informações gerais do estabelecimento</p>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Nome da loja" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="JM Store Importados" />
        <Input label="CNPJ" value={form.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
        <Input label="Telefone" value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(19) 99999-9999" />
        <Input label="E-mail" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contato@jmstore.com.br" />
        <Input wrapperClassName="col-span-2" label="Endereço" value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, bairro" />
        <Input label="Cidade" value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Mogi Guaçu" />
        <Select label="Estado" value={form.estado} onChange={e => set('estado', e.target.value)}>
          {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
        </Select>
        <Input wrapperClassName="col-span-2" label="Site" value={form.site} onChange={e => set('site', e.target.value)} placeholder="https://jmstore.com.br" />
      </div>

      <div className="mt-5 flex justify-end border-t border-line-soft pt-4">
        <Button onClick={salvar} loading={loading} icon={<Save size={15} strokeWidth={1.7} />}>
          {loading ? 'Salvando…' : 'Salvar dados'}
        </Button>
      </div>
    </Card>
  )
}
