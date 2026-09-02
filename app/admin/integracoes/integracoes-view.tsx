'use client'

import { useState, useEffect } from 'react'
import 'next/link'
import { Globe, Rss, Code2, DownloadCloud, Copy, ExternalLink, MessageCircle } from 'lucide-react'
import { Topbar } from '@/components/layout/topbar'
import { Card, Button, IconButton, Input, notify } from '@/components/ui'
import { CanaisView } from '@/components/modules/canais/canais-view'
import { SEGMENTOS, normalizarSegmento } from '@/lib/segmentos'
import { C2SCard, type EstadoC2S, type EventoIntegracao } from '@/components/modules/integracoes/c2s-card'

function IntegracaoCard({ icon: Icon, titulo, desc, children }: { icon: typeof Globe; titulo: string; desc: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-10 w-10 flex-none place-items-center rounded-control bg-accent-soft text-accent"><Icon size={20} strokeWidth={1.7} /></div>
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{titulo}</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-2">{desc}</p>
        </div>
      </div>
      {children}
    </Card>
  )
}

function UrlLinha({ label, url, onCopy }: { label: string; url: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-control bg-ink/[0.04] px-3 py-2">
      <span className="shrink-0 text-[11px] font-medium text-ink-3">{label}</span>
      <code className="num flex-1 truncate text-[12px] text-ink-2">{url}</code>
      <IconButton aria-label="Copiar" size="sm" onClick={onCopy}><Copy size={14} strokeWidth={1.7} /></IconButton>
    </div>
  )
}

