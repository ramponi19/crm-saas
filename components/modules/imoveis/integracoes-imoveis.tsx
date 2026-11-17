'use client'

import { useState } from 'react'
import { useOrigem } from '@/lib/navegador'
import { Globe, Rss, Code2, DownloadCloud, Copy, ExternalLink } from 'lucide-react'
import { Button, IconButton, Input, notify } from '@/components/ui'
import { IntegracaoCard, UrlLinha } from '@/components/modules/configuracoes/integracao-card'
import { useFuso } from '@/components/fuso-provider'
import { formatarDataHora } from '@/lib/datas'

/**
 * O QUE O MÓDULO IMÓVEIS PÕE EM INTEGRAÇÕES (17/11/2026; até aqui morava na tela do core):
 * importar o acervo do site, portais (ZAP, VivaReal, OLX), formulário do site e a vitrine
 * pública. A tela de Integrações só renderiza isto com a capacidade `integraPortais`.
 *
 * Endereços SEM token (22/10/2026): o token vai no cabeçalho `Authorization: Bearer`, nunca na
 * URL, e nasce na instalação do módulo Imóveis (cifrado em empresa_segredos).
 */
export function IntegracoesImoveis({ slug, tokenPortal, feedUrlInicial, ultimaImportacao }: {
  slug: string
  /** Token de portal e site (nasce na instalação do Imóveis). Null = ainda não gerado. */
  tokenPortal: string | null
  feedUrlInicial: string
  ultimaImportacao: string | null
}) {
  const base = useOrigem()
  const fuso = useFuso()

  const feedUrl = `${base}/api/portais/${slug}`
  const leadsUrl = `${base}/api/portais/${slug}/leads`
  const siteUrl = `${base}/imob/${slug}`
  const formEndpoint = `${base}/api/imob/${slug}/lead`

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
  await fetch('${formEndpoint}', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer SEU_TOKEN' }, body: JSON.stringify(dados) });
  alert('Recebemos seu contato! Em breve retornaremos.');
  this.reset();
});
</script>`

  return (
    <>
      {/* Importar imóveis do site */}
      <IntegracaoCard icon={DownloadCloud} titulo="Conectar seu site (importar imóveis)" desc="Seu site continua o dono dos imóveis; o CRM importa o acervo do XML que ele já gera pros portais.">
        <label className="mb-1.5 block text-[12px] font-medium text-ink-2">URL do feed XML de imóveis</label>
        <div className="flex gap-2">
          <Input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://seusite.com.br/feed.xml" wrapperClassName="flex-1" />
          <Button onClick={importar} loading={importando} icon={<DownloadCloud size={15} strokeWidth={1.7} />} className="shrink-0">
            {importando ? 'Importando…' : 'Importar agora'}
          </Button>
        </div>
        {ultima && <p className="mt-2 text-[11.5px] text-ink-3">Última importação: {formatarDataHora(ultima, undefined, '', fuso)}
</p>}
        <p className="mt-1 text-[11.5px] text-ink-3">Dica: no painel do seu site/Kenlo, a URL do feed fica em Integrações → Portais.</p>
      </IntegracaoCard>

      {/* Portais */}
      <IntegracaoCard icon={Rss} titulo="Portais (ZAP, VivaReal, OLX)" desc="Publique seus imóveis nos portais e receba os leads de volta no CRM.">
        <div className="space-y-2">
          <UrlLinha label="ENVIAR IMÓVEIS →" url={feedUrl} onCopy={() => copiar(feedUrl, 'URL do feed copiada!')} />
          <UrlLinha label="← RECEBER LEADS" url={leadsUrl} onCopy={() => copiar(leadsUrl, 'URL de leads copiada!')} />
          {tokenPortal
            ? <UrlLinha label="TOKEN (Bearer)" url={`•••••••• ${tokenPortal.slice(-4)}`} onCopy={() => copiar(tokenPortal, 'Token copiado!')} />
            : <p className="text-[11.5px] text-bad">O token ainda não foi gerado: reinstale o módulo Imóveis na Central de Módulos.</p>}
        </div>
        <p className="mt-2 text-[11.5px] text-ink-3">No Canal Pro (Grupo OLX): cole a 1ª em “integração de imóveis” e a 2ª em “receber leads no CRM”. Os leads chegam com o token do módulo Imóveis no cabeçalho <code>Authorization: Bearer</code>, nunca na URL.</p>
      </IntegracaoCard>

      {/* Formulário do site */}
      <IntegracaoCard icon={Code2} titulo="Formulário no seu site" desc="Cole este código no site e os contatos viram leads no CRM (roleta automática).">
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-control bg-ink/[0.04] px-3 py-2 text-[12px] text-ink-2">&lt;form&gt; … envia leads pro CRM</code>
          <Button variant="outline" onClick={() => copiar(snippet, 'Código do formulário copiado!')} icon={<Copy size={13} strokeWidth={1.7} />} className="shrink-0">Copiar código</Button>
        </div>
      </IntegracaoCard>

      {/* Site público */}
      <IntegracaoCard icon={Globe} titulo="Site público Nexus" desc="Não tem site? Use o nosso — vitrine pronta com seus imóveis, busca e WhatsApp.">
        <div className="flex items-center gap-2">
          <code className="num flex-1 truncate rounded-control bg-ink/[0.04] px-3 py-2 text-[12px] text-ink-2">{siteUrl || `/imob/${slug}`}</code>
          <a href={`/imob/${slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-line bg-card px-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-bg"><ExternalLink size={13} strokeWidth={1.7} /> Abrir</a>
          <IconButton aria-label="Copiar" size="sm" onClick={() => copiar(siteUrl, 'Link do site copiado!')}><Copy size={14} strokeWidth={1.7} /></IconButton>
        </div>
      </IntegracaoCard>
    </>
  )
}
