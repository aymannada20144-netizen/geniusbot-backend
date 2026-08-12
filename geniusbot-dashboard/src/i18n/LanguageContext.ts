import { createContext } from 'react'

import type { Language } from './translations'

export type LanguageContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: string) => string
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)
