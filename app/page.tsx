import { redirect } from 'next/navigation'

// Single entry point: /entrar owns all role-based routing logic.
export default function Home() {
  redirect('/entrar')
}
