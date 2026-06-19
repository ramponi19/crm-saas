import { LoginForm } from '@/components/modules/auth/login-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Entrar' }

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(130%_120%_at_50%_-10%,#13243C_0%,#0C1828_45%,#070E18_100%)] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Aurora blobs */}
      <div className="absolute top-[-12%] left-[8%] w-[520px] h-[520px] rounded-full bg-[radial-gradient(circle,rgba(215,40,47,0.34),transparent_68%)] blur-[36px] animate-[drift1_16s_ease-in-out_infinite] pointer-events-none" />
      <div className="absolute bottom-[-18%] right-[6%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(127,176,232,0.18),transparent_66%)] blur-[44px] animate-[drift2_21s_ease-in-out_infinite] pointer-events-none" />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(120% 90% at 50% 30%, #000 30%, transparent 75%)',
        }}
      />

      <div className="relative z-10 w-full max-w-[412px] flex flex-col items-center animate-fade-up">
        {/* Logo */}
        <div className="relative w-[100px] h-[100px] flex items-center justify-center mb-5">
          <div className="absolute inset-0 rounded-full border border-dashed border-[rgba(198,168,106,0.4)] animate-spin" style={{ animationDuration: '26s' }} />
          <div className="absolute inset-[-9px] rounded-full border border-dashed border-[rgba(240,101,107,0.22)] animate-spin" style={{ animationDuration: '38s', animationDirection: 'reverse' }} />
          <div className="w-[80px] h-[80px] rounded-full bg-gradient-to-br from-[#FBF8F0] to-[#DBD4C4] flex items-center justify-center shadow-[0_0_60px_rgba(215,40,47,0.55)]">
            <span className="font-sans font-extrabold text-[28px] text-[#0A111E] tracking-tight">JM</span>
          </div>
        </div>

        {/* Wordmark */}
        <div className="text-center mb-6">
          <div className="font-serif font-medium text-[34px] tracking-[-0.02em] text-[#F4F6F9] leading-none">
            JM Store <span className="italic text-[#F0656B]">Importados</span>
          </div>
          <div className="font-mono text-[10.5px] tracking-[0.42em] text-[#7E8EA2] mt-3">PAINEL DE GESTÃO</div>
        </div>

        {/* Card */}
        <div className="w-full bg-[rgba(18,32,54,0.62)] backdrop-blur-[18px] border border-white/[0.09] rounded-[22px] shadow-[0_30px_80px_rgba(0,0,0,0.5)] p-[30px_28px]">
          <div className="text-[18px] font-bold text-[#F4F6F9] mb-1">Bem-vindo de volta</div>
          <div className="text-[13px] text-[#8A9BB0] mb-6">Entre para acessar sua operação.</div>
          <LoginForm />
        </div>

        <div className="flex items-center gap-2 mt-6 text-[11.5px] text-[#5C6E84]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Acesso seguro · CRM SaaS © {new Date().getFullYear()}
        </div>
      </div>
    </div>
  )
}
