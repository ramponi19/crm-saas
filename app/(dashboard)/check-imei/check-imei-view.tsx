'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ScanSearch, ExternalLink, ShieldCheck, ShieldAlert, HelpCircle, Copy, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { empresaAtualId } from '@/lib/empresa-atual'
import { cn } from '@/lib/utils'
import { Topbar } from '@/components/layout/topbar'
import { Card, Input, Select, Button, Badge, Table, EmptyState, Textarea, notify, type Column } from '@/components/ui'
import {
  validarImei, formatarImei, URL_CONSULTA_OFICIAL,
  MOTIVOS_IMPEDIMENTO, RESULTADO_ROTULO, type ResultadoImei,
} from '@/lib/imei'

export interface ConsultaImei {
  id: number
  imei: string
  resultado: string
  motivo: string | null
  observacoes: string | null
  consultado_em: string
  consultado_por_nome: string | null
}

const TOM: Record<string, 'ok' | 'bad' | 'warn'> = {
  aprovado: 'ok', reprovado: 'bad', inconclusivo: 'warn',
}

/**
 * Consulta de IMEI na base de aparelhos impedidos.
 *
 * A consulta oficial é protegida por reCAPTCHA — existe para ser feita por uma
 * pessoa, e não há API pública para a base brasileira. As APIs "grátis" que se
 * acham por aí consultam a base GLOBAL (GSMA): um aparelho roubado no Brasil
 * pode passar limpo nelas, o que é pior do que não checar, porque dá confiança
 * falsa.
 *
 * Então o CRM faz o que dá para fazer bem: confere o dígito verificador na hora,
 * leva a pessoa ao portal com o número pronto, e REGISTRA o que ela viu — para o
 * resultado não morrer na memória de quem consultou.
 */
