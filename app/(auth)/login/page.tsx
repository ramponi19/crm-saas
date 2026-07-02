import { LoginForm } from '@/components/modules/auth/login-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Entrar' }

export default function LoginPage() {
  return (
    <div
      className="fixed inset-0 overflow-hidden flex items-center justify-center p-6"
      style={{ background: 'radial-gradient(130% 120% at 50% -10%, #FFFFFF 0%, #F7F4EC 45%, #EFE9DC 100%)' }}
    >
      {/* Aurora blobs — gold / navy (identidade ÁPICE) */}
      <div className="absolute top-[-12%] left-[8%] w-[520px] h-[520px] rounded-full pointer-events-none blur-[36px] animate-[jmDrift1_16s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(201,162,75,.30), transparent 68%)' }} />
      <div className="absolute bottom-[-18%] right-[6%] w-[600px] h-[600px] rounded-full pointer-events-none blur-[44px] animate-[jmDrift2_21s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(20,30,44,.10), transparent 66%)' }} />
      <div className="absolute top-[30%] right-[24%] w-[360px] h-[360px] rounded-full pointer-events-none blur-[40px] animate-[jmDrift3_18s_ease-in-out_infinite]"
        style={{ background: 'radial-gradient(circle, rgba(201,162,75,.14), transparent 64%)' }} />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(22,35,50,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(22,35,50,.05) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(120% 90% at 50% 30%, #000 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(120% 90% at 50% 30%, #000 30%, transparent 75%)',
        }}
      />

      <div className="relative z-10 w-full max-w-[412px] flex flex-col items-center">
        {/* Emblema ÁPICE */}
        <div className="relative w-[120px] h-[120px] flex items-center justify-center mb-5">
          <div className="absolute rounded-full border border-dashed border-[rgba(201,162,75,.4)] animate-spin"
            style={{ inset: '-14px', animationDuration: '26s' }} />
          <div className="absolute rounded-full border border-dashed border-[rgba(20,30,44,.14)] animate-spin"
            style={{ inset: '-26px', animationDuration: '38s', animationDirection: 'reverse' }} />
          <div className="w-[100px] h-[100px] animate-[jmBob_6s_ease-in-out_infinite]">
            <img src="/eagle-navy.png" alt="ÁPICE" className="w-full h-full object-contain drop-shadow-xl" />
          </div>
        </div>

        {/* Wordmark ÁPICE */}
        <div className="text-center mb-6">
          <div className="font-serif font-medium text-[36px] tracking-[-0.01em] text-[#141E2C] leading-none">
            ÁPICE
          </div>
          <div className="font-mono text-[10.5px] tracking-[0.36em] text-[#7A6A45] mt-3 pl-[0.36em]">O CRM DO EMPREENDEDOR</div>
        </div>

        {/* Card */}
        <div
          className="w-full rounded-[22px] p-[30px_28px]"
          style={{
            background: 'rgba(255,255,255,.82)',
            backdropFilter: 'blur(18px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
            border: '1px solid rgba(22,35,50,.11)',
            boxShadow: '0 24px 60px rgba(22,35,50,.14)',
          }}
        >
          <div className="text-[18px] font-bold text-[#141E2C] mb-1">Bem-vindo de volta</div>
          <div className="text-[13px] text-[#566072] mb-5">Entre para acessar sua operação.</div>
          <LoginForm />
        </div>

        <div className="flex items-center gap-2 mt-6 text-[11.5px] text-[#8A96A6]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Acesso seguro · ÁPICE © {new Date().getFullYear()}
        </div>
      </div>

      <style>{`
        @keyframes jmDrift1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px,-30px) scale(1.12); } }
        @keyframes jmDrift2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-50px,30px) scale(1.18); } }
        @keyframes jmDrift3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,40px) scale(.9); } }
        @keyframes jmBob    { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
