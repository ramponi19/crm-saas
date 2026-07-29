'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void
      /**
       * O callback tem retorno `void` de propósito: passar uma função `async`
       * faz o SDK estourar com "Expression is of type asyncfunction, not
       * function". A assinatura aqui existe para o TypeScript reclamar antes de
       * o erro acontecer no navegador.
       */
      login: (
        cb: (r: { authResponse?: { code?: string } | null; status?: string }) => void,
        o: Record<string, unknown>,
      ) => void
    }
    fbAsyncInit?: () => void
  }
}

// A janela da Meta pode NUNCA chamar de volta — domínio não autorizado no app,
// pop-up bloqueado pelo navegador, ou o usuário fechando a aba. Sem um limite de
// espera, a tela fica travada para sempre (foi o que aconteceu na primeira
// tentativa real). Este teto devolve o controle e explica o motivo provável.
const ESPERA_MAX_MS = 75_000

function carregarSdk(appId: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.FB) return resolve(true)
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v25.0' })
      resolve(true)
    }
    const s = document.createElement('script')
    s.src = 'https://connect.facebook.net/pt_BR/sdk.js'
    s.async = true
    s.defer = true
    s.crossOrigin = 'anonymous'
    s.onerror = () => resolve(false)
    document.head.appendChild(s)
  })
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

  // O SDK é carregado no CARREGAMENTO DA TELA, não no clique. Motivo: carregar
  // depois do clique exige `await`, e o await quebra a cadeia do gesto do usuário
  // — o navegador passa a tratar a janela da Meta como pop-up automático e
  // BLOQUEIA em silêncio (nenhuma janela abre, e a tela fica girando).
  const [sdkPronto, setSdkPronto] = useState(false)
  useEffect(() => {
    if (!appId) return
    let vivo = true
    carregarSdk(appId).then((ok) => { if (vivo) setSdkPronto(ok) })
    return () => { vivo = false }
  }, [appId])

  // Libera a tela quando a janela da Meta não responde. Guardado em ref para o
  // callback poder cancelar o relógio se ele chegar antes.
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pararRelogio = () => { if (relogio.current) { clearTimeout(relogio.current); relogio.current = null } }
  function armarRelogio() {
    pararRelogio()
    relogio.current = setTimeout(() => {
      setConectando(null)
      notify.warn(
        'A janela da Meta não respondeu.',
        'Verifique se o navegador bloqueou o pop-up. Se não foi isso, o domínio do CRM ainda não está autorizado no app da Meta — me chame para configurar.',
      )
    }, ESPERA_MAX_MS)
  }
  useEffect(() => pararRelogio, [])

  const buscar = useCallback(async () => {
    const r = await fetch('/api/canais')
    const j = await r.json()
    if (r.ok) { setCanais(j.canais ?? []); setPronto(j.pronto ?? null) }
    else notify.bad(j.error ?? 'Não foi possível carregar os canais.')
    setCarregando(false)
  }, [])

  useEffect(() => { buscar() }, [buscar])

  const por = (t: Canal['tipo']) => canais.find((c) => c.tipo === t)

  // ── WhatsApp: Embedded Signup com coexistência ────────────────────────────
  function conectarWhatsApp() {
    setAvisoWhats(false)
    const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID_WA
    if (!configId) return notify.bad('Configuração do WhatsApp ausente no servidor.')
    if (!window.FB) {
      return notify.warn('O conector da Meta ainda está carregando.', 'Tente novamente em alguns segundos.')
    }
    setConectando('whatsapp')

    // O fluxo devolve os identificadores por mensagem de janela; o código de
    // troca vem no retorno do login. Precisamos dos dois, então escutamos antes.
    let waba: string | null = null
    let numero: string | null = null
    const ouvir = (ev: MessageEvent) => {
      if (!/facebook\.com$/.test(new URL(ev.origin).hostname)) return
      try {
        const d = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data
        if (d?.type !== 'WA_EMBEDDED_SIGNUP') return
        if (d.data?.waba_id) waba = String(d.data.waba_id)
        if (d.data?.phone_number_id) numero = String(d.data.phone_number_id)
      } catch { /* mensagem de outro formato: ignora */ }
    }
    window.addEventListener('message', ouvir)

    // O callback NÃO pode ser async: o SDK do Facebook valida o tipo e recusa
    // com "Expression is of type asyncfunction, not function". Por isso ele é
    // síncrono e só dispara o trabalho assíncrono.
    const gravarWhatsApp = async (code: string) => {
      try {
        const r = await fetch('/api/canais/whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, wabaId: waba, phoneNumberId: numero }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Falha ao conectar.')
        notify.ok(j.coexistencia ? 'WhatsApp conectado — segue funcionando no seu celular também.' : 'WhatsApp conectado.')
        ;(j.avisos ?? []).forEach((a: string) => notify.info(a))
        if (j.instrucao) notify.info(j.instrucao)
        await buscar()
      } catch (e) {
        notify.bad((e as Error).message)
      } finally {
        setConectando(null)
      }
    }

    armarRelogio()
    try {
      window.FB.login((resp) => {
        pararRelogio()
        window.removeEventListener('message', ouvir)
        const code = resp?.authResponse?.code
        if (!code) { setConectando(null); notify.info('Conexão cancelada.'); return }
        void gravarWhatsApp(code)
      }, {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          // É esta linha que oferece "usar o número que já está no meu celular".
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        },
      })
    } catch (e) {
      // Se o SDK estourar aqui, sem o catch o estado ficaria preso girando.
      pararRelogio()
      window.removeEventListener('message', ouvir)
      setConectando(null)
      notify.bad('O conector da Meta falhou ao abrir.', (e as Error).message)
    }
  }

  // ── Instagram + Messenger: um login serve os dois ─────────────────────────
  function conectarMeta() {
    const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID_IGMSG
    if (!configId) return notify.bad('Configuração do Instagram/Messenger ausente no servidor.')
    if (!window.FB) {
      return notify.warn('O conector da Meta ainda está carregando.', 'Tente novamente em alguns segundos.')
    }
    setConectando('instagram')
    armarRelogio()
    try {
      // Callback síncrono de propósito — o SDK recusa função async.
      window.FB.login((resp) => {
        pararRelogio()
        const code = resp?.authResponse?.code
        if (!code) { setConectando(null); notify.info('Conexão cancelada.'); return }
        void gravarMeta(code)
      }, { config_id: configId, response_type: 'code', override_default_response_type: true })
    } catch (e) {
      pararRelogio()
      setConectando(null)
      notify.bad('O conector da Meta falhou ao abrir.', (e as Error).message)
    }
  }

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
      {(!appId || !sdkPronto) && !faltaConfig && (
        <div className="flex gap-3 rounded-control border border-warn/30 bg-warn-soft p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-warn" />
          <div className="text-sm">
            <p className="font-semibold">
              {!appId ? 'Conector da Meta não configurado' : 'Carregando o conector da Meta…'}
            </p>
            <p className="mt-1 text-ink-2">
              {!appId
                ? 'Falta o identificador do aplicativo no servidor. Conectar canal está indisponível até isso ser corrigido.'
                : 'Aguarde alguns segundos. Se esta mensagem não sair, algum bloqueador de scripts pode estar impedindo o carregamento.'}
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
                      onClick={() => (tipo === 'whatsapp' ? setAvisoWhats(true) : conectarMeta())}
                      disabled={conectando === tipo || !!faltaConfig}
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
                    onClick={() => (tipo === 'whatsapp' ? setAvisoWhats(true) : conectarMeta())}
                    disabled={conectando === tipo || !!faltaConfig}
                  >
                    {conectando === tipo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    {conectando === tipo ? 'Aguardando a Meta…' : 'Conectar'}
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
        onConfirm={conectarWhatsApp}
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