export function CheckImeiView({ consultas }: { consultas: ConsultaImei[] }) {
  const router = useRouter()
  const [imei, setImei] = useState('')
  const [resultado, setResultado] = useState<ResultadoImei>('aprovado')
  const [motivo, setMotivo] = useState(MOTIVOS_IMPEDIMENTO[0])
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [consultouPortal, setConsultouPortal] = useState(false)

  const validacao = useMemo(() => validarImei(imei), [imei])
  const digitos = validacao.digitos

  /** Consultas anteriores deste mesmo IMEI — o histórico é o que evita refazer. */
  const anteriores = useMemo(
    () => (digitos.length === 15 ? consultas.filter((c) => c.imei === digitos) : []),
    [consultas, digitos],
  )

  async function copiar() {
    await navigator.clipboard.writeText(digitos)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1800)
  }

  function abrirPortal() {
    // O portal não aceita o IMEI pela URL (é JSF com ViewState), então o número
    // vai para a área de transferência — é colar e resolver o captcha.
    copiar()
    window.open(URL_CONSULTA_OFICIAL, '_blank', 'noopener')
    setConsultouPortal(true)
  }

  async function registrar() {
    if (!validacao.valido) { notify.warn(validacao.motivo ?? 'IMEI inválido'); return }
    setSalvando(true)
    try {
      const supabase = createClient()
      const empresaId = await empresaAtualId(supabase)
      if (!empresaId) { notify.bad('Empresa não encontrada'); return }
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('imei_consultas').insert({
        empresa_id: empresaId,
        imei: digitos,
        resultado,
        motivo: resultado === 'reprovado' ? motivo : null,
        observacoes: observacoes.trim() || null,
        fonte: 'manual',
        consultado_por: user?.id ?? null,
      })
      if (error) { notify.bad('Erro ao registrar', error.message); return }
      notify.ok('Consulta registrada')
      setImei(''); setObservacoes(''); setResultado('aprovado'); setConsultouPortal(false)
      router.refresh()
    } finally {
      setSalvando(false)
    }
  }

  const cols: Column<ConsultaImei>[] = [
    {
      key: 'imei', header: 'IMEI',
      render: (c) => <span className="num font-semibold text-ink">{formatarImei(c.imei)}</span>,
    },
    {
      key: 'resultado', header: 'Resultado',
      render: (c) => (
        <div className="flex flex-col gap-0.5">
          <Badge tone={TOM[c.resultado] ?? 'neutro'}>{RESULTADO_ROTULO[c.resultado as ResultadoImei] ?? c.resultado}</Badge>
          {c.motivo && <span className="text-[11px] text-bad">{c.motivo}</span>}
        </div>
      ),
    },
    { key: 'obs', header: 'Observações', hideOnMobile: true, render: (c) => <span className="text-ink-3">{c.observacoes ?? '—'}</span> },
    {
      key: 'quando', header: 'Consultado', align: 'right', className: 'num',
      render: (c) => (
        <div className="flex flex-col items-end">
          <span className="text-ink-2">{new Date(c.consultado_em).toLocaleDateString('pt-BR')}</span>
          {c.consultado_por_nome && <span className="text-[10.5px] text-ink-3">{c.consultado_por_nome}</span>}
        </div>
      ),
    },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <Topbar eyebrow="OPERAÇÃO" title="Check IMEI" />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
        <div className="mx-auto max-w-[820px] space-y-5">
          <Card title="Consultar aparelho">
            <div className="space-y-4">
              <div>
                <Input
                  label="IMEI (digite *#06# no aparelho)"
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                  placeholder="15 dígitos"
                  className="num"
                  autoFocus
                />
                {imei.trim() && (
                  <p className={cn('mt-1.5 text-[11.5px]', validacao.valido ? 'text-ok' : 'text-bad')}>
                    {validacao.valido
                      ? `${formatarImei(digitos)} · dígito verificador confere`
                      : validacao.motivo}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-ink-3">
                  Aparelho com dois chips tem <strong>um IMEI por chip</strong> — consulte os dois.
                </p>
              </div>

              {anteriores.length > 0 && (
                <div className="rounded-control border border-line-soft bg-raised p-3">
                  <div className="mb-1 text-[12px] font-semibold text-ink">Este IMEI já foi consultado</div>
                  {anteriores.slice(0, 3).map((c) => (
                    <div key={c.id} className="text-[11.5px] text-ink-2">
                      {new Date(c.consultado_em).toLocaleDateString('pt-BR')} ·{' '}
                      <span className={c.resultado === 'reprovado' ? 'font-semibold text-bad' : 'text-ink-2'}>
                        {RESULTADO_ROTULO[c.resultado as ResultadoImei] ?? c.resultado}
                      </span>
                      {c.motivo ? ` · ${c.motivo}` : ''}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" icon={copiado ? <Check size={15} strokeWidth={1.9} /> : <Copy size={15} strokeWidth={1.7} />}
                  onClick={copiar} disabled={!validacao.valido}>
                  {copiado ? 'Copiado' : 'Copiar IMEI'}
                </Button>
                <Button icon={<ExternalLink size={15} strokeWidth={1.7} />} onClick={abrirPortal} disabled={!validacao.valido}>
                  Consultar no portal oficial
                </Button>
              </div>

              <p className="text-[11.5px] text-ink-3">
                O portal das operadoras exige captcha, então a consulta é feita por você: o botão copia o
                número e abre o site. Depois registre abaixo o que apareceu — assim o resultado fica no
                CRM e ninguém precisa consultar de novo.
              </p>
            </div>
          </Card>

          <Card title="Registrar o resultado">
            <div className="space-y-4">
              {!consultouPortal && (
                <p className="text-[12px] text-ink-3">
                  Consulte no portal primeiro. Registrar sem consultar guarda um dado que ninguém verificou.
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select label="Resultado" value={resultado} onChange={(e) => setResultado(e.target.value as ResultadoImei)}>
                  <option value="aprovado">Aprovado — sem impedimento</option>
                  <option value="reprovado">Reprovado — aparelho impedido</option>
                  <option value="inconclusivo">Inconclusivo</option>
                </Select>
                {resultado === 'reprovado' && (
                  <Select label="Motivo do impedimento" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                    {MOTIVOS_IMPEDIMENTO.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                )}
              </div>
              <Textarea label="Observações (opcional)" rows={2} value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex.: cliente apresentou nota fiscal" />

              {resultado === 'reprovado' && (
                <div className="flex items-start gap-2 rounded-control border border-bad/30 bg-bad-soft p-3">
                  <ShieldAlert size={16} strokeWidth={1.8} className="mt-0.5 flex-none text-bad" />
                  <p className="text-[12px] text-ink-2">
                    Aparelho impedido não deve entrar no estoque. O registro fica gravado com seu nome e a data —
                    e o IMEI passa a ser sinalizado em vermelho no cadastro do estoque.
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button icon={<ScanSearch size={15} strokeWidth={1.7} />} onClick={registrar}
                  loading={salvando} disabled={!validacao.valido}>
                  Registrar consulta
                </Button>
              </div>
            </div>
          </Card>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[14px] font-semibold text-ink">Consultas registradas</h2>
              <span className="text-[12px] text-ink-3">{consultas.length}</span>
            </div>
            <Card flush>
              <Table
                columns={cols}
                rows={consultas}
                rowKey={(c) => c.id}
                empty={<EmptyState
                  icon={<HelpCircle size={22} strokeWidth={1.7} />}
                  title="Nenhuma consulta ainda"
                  description="Consulte um IMEI acima e registre o resultado para começar o histórico."
                />}
              />
            </Card>
          </div>

          <div className="flex items-start gap-2.5 rounded-card border border-line-soft bg-raised p-4">
            <ShieldCheck size={17} strokeWidth={1.7} className="mt-0.5 flex-none text-ink-3" />
            <p className="text-[12px] leading-relaxed text-ink-2">
              <strong className="text-ink">Por que a consulta não é automática.</strong> A base brasileira de
              aparelhos impedidos é das operadoras e da Anatel, e o portal exige captcha — não há API pública.
              As APIs gratuitas que existem consultam a base global (GSMA), onde um aparelho roubado no Brasil
              pode aparecer limpo: seria pior do que não checar. Existem serviços pagos que automatizam o portal
              oficial; quando a loja contratar um, a consulta passa a ser automática sem mudar esta tela.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
