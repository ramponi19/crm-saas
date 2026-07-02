'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Globe, Rss, Code2, DownloadCloud, Loader2, Copy, ExternalLink, MessageCircle, Instagram, Facebook, ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'

const GOLD = '#C9A24B'

function Card({ icon: Icon, titulo, desc, children }: { icon: typeof Globe; titulo: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-[40px] h-[40px] rounded-[11px] flex items-center justify-center shrink-0" style={{ background: `${GOLD}18`, color: GOLD }}><Icon size={20} /></div>
        <div>
          <h3 className="text-[15px] font-bold text-[#16212E]">{titulo}</h3>
          <p className="text-[12.5px] text-[#788698] mt-0.5">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function UrlLinha({ label, url, onCopy }: { label: string; url: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 bg-[#16212E]/[0.03] rounded-[10px] px-3 py-2">
      <span className="text-[11px] font-mono text-[#788698] shrink-0">{label}</span>
      <code className="text-[12px] text-[#56657A] truncate flex-1">{url}</code>
      <button onClick={onCopy} className="text-[#788698] hover:text-[#16212E] shrink-0" aria-label="Copiar"><Copy size={14} /></button>
    </div>
  )
}

export default function IntegracoesView({ slug, segmento, token, feedUrlInicial, ultimaImportacao }: {
  slug: string; segmento: string; token: string; feedUrlInicial: string; ultimaImportacao: string | null
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
    navigator.clipboard.writeText(txt).then(() => toast.success(msg)).catch(() => toast.error('Não foi possível copiar'))

  async function importar() {
    if (!/^https?:\/\//i.test(importUrl.trim())) { toast.error('Cole a URL do feed XML (http/https)'); return }
    setImportando(true)
    try {
      const res = await fetch('/api/admin/importar-imoveis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl: importUrl.trim() }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error ?? 'Falha na importação'); return }
      if (d.aviso) toast.warning(d.aviso)
      else toast.success(`Importação concluída: ${d.criados} novos, ${d.atualizados} atualizados (${d.total} no feed).`)
      setUltima(new Date().toISOString())
    } catch { toast.error('Erro de conexão') }
    setImportando(false)
  }

  const snippet = `<!-- Formulário de contato — envia leads pro CRM ÁPICE -->
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

  const isImob = segmento === 'imobiliaria'

  return (
    <div className="px-8 py-8 max-w-[860px]">
      <div className="mb-7">
        <h1 className="font-serif font-medium text-[26px] tracking-[-0.02em] text-[#16212E] leading-tight">Integrações</h1>
        <p className="text-[14px] text-[#788698] mt-1">
          {isImob ? 'Conecte seus canais, seu site e os portais — capte leads de todos os lados.' : 'Conecte seus canais de atendimento ao CRM.'}
        </p>
      </div>

      <div className="space-y-4">
        {/* Canais de atendimento — todos os segmentos */}
        <Card icon={MessageCircle} titulo="Canais de atendimento" desc="WhatsApp, Instagram e Facebook — receba e responda mensagens dentro do CRM.">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(37,211,102,0.12)', color: '#128C4B' }}><MessageCircle size={14} /> WhatsApp</span>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(221,42,123,0.12)', color: '#C1256B' }}><Instagram size={14} /> Instagram</span>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(10,124,255,0.12)', color: '#0A66C2' }}><Facebook size={14} /> Facebook</span>
            <Link href="/admin/configuracoes" className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[12.5px] font-semibold text-white" style={{ background: 'linear-gradient(135deg, #C9A24B, #A8884A)' }}>
              Configurar canais <ArrowUpRight size={14} />
            </Link>
          </div>
        </Card>

        {isImob && (<>
        {/* Importar imóveis do site */}
        <Card icon={DownloadCloud} titulo="Conectar seu site (importar imóveis)" desc="Seu site continua o dono dos imóveis; o CRM importa o acervo do XML que ele já gera pros portais.">
          <label className="block font-mono text-[10px] tracking-[0.12em] text-[#788698] mb-1.5">URL DO FEED XML DE IMÓVEIS</label>
          <div className="flex gap-2">
            <input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://seusite.com.br/feed.xml"
              className="flex-1 bg-[#16212E]/[0.04] border border-[#16212E]/[0.12] rounded-[10px] px-3 py-2.5 text-[13.5px] text-[#16212E] outline-none focus:border-[#16212E]/35" />
            <button onClick={importar} disabled={importando}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[13.5px] font-semibold text-white shrink-0 disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${GOLD}, #A8884A)` }}>
              {importando ? <><Loader2 size={15} className="animate-spin" /> Importando…</> : <><DownloadCloud size={15} /> Importar agora</>}
            </button>
          </div>
          {ultima && <p className="text-[11.5px] text-[#9AA7B6] mt-2">Última importação: {new Date(ultima).toLocaleString('pt-BR')}</p>}
          <p className="text-[11.5px] text-[#9AA7B6] mt-1">Dica: no painel do seu site/Kenlo, a URL do feed fica em Integrações → Portais.</p>
        </Card>

        {/* Portais */}
        <Card icon={Rss} titulo="Portais (ZAP, VivaReal, OLX)" desc="Publique seus imóveis nos portais e receba os leads de volta no CRM.">
          <div className="space-y-2">
            <UrlLinha label="ENVIAR IMÓVEIS →" url={feedUrl} onCopy={() => copiar(feedUrl, 'URL do feed copiada!')} />
            <UrlLinha label="← RECEBER LEADS" url={leadsUrl} onCopy={() => copiar(leadsUrl, 'URL de leads copiada!')} />
          </div>
          <p className="text-[11.5px] text-[#9AA7B6] mt-2">No Canal Pro (Grupo OLX): cole a 1ª em “integração de imóveis” e a 2ª em “receber leads no CRM”.</p>
        </Card>

        {/* Formulário do site */}
        <Card icon={Code2} titulo="Formulário no seu site" desc="Cole este código no site e os contatos viram leads no CRM (roleta automática).">
          <div className="flex items-center gap-2">
            <code className="text-[12px] text-[#56657A] truncate flex-1 bg-[#16212E]/[0.03] rounded-[10px] px-3 py-2">&lt;form&gt; … envia leads pro CRM</code>
            <button onClick={() => copiar(snippet, 'Código do formulário copiado!')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-[12.5px] font-semibold text-[#16212E] border border-[#16212E]/[0.15] hover:bg-[#16212E]/[0.03] shrink-0"><Copy size={13} /> Copiar código</button>
          </div>
        </Card>

        {/* Site ÁPICE */}
        <Card icon={Globe} titulo="Site público ÁPICE" desc="Não tem site? Use o nosso — vitrine pronta com seus imóveis, busca e WhatsApp.">
          <div className="flex items-center gap-2">
            <code className="text-[12px] text-[#56657A] truncate flex-1 bg-[#16212E]/[0.03] rounded-[10px] px-3 py-2">{siteUrl || `/imob/${slug}`}</code>
            <a href={`/imob/${slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-[12.5px] font-semibold text-[#16212E] border border-[#16212E]/[0.15] hover:bg-[#16212E]/[0.03] shrink-0"><ExternalLink size={13} /> Abrir</a>
            <button onClick={() => copiar(siteUrl, 'Link do site copiado!')} className="text-[#788698] hover:text-[#16212E] shrink-0" aria-label="Copiar"><Copy size={14} /></button>
          </div>
        </Card>
        </>)}
      </div>
    </div>
  )
}
