import { cn } from '@/lib/utils'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/** Placeholder de carregamento. Use w-/h- para dimensionar. */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded-control bg-ink/[0.06]', className)} {...props} />
}
