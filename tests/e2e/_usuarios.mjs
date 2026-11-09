// E-mails dos usuários de teste do banco LOCAL. Ficam fora do git (são pessoas reais):
// tests/e2e/usuarios.local.json, no formato de usuarios.example.json. A senha é só local
// (tools/banco/montar-local.sh grava 'teste-local-22' nesses usuários).
import fs from 'node:fs'

const arq = `${import.meta.dirname}/usuarios.local.json`
if (!fs.existsSync(arq)) {
  console.error(`Falta ${arq}: copie usuarios.example.json e preencha os e-mails (ver LEIA-ME.md).`)
  process.exit(2)
}
export const USUARIOS = JSON.parse(fs.readFileSync(arq, 'utf8'))
const por = (f) => USUARIOS.find(f)?.email
export const E = {
  dono: por((u) => u.papel === 'owner'),
  vend_mogi: por((u) => u.nome === 'vend-mogi'),
  vend_jag: por((u) => u.nome === 'vend-jag'),
  superadmin: por((u) => u.nome === 'superadmin'),
}
