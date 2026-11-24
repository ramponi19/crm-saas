/** Esqueleto da fila do pós-venda: a navegação responde na hora e o dado entra em cima. */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 p-4 animate-pulse">
      <div className="h-8 w-40 rounded-control bg-line-soft" />
      <div className="h-9 rounded-control bg-line-soft" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[104px] rounded-card bg-line-soft" />
      ))}
    </div>
  )
}
