export default function Loading() {
  return (
    <div className="flex flex-col gap-4 p-6 animate-pulse">
      <div className="flex gap-3">
        <div className="h-10 flex-1 rounded-lg bg-[#F0F3F7]" />
        <div className="h-10 w-32 rounded-lg bg-[#F0F3F7]" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-[#F0F3F7]" />
        ))}
      </div>
    </div>
  )
}
