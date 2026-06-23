import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// Uses sessionStorage so the session is cleared when the browser/tab closes.
// localStorage (the default) would persist across restarts.
const sessionStorageAdapter = typeof window !== 'undefined'
  ? {
      getItem: (key: string) => window.sessionStorage.getItem(key),
      setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value),
      removeItem: (key: string) => window.sessionStorage.removeItem(key),
    }
  : undefined

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { storage: sessionStorageAdapter } }
  )
}
