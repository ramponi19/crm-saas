export default function Loading() {
  return (
    <div className="flex gap-4 p-6 animate-pulse overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 min-w-[220px]">
          <div className="h-8 rounded-lg bg-[#F0F3F7]" />
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="h-24 rounded-xl bg-[#F0F3F7]" />
          ))}
        </div>
      ))}
    </div>
  )
}
