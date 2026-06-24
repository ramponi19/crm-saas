export default function Loading() {
  return (
    <div className="flex gap-6 p-6 animate-pulse h-[calc(100vh-64px)]">
      <div className="flex-1 flex flex-col gap-3">
        <div className="h-10 rounded-lg bg-[#F0F3F7]" />
        <div className="grid grid-cols-2 gap-3 flex-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-[#F0F3F7]" />
          ))}
        </div>
      </div>
      <div className="w-80 flex flex-col gap-3">
        <div className="h-10 rounded-lg bg-[#F0F3F7]" />
        <div className="flex-1 rounded-xl bg-[#F0F3F7]" />
        <div className="h-14 rounded-xl bg-[#F0F3F7]" />
      </div>
    </div>
  )
}
