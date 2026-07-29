// Alvo de PREVIEW da webhook-leads. Não tem lógica própria de propósito:
// importa o arquivo real, então o que se testa aqui é byte a byte o que vai
// para produção. A Meta continua apontando para `webhook-leads`, então subir
// este preview não afeta canal nenhum.
//
// Deploy: supabase functions deploy webhook-leads-preview --no-verify-jwt
// Apagar quando a v27 for promovida.
import "../webhook-leads/index.ts";
