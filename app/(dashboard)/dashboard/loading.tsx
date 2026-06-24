export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-[#F0F3F7]" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-64 rounded-xl bg-[#F0F3F7]" />
        <div className="h-64 rounded-xl bg-[#F0F3F7]" />
      </div>
      <div className="h-48 rounded-xl bg-[#F0F3F7]" />
    </div>
  )
}
