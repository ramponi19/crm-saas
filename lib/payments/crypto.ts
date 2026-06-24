import crypto from 'crypto'

// ============================================================
// Criptografia das credenciais de pagamento dos tenants.
// AES-256-GCM. A chave vem de PAYMENT_ENCRYPTION_KEY (32 bytes em hex/base64),
// nunca toca o banco. Formato armazenado: base64(iv).base64(authTag).base64(ciphertext)
// ============================================================

function getKey(): Buffer {
  const raw = process.env.PAYMENT_ENCRYPTION_KEY
  if (!raw) throw new Error('PAYMENT_ENCRYPTION_KEY não configurada')
  // Aceita hex (64 chars) ou base64
  const key = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('PAYMENT_ENCRYPTION_KEY deve ter 32 bytes (64 hex ou base64 equivalente)')
  }
  return key
}

export function encryptCredenciais(obj: Record<string, string>): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const plaintext = JSON.stringify(obj)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64'),
  ].join('.')
}

export function decryptCredenciais(cipherText: string): Record<string, string> {
  const key = getKey()
  const [ivB64, tagB64, dataB64] = cipherText.split('.')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Formato de credenciais inválido')
  }
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(dec.toString('utf8')) as Record<string, string>
}
