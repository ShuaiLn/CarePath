import type { ReactNode } from 'react'

interface BannerProps {
  tone?: 'warning' | 'info' | 'danger'
  children: ReactNode
}

const TONE_CLASSES: Record<NonNullable<BannerProps['tone']>, string> = {
  warning: 'bg-amber-50 border-amber-300 text-amber-900',
  info: 'bg-slate-50 border-slate-300 text-slate-700',
  danger: 'bg-red-50 border-red-300 text-red-900',
}

export function Banner({ tone = 'warning', children }: BannerProps) {
  return (
    <div className={`w-full rounded-lg border px-4 py-3 text-sm leading-relaxed ${TONE_CLASSES[tone]}`}>
      {children}
    </div>
  )
}
