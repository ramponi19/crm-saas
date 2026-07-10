// Chave pública VAPID (segura de expor no cliente). A PRIVADA fica só em env (server).
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BGpwRRfW3_cu_XJLONGI1HBS66gqPH0Qitn4GN7AMFfxSM_8aFVPsE2A5XHPQA-IaFz05tye6AOPNL1K4wPT9Js'
