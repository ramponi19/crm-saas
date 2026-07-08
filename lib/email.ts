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
