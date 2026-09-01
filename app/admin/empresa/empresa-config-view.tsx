'use client'

import { useState, useEffect } from 'react'
import { useEmpresa } from '@/lib/empresa-context'
import { Building2, Palette, Check, Lock, Upload } from 'lucide-react'
import { planoTemAcesso } from '@/lib/plano'
import { Topbar } from '@/components/layout/topbar'
import { Button, Input, Card, Tabs, notify, type TabItem } from '@/components/ui'

type Aba = 'loja' | 'visual'

export default function EmpresaConfigPage() {
  const { empresa, refetch } = useEmpresa()
  const [aba, setAba] = useState<Aba>('loja')
  const [loading, setLoading] = useState(false)
  const [sucesso, setSucesso] = useState(false)

  const [form, setForm] = useState({
    nome: '',
    // Dados JURÍDICOS da loja. Não eram editáveis em lugar nenhum: só entravam no
    // cadastro inicial e, se a pessoa pulasse, ficavam vazios para sempre — e o
    // contrato de compra e venda sai sem identificar a vendedora.
    cnpj: '',
    telefone: '',
    email: '',
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    representante_nome: '',
    representante_cpf: '',
    representante_nacionalidade: '',
    representante_estado_civil: '',
    representante_profissao: '',
    banco_nome: '',
    banco_agencia: '',
    banco_conta: '',
    banco_pix: '',
    wl_slogan: '',
    wl_whatsapp: '',
    wl_cor: '#2E5CE6',
    wl_logo_url: '',
  })

  useEffect(() => {
    if (empresa) {
      setForm({
        nome:          empresa.nome         ?? '',
        cnpj:          empresa.cnpj         ?? '',
        telefone:      empresa.telefone     ?? '',
        email:              empresa.email              ?? '',
        cep:                empresa.cep                ?? '',
        endereco:           empresa.endereco           ?? '',
        numero:             empresa.numero             ?? '',
        complemento:        empresa.complemento        ?? '',
        bairro:             empresa.bairro             ?? '',
        cidade:             empresa.cidade             ?? '',
        estado:             empresa.estado             ?? '',
        representante_nome: empresa.representante_nome ?? '',
        representante_cpf:  empresa.representante_cpf  ?? '',
        representante_nacionalidade: empresa.representante_nacionalidade ?? '',
        representante_estado_civil: empresa.representante_estado_civil ?? '',
        representante_profissao: empresa.representante_profissao ?? '',
        banco_nome: empresa.banco_nome ?? '',
        banco_agencia: empresa.banco_agencia ?? '',
        banco_conta: empresa.banco_conta ?? '',
        banco_pix: empresa.banco_pix ?? '',
        wl_slogan:     empresa.wl_slogan    ?? '',
        wl_whatsapp:   empresa.wl_whatsapp  ?? '',
        wl_cor:        empresa.wl_cor       ?? '#2E5CE6',
        wl_logo_url:   empresa.wl_logo_url  ?? '',
      })
    }
  }, [empresa])

  async function salvar() {
    if (!empresa) return
    const temWL = planoTemAcesso(empresa.plano, 'white_label')
    setLoading(true)
    setSucesso(false)

    /**
     * Salva pelo SERVIDOR, não direto pelo cliente.
     *
     * `empresas` tem grant de UPDATE por coluna para `authenticated` — só nome e
     * white-label. Gravando daqui, CNPJ e telefone davam "permission denied for
     * column": a tela existia e não funcionava, e foi por isso que a JM ficou com os
     * dois vazios e o contrato saiu sem identificar a vendedora. Ver
     * app/api/empresa/route.ts, que confere owner/admin antes de gravar.
     */
    const resposta = await fetch('/api/empresa', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome:        form.nome,
        // Fora do bloco de white-label de propósito: identificação da empresa não é
        // recurso de plano pago — é o que faz o contrato ser válido.
        cnpj:        form.cnpj.trim()     || null,
        telefone:    form.telefone.trim() || null,
        email:              form.email.trim()              || null,
        cep:                form.cep.trim()                || null,
        endereco:           form.endereco.trim()           || null,
        numero:             form.numero.trim()             || null,
        complemento:        form.complemento.trim()        || null,
        bairro:             form.bairro.trim()             || null,
        cidade:             form.cidade.trim()             || null,
        // UF em maiúsculas: o contrato escreve "Campinas - SP", não "- sp".
        estado:             form.estado.trim().toUpperCase() || null,
        representante_nome: form.representante_nome.trim()  || null,
        representante_cpf:  form.representante_cpf.trim()   || null,
        representante_nacionalidade: form.representante_nacionalidade.trim() || null,
        representante_estado_civil: form.representante_estado_civil.trim() || null,
        representante_profissao: form.representante_profissao.trim() || null,
        banco_nome: form.banco_nome.trim() || null,
        banco_agencia: form.banco_agencia.trim() || null,
        banco_conta: form.banco_conta.trim() || null,
        banco_pix: form.banco_pix.trim() || null,
        // White-label fields only saved for plans that include the module
        ...(temWL ? {
          wl_slogan:   form.wl_slogan   || null,
          wl_whatsapp: form.wl_whatsapp || null,
          wl_cor:      form.wl_cor,
          wl_logo_url: form.wl_logo_url || null,
        } : {}),
      }),
    })

    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok) { setLoading(false); notify.bad('Erro ao salvar', corpo?.error); return }

    document.documentElement.style.setProperty('--color-primary', form.wl_cor)

    await refetch()
    setLoading(false)
    setSucesso(true)
    setTimeout(() => setSucesso(false), 3000)
  }


  const ABAS: TabItem[] = [
    { value: 'loja',   label: <span className="flex items-center gap-2"><Building2 size={15} strokeWidth={1.7} /> Dados da loja</span> },
    { value: 'visual', label: <span className="flex items-center gap-2"><Palette size={15} strokeWidth={1.7} /> Visual / White-label</span> },
  ]


  return (
    <div className="flex h-full flex-col">
      <Topbar title="Minha empresa" />

      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-xl space-y-4">

          <Tabs items={ABAS} value={aba} onValueChange={(v) => setAba(v as Aba)} />

          {(aba === 'loja') && (
            <Card title="Dados da loja">
              <div className="space-y-3">
                <Input label="Nome da loja" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                {/* CNPJ e telefone saem no CONTRATO ({{loja.cnpj}}) e na nota. Não
                    havia onde preencher: só o cadastro inicial pedia, e a JM está em
                    produção com os dois vazios — o contrato de compra e venda não
                    identifica a vendedora. */}
                <Input
                  label="CNPJ"
                  value={form.cnpj}
                  onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                  placeholder="00.000.000/0000-00"
                  hint="Sai no contrato de compra e venda. Sem ele, o documento não identifica a loja."
                  className="num"
                />
                <Input
                  label="Telefone da loja"
                  value={form.telefone}
                  onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                  placeholder="(19) 3333-4444"
                  hint="Contato que aparece nos documentos."
                  className="num"
                />
                {/* Endereço e representante: o bloco "VENDEDORA" do contrato pede
                    razão social, CNPJ, e-mail, endereço completo e quem assina. Sem
                    estes campos o modelo só conseguia trazer tudo como texto fixo —
                    era o que fazia o contrato da JM sair como "SUA EMPRESA LTDA". */}
                <Input label="E-mail da loja" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contato@sualoja.com.br" hint="Sai no contrato ({{loja.email}})." />
                <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
                  <Input label="Endereço (rua/avenida)" value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Avenida Central" />
                  <Input label="Número" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} placeholder="250" className="num" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Complemento" value={form.complemento} onChange={e => setForm(f => ({ ...f, complemento: e.target.value }))} placeholder="Loja 3" />
                  <Input label="Bairro" value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} placeholder="Centro" />
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_90px_150px]">
                  <Input label="Cidade" value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} placeholder="Campinas" />
                  <Input label="UF" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} placeholder="SP" maxLength={2} />
                  <Input label="CEP" value={form.cep} onChange={e => setForm(f => ({ ...f, cep: e.target.value }))} placeholder="13000-000" className="num" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Quem assina pela loja" value={form.representante_nome} onChange={e => setForm(f => ({ ...f, representante_nome: e.target.value }))} placeholder="Nome do responsável legal" hint="Aparece no contrato como representante." />
                  <Input label="CPF de quem assina" value={form.representante_cpf} onChange={e => setForm(f => ({ ...f, representante_cpf: e.target.value }))} placeholder="000.000.000-00" className="num" />
                </div>
                {/*
                  QUALIFICAÇÃO DE QUEM ASSINA E CONTA QUE RECEBE.
                  Sem estes campos, a única saída era digitar fixo no modelo — e
                  foi assim que dois contratos reais da JM foram para a mão do
                  cliente com "estado civil", "profissão" e "Banco XXXX"
                  impressos literalmente. Estão aqui porque contrato pede.
                */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input label="Nacionalidade de quem assina" value={form.representante_nacionalidade} onChange={e => setForm(f => ({ ...f, representante_nacionalidade: e.target.value }))} placeholder="brasileiro" />
                  <Input label="Estado civil de quem assina" value={form.representante_estado_civil} onChange={e => setForm(f => ({ ...f, representante_estado_civil: e.target.value }))} placeholder="solteiro" />
                  <Input label="Profissão de quem assina" value={form.representante_profissao} onChange={e => setForm(f => ({ ...f, representante_profissao: e.target.value }))} placeholder="empresário" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Input label="Banco" value={form.banco_nome} onChange={e => setForm(f => ({ ...f, banco_nome: e.target.value }))} placeholder="PagBank" hint="Conta que recebe, impressa no contrato." />
                  <Input label="Agência" value={form.banco_agencia} onChange={e => setForm(f => ({ ...f, banco_agencia: e.target.value }))} placeholder="0001" className="num" />
                  <Input label="Conta corrente" value={form.banco_conta} onChange={e => setForm(f => ({ ...f, banco_conta: e.target.value }))} placeholder="00000-0" className="num" />
                  <Input label="Chave PIX" value={form.banco_pix} onChange={e => setForm(f => ({ ...f, banco_pix: e.target.value }))} placeholder="CNPJ, e-mail ou telefone" />
                </div>
                <Input label="Slogan" value={form.wl_slogan} onChange={e => setForm(f => ({ ...f, wl_slogan: e.target.value }))} placeholder="Ex: Importados com qualidade" />
                <Input label="WhatsApp (com DDI)" value={form.wl_whatsapp} onChange={e => setForm(f => ({ ...f, wl_whatsapp: e.target.value }))} placeholder="5511999999999" />
              </div>
            </Card>
          )}

          {(aba === 'visual') && !planoTemAcesso(empresa?.plano, 'white_label') && (
            <div className="flex items-center gap-3 rounded-card border border-accent/20 bg-accent-soft p-4">
              <Lock size={18} strokeWidth={1.7} className="shrink-0 text-accent" />
              <div>
                <p className="text-[13px] font-semibold text-ink">Recurso exclusivo do plano Pro</p>
                <p className="mt-0.5 text-[12px] text-ink-2">Faça upgrade para personalizar cores, logo e slogan da sua loja.</p>
              </div>
              <a href="/admin/planos?upgrade=white_label" className="ml-auto whitespace-nowrap text-[12px] font-semibold text-accent hover:underline">Ver planos →</a>
            </div>
          )}

          {(aba === 'visual') && (
            <>
              <Card title="Cor da marca">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.wl_cor}
                    onChange={e => setForm(f => ({ ...f, wl_cor: e.target.value }))}
                    className="h-9 w-12 cursor-pointer rounded-control border border-line bg-card"
                  />
                  <input
                    value={form.wl_cor}
                    onChange={e => setForm(f => ({ ...f, wl_cor: e.target.value }))}
                    className="h-9 flex-1 rounded-control border border-line bg-card px-3 text-[13px] text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/40"
                  />
                  <div className="grid h-9 w-9 place-items-center rounded-control text-[11px] font-bold text-white"
                    style={{ background: form.wl_cor }}>A</div>
                </div>
                <p className="mt-2 text-[12px] text-ink-3">Aplicada em botões, destaques e ícones do sistema.</p>
              </Card>
              <Card title="Logo">
                <Input label="URL do logo (PNG ou SVG)" value={form.wl_logo_url}
                  onChange={e => setForm(f => ({ ...f, wl_logo_url: e.target.value }))}
                  placeholder="https://suaempresa.com/logo.png" />
                {form.wl_logo_url && (
                  <div className="mt-3 rounded-control border border-line bg-raised p-4">
                    <p className="mb-2 text-[12px] text-ink-2">Preview do logo:</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.wl_logo_url} alt="Logo preview" className="h-10 object-contain" />
                  </div>
                )}
              </Card>
            </>
          )}

          {(
            <Button onClick={salvar} loading={loading}
              icon={sucesso ? <Check size={15} strokeWidth={1.7} /> : <Upload size={15} strokeWidth={1.7} />}>
              {sucesso ? 'Salvo!' : 'Salvar alterações'}
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}
