import { Megaphone, Facebook } from 'lucide-react'
import { InvestimentoForm } from '@/components/tracker/investimento-form'

export const metadata = { title: 'Rastreamento · Campanhas · Tracker Ads' }

const C = { card: '#ffffff', ink: '#111e26', ink2: '#3a4b57', ink3: '#6b7680', line: '#e2e8ec', teal: '#00a884' }

export default function CampanhasPage() {
  return (
    <div className="px-5 py-5 sm:px-7">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[10px]" style={{ background: 'rgba(0,168,132,0.10)', color: C.teal }}><Megaphone size={18} strokeWidth={1.9} /></span>
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Campanhas da Página</h2>
          <p className="text-[12.5px]" style={{ color: C.ink3 }}>Gasto, alcance e resultados das suas campanhas Meta, comparados com o CRM.</p>
        </div>
      </div>

      <div className="mb-4"><InvestimentoForm /></div>

      <div className="grid min-h-[220px] place-items-center rounded-[14px] border" style={{ borderColor: C.line, background: C.card }}>
        <div className="max-w-sm text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full" style={{ background: '#eaf1fb', color: '#1877f2' }}><Facebook size={22} strokeWidth={1.8} /></span>
          <h3 className="text-[15px] font-semibold" style={{ color: C.ink, fontFamily: 'var(--font-sora)' }}>Conecte a Meta para ver suas campanhas</h3>
          <p className="mt-1 text-[13px]" style={{ color: C.ink2 }}>
            Ao conectar a Meta Marketing API, trazemos gasto, CPM e resultados de cada campanha para comparar com os leads e vendas do CRM (Investimento, CAC e ROAS reais).
          </p>
          <button className="mt-4 inline-flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: '#1877f2' }} disabled>
            <Facebook size={15} /> Conectar Meta (em breve)
          </button>
          <p className="mt-2 text-[11.5px]" style={{ color: C.ink3 }}>A conexão é ativada no módulo de integração Meta.</p>
        </div>
      </div>
    </div>
  )
}
