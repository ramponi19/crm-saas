import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { lerPresetParaPreview } from '@/lib/presets'
import { entrarNaEmpresaDePreview } from '@/lib/superadmin-preview'

/**
 * Preview de um preset: aplica o preset escolhido na empresa de demonstração e
 * entra nela. O trabalho mora em lib/superadmin-preview.ts (o mesmo
 * do laboratório).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params
  // A checagem de superadmin vem ANTES de ler presets: quem não é superadmin não
  // descobre quais presets existem pelo 404.
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error

  const preset = await lerPresetParaPreview(createServiceClient(), chave)
  if (!preset) return NextResponse.json({ error: 'Preset não encontrado' }, { status: 404 })
  return entrarNaEmpresaDePreview(preset)
}
