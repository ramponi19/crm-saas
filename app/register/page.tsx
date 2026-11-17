import { createServiceClient } from '@/lib/supabase/service'
import { lerPresets } from '@/lib/presets'
import { RegisterForm } from './register-form'
import { versoesVigentes } from '@/lib/termos'

/**
 * Cadastro. A lista de presets sai de presets_onboarding (29/10/2026): o cadastro
 * é um dos dois lugares do app que leem o preset — o outro são as ferramentas de
 * preset do superadmin. Quem aparece aqui é o que está ativo no banco.
 */
export default async function RegisterPage() {
  // Com as versões dos termos definidas (lib/termos.ts), o cadastro pede o aceite.
  return <RegisterForm presets={await lerPresets(createServiceClient())} pedirAceite={!!versoesVigentes()} />
}
