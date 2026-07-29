'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, Instagram, Send, RefreshCw, Unplug, AlertTriangle, Loader2, Info } from 'lucide-react'
import { Button, Badge, ConfirmDialog, Modal, notify } from '@/components/ui'

// ⚠️ Zona sensível (Meta). Esta tela dispara o fluxo oficial de conexão.
// O token do cliente nunca passa por aqui: o navegador recebe só um código de
// troca, e quem troca por token é a rota no servidor (que tem o App Secret).

type Canal = {
  id: number
  tipo: 'whatsapp' | 'instagram' | 'messenger'
  external_id: string
  nome_exibicao: string | null
  status: 'ativo' | 'expirado' | 'erro' | 'desconectado'
  coexistencia: boolean
  token_expira_em: string | null
  data_access_expira_em: string | null
  ultimo_erro: string | null
  ultima_msg_em: string | null
  sync_historico_pct: number | null
}
type Pronto = { meta: boolean; cofre: boolean; configWhatsapp: boolean; configMeta: boolean }

const META: Record<Canal['tipo'], { nome: string; icone: typeof MessageCircle; cor: string }> = {
  whatsapp: { nome: 'WhatsApp', icone: MessageCircle, cor: '#25D366' },
  instagram: { nome: 'Instagram', icone: Instagram, cor: '#E1306C' },
  messenger: { nome: 'Messenger', icone: Send, cor: '#0084FF' },
}

const ROTULO_STATUS: Record<Canal['status'], { texto: string; tom: 'ok' | 'warn' | 'bad' }> = {
  ativo: { texto: 'Conectado', tom: 'ok' },
  expirado: { texto: 'Reconectar', tom: 'bad' },
  erro: { texto: 'Com problema', tom: 'bad' },
  desconectado: { texto: 'Desconectado', tom: 'warn' },
}


const dataBr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null

