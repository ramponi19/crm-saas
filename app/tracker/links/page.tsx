import { LinksView } from '@/components/tracker/links-view'

export const metadata = { title: 'Links · Tracker Ads' }
export const dynamic = 'force-dynamic'

export default function LinksPage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return <LinksView appUrl={appUrl} />
}
