'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

type Card = {
  id: number
  song: string
  album: string
  content: string
}

type SongContextType = {
  cards: Card[]
  setCards: (cards: Card[]) => void
}

const SongContext = createContext<SongContextType | undefined>(undefined)

export function SongProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<Card[]>([])

  return <SongContext.Provider value={{ cards, setCards }}>{children}</SongContext.Provider>
}

export function useSongContext() {
  const context = useContext(SongContext)
  if (context === undefined) {
    throw new Error('useSongContext must be used within a SongProvider')
  }
  return context
}
