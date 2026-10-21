import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/superadmin'
import { createServiceClient } from '@/lib/supabase/service'
import { entrarNaEmpresaDePreview } from '@/lib/superadmin-preview'

/**
 * Preview de um segmento: troca o segmento da empresa de demonstração para o
 * escolhido e entra nela. O trabalho mora em lib/superadmin-preview.ts (o mesmo
 * do laboratório).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params
  // A checagem de superadmin vem ANTES de ler presets: quem não é superadmin não
  // descobre quais segmentos existem pelo 404.
  const ctx = await requireSuperAdminApi()
  if (ctx.error) return ctx.error

  const { data: preset } = await createServiceClient().from('presets_onboarding').select('chave, nome').eq('chave', chave).maybeSingle()
  if (!preset) return NextResponse.json({ error: 'Segmento não encontrado' }, { status: 404 })
  return entrarNaEmpresaDePreview({ chave: preset.chave, label: preset.nome })
}
