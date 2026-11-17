/**
 * Envio de e-mail transacional — agnóstico e seguro por padrão.
 *
 * Usa a API do Resend via fetch (sem dependência). Se RESEND_API_KEY / EMAIL_FROM
 * não estiverem configurados, vira NO-OP (loga e segue) — nunca quebra o fluxo
 * que o chamou. Basta setar as envs para começar a enviar de verdade.
 */

interface EmailInput {
  to: string
  subject: string
  html: string
}

export async function enviarEmail(input: EmailInput): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!key || !from) {
    console.log('[email] provider não configurado (RESEND_API_KEY/EMAIL_FROM) — envio pulado para', input.to)
    return { ok: true, skipped: true }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error('[email] falha no envio:', res.status, txt)
      return { ok: false, error: txt || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    console.error('[email] exceção no envio:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'erro desconhecido' }
  }
}

/** Template de boas-vindas (Precisão: sem emoji, cobalto como acento). */
export function emailBoasVindas(nome: string, nomeEmpresa: string): { subject: string; html: string } {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://nexus.app'
  const primeiroNome = nome.trim().split(' ')[0] || nome
  const subject = `Bem-vindo ao Nexus, ${primeiroNome}`
  const html = `
  <div style="font-family:Geist,Arial,sans-serif;background:#FAFAF9;padding:32px;color:#15181C">
    <div style="max-width:480px;margin:0 auto;background:#FCFCFB;border:1px solid #E7E6E3;border-radius:12px;padding:32px">
      <h1 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 8px">Bem-vindo ao Nexus</h1>
      <p style="font-size:14px;line-height:1.55;color:#5C6470;margin:0 0 16px">
        Olá ${primeiroNome}, a conta da <strong style="color:#15181C">${nomeEmpresa}</strong> está pronta.
        Seu período de teste começou — é hora de configurar seus canais e receber os primeiros leads.
      </p>
      <a href="${base}/dashboard"
         style="display:inline-block;background:#15181C;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">
        Acessar o painel
      </a>
      <p style="font-size:12px;color:#9199A3;margin:24px 0 0">
        Precisa de ajuda? Responda este e-mail. — Equipe Nexus
      </p>
    </div>
  </div>`
  return { subject, html }
}

/** Escapa o que vai para o HTML do e-mail (nome digitado pelo dono). */
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))

/**
 * Convite para a equipe (17/11/2026): a pessoa abre o link, cria a senha e entra. O link vem do
 * Supabase Auth (`generateLink` tipo invite) e vale por tempo limitado.
 */
export function emailConvite(nome: string, nomeEmpresa: string, link: string): { subject: string; html: string } {
  const primeiroNome = esc(nome.trim().split(' ')[0] || nome)
  const empresa = esc(nomeEmpresa)
  const subject = `Você foi convidado para a equipe da ${nomeEmpresa} no Nexus`
  const html = `
  <div style="font-family:Geist,Arial,sans-serif;background:#FAFAF9;padding:32px;color:#15181C">
    <div style="max-width:480px;margin:0 auto;background:#FCFCFB;border:1px solid #E7E6E3;border-radius:12px;padding:32px">
      <h1 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 8px">Convite para a equipe</h1>
      <p style="font-size:14px;line-height:1.55;color:#5C6470;margin:0 0 16px">
        Olá ${primeiroNome}, você foi convidado para a equipe da <strong style="color:#15181C">${empresa}</strong>.
        Crie sua senha para entrar.
      </p>
      <a href="${link}"
         style="display:inline-block;background:#15181C;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">
        Criar minha senha
      </a>
      <p style="font-size:12px;color:#9199A3;margin:24px 0 0">Se você não esperava este convite, ignore este e-mail.</p>
    </div>
  </div>`
  return { subject, html }
}

/** Confirmação do e-mail do cadastro (só com EXIGIR_CONFIRMACAO_EMAIL=1). */
export function emailConfirmacao(nome: string, link: string): { subject: string; html: string } {
  const primeiroNome = esc(nome.trim().split(' ')[0] || nome)
  return {
    subject: 'Confirme seu e-mail para entrar no Nexus',
    html: `
  <div style="font-family:Geist,Arial,sans-serif;background:#FAFAF9;padding:32px;color:#15181C">
    <div style="max-width:480px;margin:0 auto;background:#FCFCFB;border:1px solid #E7E6E3;border-radius:12px;padding:32px">
      <h1 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 8px">Confirme seu e-mail</h1>
      <p style="font-size:14px;line-height:1.55;color:#5C6470;margin:0 0 16px">Olá ${primeiroNome}, falta só confirmar o e-mail para entrar.</p>
      <a href="${link}" style="display:inline-block;background:#15181C;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">Confirmar e entrar</a>
    </div>
  </div>`,
  }
}
