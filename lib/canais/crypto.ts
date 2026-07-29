import crypto from 'crypto'

// ============================================================
// Criptografia dos tokens de canal (WhatsApp Cloud / Instagram / Messenger).
// AES-256-GCM, mesmo formato de lib/payments/crypto.ts:
//   base64(iv).base64(authTag).base64(ciphertext)
//
// Chave PRÓPRIA (CHANNEL_ENCRYPTION_KEY), separada da de pagamentos de propósito:
// os tokens de canal são "Never expire" por escolha de arquitetura, então valem mais
// para um atacante — vazar a chave de pagamento não pode entregar os canais, e
// vice-versa. É o único motivo da duplicação com lib/payments/crypto.ts.
//
// Sem a env, encriptar FALHA ALTO (não grava token em texto puro por acidente).
// ============================================================

function getKey(): Buffer {
  const raw = process.env.CHANNEL_ENCRYPTION_KEY?.trim()
  if (!raw) {
    throw new Error(
      'CHANNEL_ENCRYPTION_KEY não configurada — conectar canal está bloqueado. ' +
      'Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    )
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64')

  if (key.length !== 32) {
    throw new Error(
      `CHANNEL_ENCRYPTION_KEY inválida: esperado 32 bytes, obtido ${key.length}. ` +
      'Use 64 chars hex ou base64 de 32 bytes.'
    )
  }
  return key
}

/** Cifra o token do canal para gravar em canais_conectados.access_token_enc. */
export function cifrarToken(token: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    enc.toString('base64'),
  ].join('.')
}

/** Decifra o token. Só roda no servidor, com service role — nunca no client. */
export function decifrarToken(cifrado: string): string {
  const key = getKey()
  const [ivB64, tagB64, dataB64] = cifrado.split('.')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Token de canal com formato inválido')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

/** True se a env está presente e válida — para a UI avisar antes de tentar conectar. */
export function cofreConfigurado(): boolean {
  try {
    getKey()
    return true
  } catch {
    return false
  }
}
