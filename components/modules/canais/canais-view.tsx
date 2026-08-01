'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Instagram, Send, RefreshCw, Unplug, AlertTriangle, Loader2, Info } from 'lucide-react'
import { Button, Badge, ConfirmDialog, Modal, Textarea, notify } from '@/components/ui'

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

type RespostaFb = { status?: string; authResponse?: { code?: string } | null }
declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void
      login: (cb: (r: RespostaFb) => void, o: Record<string, unknown>) => void
    }
    fbAsyncInit?: () => void
  }
}

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


  // ── SDK da Meta: é o ÚNICO caminho que faz COEXISTÊNCIA ───────────────────
  // Só o SDK aceita o parâmetro `extras`, e é ele que oferece "usar o número que
  // já está no app do celular". Comprovado na prática em 31/07/2026: o mesmo
  // `extras` enviado na URL do redirecionamento é ignorado em silêncio, e o
  // lojista cai numa tela pedindo NÚMERO NOVO — que é o caminho da migração,
  // justamente o que desconectaria o WhatsApp do aparelho dele.
  //
  // O SDK já falhou nesta tela antes, por quatro motivos hoje conhecidos e
  // corrigidos — estão listados aqui para ninguém reintroduzir:
  //   1. BOM nas variáveis da Vercel: o appId chegava com caractere invisível e
  //      o init falhava calado (cadastrar env var por `printf`, nunca por pipe
  //      do PowerShell);
  //   2. callback `async`: o SDK confere o tipo e recusa;
  //   3. FB.login antes do FB.init: existir `window.FB` não é estar iniciado;
  //   4. SDK carregado depois do clique: o await quebra a cadeia do gesto do
  //      usuário e o navegador bloqueia a janela.
  const [sdkPronto, setSdkPronto] = useState(false)
  const sessao = useRef<{ phoneNumberId?: string; wabaId?: string }>({})

  useEffect(() => {
    if (!appId) return

    // A Meta manda os ids da conta por postMessage durante o fluxo. É a fonte
    // mais confiável que existe: sem ela a rota teria de adivinhar qual número
    // conectar, e adivinhar erra quando o portfólio tem vários.
    const ouvir = (e: MessageEvent) => {
      if (!e.origin.endsWith('facebook.com')) return
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (d?.type !== 'WA_EMBEDDED_SIGNUP') return
        if (d.data?.phone_number_id) sessao.current.phoneNumberId = String(d.data.phone_number_id)
        if (d.data?.waba_id) sessao.current.wabaId = String(d.data.waba_id)
        registrar('es_evento', { evento: d.event ?? null, etapa: d.data?.current_step ?? null })
      } catch { /* postMessage de outro remetente */ }
    }
    window.addEventListener('message', ouvir)
    const limpar = () => window.removeEventListener('message', ouvir)

    if (window.FB) { setSdkPronto(true); return limpar }

    window.fbAsyncInit = () => {
      try {
        window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v25.0' })
        setSdkPronto(true)
        registrar('sdk_pronto')
      } catch (err) {
        registrar('sdk_init_falhou', { msg: (err as Error).message })
      }
    }
    const s = document.createElement('script')
    s.src = 'https://connect.facebook.net/pt_BR/sdk.js'
    s.async = true
    s.defer = true
    s.crossOrigin = 'anonymous'
    s.onerror = () => registrar('sdk_nao_carregou')
    document.body.appendChild(s)
    return limpar
  }, [appId, registrar])

  function conectarWhatsApp() {
    const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID_WA
    if (!configId || !appId) return notify.bad('Conector da Meta não configurado no servidor.')
    // Não cair no redirecionamento como plano B de propósito: sem coexistência
    // o fluxo oferece migrar o número, e migrar tira o WhatsApp do celular.
    // Melhor pedir para tentar de novo do que entregar o caminho errado.
    if (!sdkPronto || !window.FB) {
      return notify.bad('O conector da Meta ainda está carregando. Tente de novo em alguns segundos.')
    }
    sessao.current = {}
    setConectando('whatsapp')
    registrar('sdk_clique', { canal: 'whatsapp' })
    try {
      // Callback SÍNCRONO de propósito — o SDK recusa função async.
      window.FB.login((resp) => { void concluirWhatsApp(resp) }, {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        // `version` é OBRIGATÓRIO, e a página de coexistência da documentação
        // não o mostra. Sem ele a Meta usa a versão padrão do Embedded Signup,
        // que é anterior à v3 e não conhece `featureType` — então ignora o
        // pedido de coexistência EM SILÊNCIO. Foi o que aconteceu em 31/07: o
        // SDK abriu, o extras foi enviado, e nenhum evento voltou.
        // A tabela oficial de versões diz quem suporta o quê:
        //   v4 → featureType `whatsapp_business_app_onboarding`, feature `app_only_install`
        // `app_only_install` NÃO é coexistência (é acesso por token de negócio),
        // por isso `features` fica de fora.
        // Idêntico ao que o construtor da PRÓPRIA Meta gera para esta
        // configuração (conferido na URL que ele monta). Sem `setup: {}`: a
        // documentação mostra, o construtor não — e copiar a ferramenta deles
        // elimina a última variável em jogo.
        extras: {
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
          version: 'v4',
        },
      })
    } catch (e) {
      setConectando(null)
      registrar('sdk_login_excecao', { msg: (e as Error).message })
      notify.bad('O conector da Meta falhou ao abrir.', (e as Error).message)
    }
  }

  async function concluirWhatsApp(resp: RespostaFb) {
    const code = resp?.authResponse?.code
    if (!code) {
      setConectando(null)
      registrar('sdk_sem_codigo', { status: resp?.status ?? null })
      return notify.info('Conexão cancelada.')
    }
    try {
      const r = await fetch('/api/canais/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sem `redirectUri`: no fluxo do SDK não existe endereço de retorno, e
        // mandar um faria a Meta recusar a troca do código.
        body: JSON.stringify({ code, ...sessao.current }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Falha ao concluir a conexão.')
      notify.ok(j.coexistencia
        ? 'WhatsApp conectado — segue funcionando no seu celular também.'
        : 'WhatsApp conectado.')
      if (j.instrucao) notify.info(j.instrucao)
      ;(j.avisos ?? []).forEach((a: string) => notify.info(a))
      registrar('gravado', { canal: 'whatsapp', viaSdk: true })
      await buscar()
    } catch (e) {
      registrar('sdk_gravar_falhou', { msg: (e as Error).message })
      notify.bad((e as Error).message)
    } finally {
      setConectando(null)
    }
  }

  // ── Conexão por REDIRECIONAMENTO (Instagram e Messenger) ──────────────────
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
    // Não mandar `extras` aqui: o diálogo por URL ignora esse parâmetro sem
    // avisar. O WhatsApp não usa mais este caminho justamente por isso — vai
    // pelo SDK, acima, que é onde a coexistência funciona de verdade.
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

    // O Embedded Signup devolve os ids junto do código. Aproveitar isso não é
    // luxo: sem eles a rota cai na descoberta automática, que só aceita número
    // já em CLOUD_API — e um número recém-liberado de outro provedor fica um
    // tempo fora dela, o que faria a conexão falhar sem motivo aparente.
    const phoneNumberId = url.searchParams.get('phone_number_id') ?? undefined
    const wabaId = url.searchParams.get('waba_id') ?? undefined

    const tipo = (() => { try { return sessionStorage.getItem('canal_conectando') } catch { return null } })()
    try { sessionStorage.removeItem('canal_conectando') } catch { /* ignora */ }
    window.history.replaceState({}, '', '/admin/canais')

    if (erroMeta) {
      registrar('retorno_erro', { erro: erroMeta, canal: tipo })
      notify.bad('A Meta recusou a conexão.', erroMeta)
      return
    }
    registrar('retorno', { canal: tipo, temCode: true, temPhoneId: !!phoneNumberId, temWabaId: !!wabaId })
    setVoltandoDaMeta(true)

    const finalizar = async () => {
      try {
        const rota = tipo === 'whatsapp' ? '/api/canais/whatsapp' : '/api/canais/meta'
        const r = await fetch(rota, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          // O mesmo endereço enviado no diálogo — a Meta compara os dois.
          body: JSON.stringify({
            code: code!,
            redirectUri: `${window.location.origin}/canais`,
            ...(phoneNumberId ? { phoneNumberId } : {}),
            ...(wabaId ? { wabaId } : {}),
          }),
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
        // redirectUri idêntico ao do diálogo: a Meta recusa o código sem ele.
        body: JSON.stringify({ code, pageId, redirectUri: `${window.location.origin}/canais` }),
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

  const [tokenManual, setTokenManual] = useState('')
  const [salvandoToken, setSalvandoToken] = useState<'meta' | 'whatsapp' | null>(null)

  async function conectarComToken(destino: 'meta' | 'whatsapp') {
    const token = tokenManual.trim()
    if (!token) return
    setSalvandoToken(destino)
    registrar('token_manual', { destino })
    try {
      const r = await fetch(destino === 'whatsapp' ? '/api/canais/whatsapp' : '/api/canais/meta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Não foi possível conectar com este token.')
      if (destino === 'whatsapp') {
        notify.ok(j.coexistencia ? 'WhatsApp conectado — segue funcionando no celular também.' : 'WhatsApp conectado.')
        if (j.instrucao) notify.info(j.instrucao)
      } else {
        notify.ok(`Conectado: ${j.pagina}${j.instagram ? ` e ${j.instagram}` : ''}`)
      }
      ;(j.avisos ?? []).forEach((a: string) => notify.info(a))
      setTokenManual('')
      await buscar()
    } catch (e) {
      notify.bad((e as Error).message)
    } finally {
      setSalvandoToken(null)
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
                      disabled={conectando === tipo || voltandoDaMeta || !!faltaConfig || (tipo === 'whatsapp' && !sdkPronto)}
                    >
                      {conectando === tipo
                        ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                      {tipo === 'whatsapp' && !sdkPronto ? 'Carregando conector…' : 'Reconectar'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setADesconectar(c)} disabled={conectando === tipo}>
                      <Unplug className="mr-1.5 h-3.5 w-3.5" /> Desconectar
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => (tipo === 'whatsapp' ? setAvisoWhats(true) : irParaMeta('meta'))}
                    disabled={voltandoDaMeta || !!faltaConfig || conectando === tipo || (tipo === 'whatsapp' && !sdkPronto)}
                  >
                    {(voltandoDaMeta || conectando === tipo) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    {conectando === tipo
                      ? 'Aguardando a Meta…'
                      : voltandoDaMeta
                        ? 'Concluindo…'
                        : tipo === 'whatsapp' && !sdkPronto
                          ? 'Carregando conector…'
                          : 'Conectar'}
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
        onConfirm={() => { setAvisoWhats(false); conectarWhatsApp() }}
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

      {/* Conexão por token de usuário de sistema.
          Existe porque a Meta PROÍBE o portfólio dono do app de se conectar pelo
          fluxo de cliente — "não se pode ser cliente de si mesmo". Para clientes,
          o botão Conectar resolve; para a loja do próprio fornecedor, é por aqui. */}
      <details className="rounded-control border border-line bg-surface px-4 py-3">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-2">
          Conectar com token de usuário de sistema (avançado)
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-[12px] leading-relaxed text-ink-2">
            Use este caminho quando os ativos pertencem ao <strong>mesmo portfólio que é dono do
            aplicativo</strong> — a Meta bloqueia o fluxo normal nesse caso. Gere o token em
            Business Settings → Usuários → Usuários do sistema, atribua a Página, a conta do
            Instagram e a conta do WhatsApp, e marque as permissões dos canais.
            <strong> Escolha “nunca expira”.</strong>
          </p>
          <Textarea
            label="Token de usuário de sistema"
            rows={3}
            placeholder="EAAN..."
            value={tokenManual}
            onChange={(e) => setTokenManual(e.target.value)}
            hint="Vai cifrado para o banco e nunca é devolvido para o navegador."
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm" variant="outline"
              onClick={() => conectarComToken('meta')}
              loading={salvandoToken === 'meta'}
              disabled={!tokenManual.trim() || !!salvandoToken}
            >
              Conectar Instagram e Messenger
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => conectarComToken('whatsapp')}
              loading={salvandoToken === 'whatsapp'}
              disabled={!tokenManual.trim() || !!salvandoToken}
            >
              Conectar WhatsApp
            </Button>
          </div>
        </div>
      </details>

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
