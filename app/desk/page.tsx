import type { Metadata } from 'next'
import DeskExperience from '@/components/desk/DeskExperience'

export const metadata: Metadata = {
  title: 'The Desk',
  description: 'A quiet interactive desk for fragments, music, photographs and messages.',
}

export default function DeskPage() {
  return <DeskExperience />
}