export default function IntegracoesView({ slug, segmento, token, feedUrlInicial, ultimaImportacao, appId, c2s, eventosC2S = [] }: {
  slug: string; segmento: string; token: string; feedUrlInicial: string; ultimaImportacao: string | null
  /** App ID da Meta — público, roda no navegador dentro do conector oficial. */
  appId: string
  /** Contact2Sale: estado da ligação (sem o token deles) e últimos eventos. */
  c2s?: EstadoC2S
  eventosC2S?: EventoIntegracao[]
}) {
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const base = origin

  const feedUrl = `${base}/api/portais/${slug}`
  const leadsUrl = `${base}/api/portais/${slug}/leads?token=${token}`
  const siteUrl = `${base}/imob/${slug}`
  const formEndpoint = `${base}/api/imob/${slug}/lead?token=${token}`

  const [importUrl, setImportUrl] = useState(feedUrlInicial)
  const [importando, setImportando] = useState(false)
  const [ultima, setUltima] = useState(ultimaImportacao)

  const copiar = (txt: string, msg: string) =>
    navigator.clipboard.writeText(txt).then(() => notify.ok(msg)).catch(() => notify.bad('Não foi possível copiar'))

  async function importar() {
    if (!/^https?:\/\//i.test(importUrl.trim())) { notify.bad('Cole a URL do feed XML (http/https)'); return }
    setImportando(true)
    try {
      const res = await fetch('/api/admin/importar-imoveis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl: importUrl.trim() }),
      })
      const d = await res.json()
      if (!res.ok) { notify.bad(d.error ?? 'Falha na importação'); return }
      if (d.aviso) notify.warn(d.aviso)
      else notify.ok(`Importação concluída: ${d.criados} novos, ${d.atualizados} atualizados (${d.total} no feed).`)
      setUltima(new Date().toISOString())
    } catch { notify.bad('Erro de conexão') }
    setImportando(false)
  }

  const snippet = `<!-- Formulário de contato — envia leads pro CRM Nexus -->
<form id="apice-lead">
  <input name="nome" placeholder="Seu nome" required />
  <input name="telefone" placeholder="WhatsApp" required />
  <input name="email" placeholder="E-mail" />
  <textarea name="mensagem" placeholder="Mensagem"></textarea>
  <input type="hidden" name="imovel" value="" />
  <button type="submit">Enviar</button>
</form>
<script>
document.getElementById('apice-lead').addEventListener('submit', async function (e) {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(this).entries());
  await fetch('${formEndpoint}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
  alert('Recebemos seu contato! Em breve retornaremos.');
  this.reset();
});
</script>`

  // Portais e site: capacidade. Concessionária também publica em portal, e um dia
  // vai querer isto — sem editar esta tela.
  const isImob = !!SEGMENTOS[normalizarSegmento(segmento)].capacidades.integraPortais

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Integrações" />
      <main className="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-6 scrollbar-thin">
        <div className="mx-auto max-w-[860px]">
          <p className="mb-6 text-[14px] text-ink-2">
            {isImob ? 'Conecte seus canais, seu site e os portais — capte leads de todos os lados.' : 'Conecte seus canais de atendimento ao CRM.'}
          </p>

          <div className="space-y-4">
            {/* CONECTAR ACONTECE AQUI, não noutra tela.
                Havia dois menus para a mesma coisa — "Canais" e "Integrações" — e
                o card daqui só empurrava para um terceiro lugar
                (/admin/configuracoes). Quem quer ligar o WhatsApp abria os três
                até achar o botão. Agora o conector de verdade mora aqui. */}
            <IntegracaoCard icon={MessageCircle} titulo="Canais de atendimento" desc="WhatsApp, Instagram e Facebook — receba e responda mensagens dentro do CRM. No WhatsApp, o número continua funcionando no seu celular.">
              <CanaisView appId={appId} />
            </IntegracaoCard>

            {isImob && (<>
            {/* Contact2Sale: por onde a imobiliária recebe lead hoje. Vem antes do
                resto porque é a fonte que já está em produção na operação dela. */}
            {c2s && <C2SCard estado={c2s} eventos={eventosC2S} />}

            {/* Importar imóveis do site */}
            <IntegracaoCard icon={DownloadCloud} titulo="Conectar seu site (importar imóveis)" desc="Seu site continua o dono dos imóveis; o CRM importa o acervo do XML que ele já gera pros portais.">
              <label className="mb-1.5 block text-[12px] font-medium text-ink-2">URL do feed XML de imóveis</label>
              <div className="flex gap-2">
                <Input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://seusite.com.br/feed.xml" wrapperClassName="flex-1" />
                <Button onClick={importar} loading={importando} icon={<DownloadCloud size={15} strokeWidth={1.7} />} className="shrink-0">
                  {importando ? 'Importando…' : 'Importar agora'}
                </Button>
              </div>
              {ultima && <p className="mt-2 text-[11.5px] text-ink-3">Última importação: {new Date(ultima).toLocaleString('pt-BR')}</p>}
              <p className="mt-1 text-[11.5px] text-ink-3">Dica: no painel do seu site/Kenlo, a URL do feed fica em Integrações → Portais.</p>
            </IntegracaoCard>

            {/* Portais */}
            <IntegracaoCard icon={Rss} titulo="Portais (ZAP, VivaReal, OLX)" desc="Publique seus imóveis nos portais e receba os leads de volta no CRM.">
              <div className="space-y-2">
                <UrlLinha label="ENVIAR IMÓVEIS →" url={feedUrl} onCopy={() => copiar(feedUrl, 'URL do feed copiada!')} />
                <UrlLinha label="← RECEBER LEADS" url={leadsUrl} onCopy={() => copiar(leadsUrl, 'URL de leads copiada!')} />
              </div>
              <p className="mt-2 text-[11.5px] text-ink-3">No Canal Pro (Grupo OLX): cole a 1ª em “integração de imóveis” e a 2ª em “receber leads no CRM”.</p>
            </IntegracaoCard>

            {/* Formulário do site */}
            <IntegracaoCard icon={Code2} titulo="Formulário no seu site" desc="Cole este código no site e os contatos viram leads no CRM (roleta automática).">
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-control bg-ink/[0.04] px-3 py-2 text-[12px] text-ink-2">&lt;form&gt; … envia leads pro CRM</code>
                <Button variant="outline" onClick={() => copiar(snippet, 'Código do formulário copiado!')} icon={<Copy size={13} strokeWidth={1.7} />} className="shrink-0">Copiar código</Button>
              </div>
            </IntegracaoCard>

            {/* Site ÁPICE */}
            <IntegracaoCard icon={Globe} titulo="Site público Nexus" desc="Não tem site? Use o nosso — vitrine pronta com seus imóveis, busca e WhatsApp.">
              <div className="flex items-center gap-2">
                <code className="num flex-1 truncate rounded-control bg-ink/[0.04] px-3 py-2 text-[12px] text-ink-2">{siteUrl || `/imob/${slug}`}</code>
                <a href={`/imob/${slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-line bg-card px-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-bg"><ExternalLink size={13} strokeWidth={1.7} /> Abrir</a>
                <IconButton aria-label="Copiar" size="sm" onClick={() => copiar(siteUrl, 'Link do site copiado!')}><Copy size={14} strokeWidth={1.7} /></IconButton>
              </div>
            </IntegracaoCard>
            </>)}
          </div>
        </div>
      </main>
    </div>
  )
}
