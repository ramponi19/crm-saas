'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_SCORE_CONFIG, type ScoreConfig } from '@/lib/lead-score'

const Ctx = createContext<ScoreConfig>(DEFAULT_SCORE_CONFIG)

export function ScoreConfigProvider({ value, children }: { value: ScoreConfig; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useScoreConfig = () => useContext(Ctx)
