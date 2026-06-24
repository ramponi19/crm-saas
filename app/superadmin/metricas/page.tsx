const ADMIN_COR = '#7C3AED'

export default function MetricasPage() {
  return (
    <div className="px-8 py-7 max-w-[1400px]">
      <div className="mb-6">
        <p className="font-mono text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: ADMIN_COR }}>
          Painel global
        </p>
        <h1 className="font-sans font-extrabold text-[26px] text-[#16212E] tracking-tight">
          Métricas
        </h1>
        <p className="text-[14px] text-[#788698] mt-1">
          Gráficos de crescimento, MRR por plano e empresas próximas do limite
        </p>
      </div>
      <div className="bg-white border border-[#16212E]/[0.08] rounded-[16px] p-12 text-center">
        <p className="text-[14px] text-[#9AA7B6]">
          Métricas detalhadas serão implementadas na Etapa B.
        </p>
      </div>
    </div>
  )
}