export function CanaisView({ appId }: { appId: string }) {
  const [canais, setCanais] = useState<Canal[]>([])
  const [pronto, setPronto] = useState<Pronto | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [conectando, setConectando] = useState<Canal['tipo'] | null>(null)
  const [aDesconectar, setADesconectar] = useState<Canal | null>(null)
  const [avisoWhats, setAvisoWhats] = useState(false)
  // Cliente com mais de uma Página: guarda o código para reenviar com a escolha
  // dele, em vez de conectar a primeira no escuro.
  const [escolha, setEscolha] = useState<{ code: string; paginas: { id: string; nome: string }[] } | null>(null)

  // Caixa-preta: o SDK da Meta falha no NAVEGADOR, antes de qualquer chamada ao
  // servidor. Sem isto a única fonte de verdade seria o console do usuário.
  // Nunca quebra o fluxo: falha de log é ignorada de propósito.
  const registrar = useCallback((etapa: string, dados: Record<string, unknown> = {}) => {
    try {
      fetch('/api/canais/diagnostico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etapa,
          origemUrl: typeof window !== 'undefined' ? window.location.href : null,
          dados: {
            ...dados,
            temAppId: !!appId,
            temConfigWa: !!process.env.NEXT_PUBLIC_META_CONFIG_ID_WA,
            temConfigIg: !!process.env.NEXT_PUBLIC_META_CONFIG_ID_IGMSG,
            navegador: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : null,
          },
        }),
        keepalive: true,
      }).catch(() => {})
    } catch { /* diagnóstico nunca pode atrapalhar o fluxo */ }
  }, [appId])


  // ── Conexão por REDIRECIONAMENTO (sem pop-up) ─────────────────────────────
  // O caminho do SDK depende de pop-up, e pop-up é bloqueado por navegador,
  // extensão e política de privacidade — no primeiro teste real a janela nunca
  // abriu, sem erro nenhum. Aqui a página inteira vai para a Meta e volta com o
  // código na URL. Volta para /canais, que já é um endereço autorizado no app,
  // então não exige configuração nova.
  function irParaMeta(tipo: 'whatsapp' | 'meta') {
    const configId = tipo === 'whatsapp'
      ? process.env.NEXT_PUBLIC_META_CONFIG_ID_WA
      : process.env.NEXT_PUBLIC_META_CONFIG_ID_IGMSG
    if (!configId || !appId) return notify.bad('Conector da Meta não configurado no servidor.')

    try { sessionStorage.setItem('canal_conectando', tipo) } catch { /* modo privado */ }
    registrar('redirecionando', { canal: tipo })

    const retorno = `${window.location.origin}/canais`
    const p = new URLSearchParams({
      client_id: appId,
      config_id: configId,
      response_type: 'code',
      override_default_response_type: 'true',
      redirect_uri: retorno,
    })
    // Liga a coexistência também neste caminho — é o que oferece usar o número
    // que já está no celular do cliente.
    if (tipo === 'whatsapp') {
      p.set('extras', JSON.stringify({
        setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3',
      }))
    }
    window.location.assign(`https://www.facebook.com/v25.0/dialog/oauth?${p.toString()}`)
  }

  const buscar = useCallback(async () => {
    const r = await fetch('/api/canais')
    const j = await r.json()
    if (r.ok) { setCanais(j.canais ?? []); setPronto(j.pronto ?? null) }
    else notify.bad(j.error ?? 'Não foi possível carregar os canais.')
    setCarregando(false)
  }, [])

  useEffect(() => { buscar() }, [buscar])

  // Volta da Meta: o código chega na própria URL. Conclui a conexão e limpa o
  // endereço, para um F5 não tentar reusar um código já gasto.
  const [voltandoDaMeta, setVoltandoDaMeta] = useState(false)
  useEffect(() => {
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const erroMeta = url.searchParams.get('error_description') ?? url.searchParams.get('error')
    if (!code && !erroMeta) return

    const tipo = (() => { try { return sessionStorage.getItem('canal_conectando') } catch { return null } })()
    try { sessionStorage.removeItem('canal_conectando') } catch { /* ignora */ }
    window.history.replaceState({}, '', '/canais')

    if (erroMeta) {
      registrar('retorno_erro', { erro: erroMeta, canal: tipo })
      notify.bad('A Meta recusou a conexão.', erroMeta)
      return
    }
    registrar('retorno', { canal: tipo, temCode: true })
    setVoltandoDaMeta(true)

    const finalizar = async () => {
      try {
        const rota = tipo === 'whatsapp' ? '/api/canais/whatsapp' : '/api/canais/meta'
        const r = await fetch(rota, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code! }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Falha ao concluir a conexão.')
        if (tipo === 'whatsapp') {
          notify.ok(j.coexistencia ? 'WhatsApp conectado — segue funcionando no seu celular também.' : 'WhatsApp conectado.')
          if (j.instrucao) notify.info(j.instrucao)
        } else if (j.outrasPaginas?.length) {
          setEscolha({ code: code!, paginas: j.outrasPaginas })
        } else {
          notify.ok(`Conectado: ${j.pagina}${j.instagram ? ` e ${j.instagram}` : ''}`)
        }
        ;(j.avisos ?? []).forEach((a: string) => notify.info(a))
        registrar('gravado', { canal: tipo })
        await buscar()
      } catch (e) {
        registrar('retorno_falhou', { canal: tipo, msg: (e as Error).message })
        notify.bad((e as Error).message)
      } finally {
        setVoltandoDaMeta(false)
      }
    }
    void finalizar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const por = (t: Canal['tipo']) => canais.find((c) => c.tipo === t)

  // ── WhatsApp: Embedded Signup com coexistência ────────────────────────────
  async function gravarMeta(code: string, pageId?: string) {
    try {
      const r = await fetch('/api/canais/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, pageId }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Falha ao conectar.')

      // Autorizou várias Páginas e ainda não escolheu: pergunta em vez de adivinhar.
      if (!pageId && j.outrasPaginas?.length) {
        setEscolha({ code, paginas: j.outrasPaginas })
        return
      }
      notify.ok(`Conectado: ${j.pagina}${j.instagram ? ` e ${j.instagram}` : ''}`)
      ;(j.avisos ?? []).forEach((a: string) => notify.info(a))
      await buscar()
    } catch (e) {
      notify.bad((e as Error).message)
    } finally {
      setConectando(null)
    }
  }

  async function desconectar(c: Canal) {
    setADesconectar(null)
    const r = await fetch(`/api/canais/${c.id}`, { method: 'DELETE' })
    const j = await r.json()
    if (!r.ok) return notify.bad(j.error ?? 'Não foi possível desconectar.')
    notify.ok(`${META[c.tipo].nome} desconectado do CRM.`)
    buscar()
  }

  if (carregando) {
    return <div className="flex items-center gap-2 p-8 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" /> Carregando canais…</div>
  }

  const faltaConfig = pronto && (!pronto.meta || !pronto.cofre)

  return (
    <div className="space-y-4">
      {/* Estado do conector visível: sem isto, qualquer falha de carregamento
          aparece só como um botão girando, sem explicação. */}
      {!appId && !faltaConfig && (
        <div className="flex gap-3 rounded-control border border-warn/30 bg-warn-soft p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-warn" />
          <div className="text-sm">
            <p className="font-semibold">
              Conector da Meta não configurado
            </p>
            <p className="mt-1 text-ink-2">
              Falta o identificador do aplicativo no servidor. Conectar canal está indisponível até isso ser corrigido.
            </p>
          </div>
        </div>
      )}

      {faltaConfig && (
        <div className="flex gap-3 rounded-control border border-bad/30 bg-bad-soft p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-bad" />
          <div className="text-sm">
            <p className="font-semibold">Conexão indisponível</p>
            <p className="mt-1 text-ink-2">
              {!pronto?.meta && 'As credenciais da Meta não estão configuradas no servidor. '}
              {!pronto?.cofre && 'A chave de criptografia dos canais não está configurada — sem ela o sistema se recusa a guardar o acesso. '}
              Fale com o suporte antes de tentar conectar.
            </p>
          </div>
        </div>
      )}

      {(['whatsapp', 'instagram', 'messenger'] as const).map((tipo) => {
        const c = por(tipo)
        const { nome, icone: Icone, cor } = META[tipo]
        const st = c ? ROTULO_STATUS[c.status] : null
        const acessoExpira = dataBr(c?.data_access_expira_em ?? null)

        return (
          <div key={tipo} className="rounded-control border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-control" style={{ background: cor + '18', color: cor }}>
                  <Icone className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{nome}</h3>
                    {st && <Badge tone={st.tom}>{st.texto}</Badge>}
                    {c?.coexistencia && <Badge tone="acc">Também no celular</Badge>}
                  </div>
                  {c ? (
                    <div className="mt-1 space-y-0.5 text-sm text-ink-2">
                      <p>{c.nome_exibicao ?? c.external_id}</p>
                      {c.ultima_msg_em && <p className="text-xs text-ink-3">Última mensagem: {new Date(c.ultima_msg_em).toLocaleString('pt-BR')}</p>}
                      {c.sync_historico_pct != null && c.sync_historico_pct < 100 && (
                        <p className="text-xs text-ink-3">Copiando conversas anteriores: {c.sync_historico_pct}%</p>
                      )}
                      {c.ultimo_erro && <p className="text-xs text-bad">{c.ultimo_erro}</p>}
                      {acessoExpira && (
                        <p className="text-xs text-warn">
                          Precisa reconectar até {acessoExpira} — é um prazo da Meta, não do sistema.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-ink-2">
                      {tipo === 'whatsapp'
                        ? 'Conecte o número que você já usa no WhatsApp Business — ele continua funcionando no celular.'
                        : tipo === 'instagram'
                          ? 'Receba e responda as mensagens do Direct aqui.'
                          : 'Receba e responda as mensagens da sua Página aqui.'}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-none items-center gap-2">
                {c ? (
                  <>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => (tipo === 'whatsapp' ? setAvisoWhats(true) : irParaMeta('meta'))}
                      disabled={conectando === tipo || voltandoDaMeta || !!faltaConfig}
                    >
                      {conectando === tipo
                        ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                      Reconectar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setADesconectar(c)} disabled={conectando === tipo}>
                      <Unplug className="mr-1.5 h-3.5 w-3.5" /> Desconectar
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => (tipo === 'whatsapp' ? setAvisoWhats(true) : irParaMeta('meta'))}
                    disabled={voltandoDaMeta || !!faltaConfig}
                  >
                    {voltandoDaMeta ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    {voltandoDaMeta ? 'Concluindo…' : 'Conectar'}
                  </Button>
                )}
              </div>
            </div>

            {tipo === 'messenger' && !por('messenger') && por('instagram') && (
              <p className="mt-3 flex gap-2 text-xs text-ink-3">
                <Info className="h-3.5 w-3.5 flex-none" />
                Instagram e Messenger conectam juntos, pela mesma Página.
              </p>
            )}
          </div>
        )
      })}

      {/* O que muda no app do cliente. A Meta não desfaz isso, então avisar antes
          é obrigação — descobrir depois queima confiança. */}
      <ConfirmDialog
        open={avisoWhats}
        title="Antes de conectar o WhatsApp"
        confirmLabel="Entendi, conectar"
        onConfirm={() => { setAvisoWhats(false); irParaMeta('whatsapp') }}
        onClose={() => setAvisoWhats(false)}
        description={
          <span className="block space-y-3">
            <span className="block"><strong>Seu número continua funcionando no celular.</strong> Conversas, grupos e ligações seguem normais, e as mensagens novas passam a aparecer também aqui no CRM.</span>
            <span className="block">As conversas dos <strong>últimos 6 meses</strong> são copiadas para o CRM se você autorizar durante a conexão. Deixe o WhatsApp aberto no celular por alguns minutos depois de conectar.</span>
            <span className="block">
              <strong className="block">O que deixa de funcionar no app:</strong>
              mensagens temporárias, ver uma vez e localização em tempo real; listas de transmissão
              passam a ser somente leitura; e os aparelhos conectados (WhatsApp Web, computador) são
              desvinculados — você precisa ligar de novo.
            </span>
            <span className="block text-ink-3">Grupos, status e ligações continuam só no celular: não aparecem no CRM.</span>
          </span>
        }
      />

      {/* Mais de uma Página autorizada: quem decide é o cliente. */}
      <Modal
        open={!!escolha}
        onClose={() => { setEscolha(null); setConectando(null) }}
        title="Qual Página você quer conectar?"
        size="sm"
      >
        <p className="mb-3 text-[13px] text-ink-2">
          Você autorizou mais de uma Página. As mensagens dessa Página e do Instagram vinculado a ela
          passam a aparecer no CRM.
        </p>
        <div className="flex flex-col gap-2">
          {escolha?.paginas.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              onClick={() => { const c = escolha.code; setEscolha(null); setConectando('instagram'); gravarMeta(c, p.id) }}
            >
              {p.nome}
            </Button>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!aDesconectar}
        title={`Desconectar ${aDesconectar ? META[aDesconectar.tipo].nome : ''}?`}
        confirmLabel="Desconectar"
        tone="danger"
        onConfirm={() => aDesconectar && desconectar(aDesconectar)}
        onClose={() => setADesconectar(null)}
        description={
          <>
            O CRM para de receber e de enviar por este canal. As conversas já salvas continuam aqui.
            {aDesconectar?.tipo === 'whatsapp' && ' Seu WhatsApp no celular não é afetado.'}
          </>
        }
      />
    </div>
  )
}
