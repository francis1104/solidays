import { defaultCards } from '@/data/cards'

export const dynamic = 'force-static'

export function GET() {
  // This route is the migration point for D1-backed structured data.
  return Response.json(defaultCards)
}
