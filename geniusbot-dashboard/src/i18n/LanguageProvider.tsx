import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { arabicTranslations, type Language } from './translations'
import { LanguageContext } from './LanguageContext'

const STORAGE_KEY = 'geniusbot-dashboard-language'
const originalText = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()
const domainDisplayValues = new Set([
  'pending', 'confirmed', 'checked_in', 'cancelled',
  'completed', 'no_show', 'rescheduled', 'checkedIn', 'noShow',
])

function translateStatic(value: string, language: Language): string {
  if (language === 'en') return value
  const exact = arabicTranslations[value]
  if (exact) return exact
  let match = value.match(/^(\d+) appointments$/)
  if (match) return `${match[1]} مواعيد`
  match = value.match(/^(\d+) new bookings$/)
  if (match) return `${match[1]} حجوزات جديدة`
  return value
}

function localizedConfirmMessage(message: string, language: Language): string {
  if (language === 'en') return message
  const exact = arabicTranslations[message]
  if (exact) return exact

  let match = message.match(/^(Activate|Deactivate) room (.+)\?$/)
  if (match) {
    return match[1] === 'Activate'
      ? `هل تريد تفعيل الغرفة ${match[2]}؟`
      : `هل تريد تعطيل الغرفة ${match[2]}؟`
  }
  match = message.match(/^Permanently delete unused room (.+)\? Used rooms must be deactivated instead\.$/)
  if (match) return `هل تريد حذف الغرفة غير المستخدمة ${match[1]} نهائيًا؟ يجب تعطيل الغرف المستخدمة بدلًا من حذفها.`
  match = message.match(/^Delete (.+)\? This cannot be undone\.$/)
  if (match) return `هل تريد حذف ${match[1]}؟ لا يمكن التراجع عن هذا الإجراء.`
  match = message.match(/^Delete this (.+)\?$/)
  if (match) return `هل تريد حذف ${match[1]}؟`
  return message
}

function localizeTextNode(node: Text, language: Language) {
  if (node.parentElement?.closest('[data-i18n-ignore]')) return
  if (node.parentElement?.matches('td')) return
  if (node.parentElement?.matches('option') && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(node.parentElement.getAttribute('value') ?? '')) return
  const canonical = originalText.get(node) ?? node.data
  originalText.set(node, canonical)
  const trimmed = canonical.trim()
  if (!trimmed) return
  if (
    domainDisplayValues.has(trimmed) &&
    !node.parentElement?.closest('[data-i18n-domain-value]')
  ) return
  const localized = translateStatic(trimmed, language)
  node.data = canonical.replace(trimmed, localized)
}

function localizeElement(element: Element, language: Language) {
  if (element.closest('[data-i18n-ignore]')) return
  const attributes = ['placeholder', 'aria-label', 'title']
  let originals = originalAttributes.get(element)
  if (!originals) {
    originals = new Map()
    originalAttributes.set(element, originals)
  }
  for (const attribute of attributes) {
    const current = element.getAttribute(attribute)
    if (current == null) continue
    const canonical = originals.get(attribute) ?? current
    originals.set(attribute, canonical)
    element.setAttribute(attribute, translateStatic(canonical, language))
  }
}

function localizeTree(root: ParentNode, language: Language) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    localizeTextNode(node as Text, language)
    node = walker.nextNode()
  }
  if (root instanceof Element) localizeElement(root, language)
  root.querySelectorAll('*').forEach((element) => localizeElement(element, language))
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'en' ? 'en' : 'ar'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language)
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    const nativeConfirm = window.confirm.bind(window)
    window.confirm = (message?: string) => nativeConfirm(
      localizedConfirmMessage(String(message ?? ''), language)
    )
    localizeTree(document.body, language)

    const observer = new MutationObserver((mutations) => {
      observer.disconnect()
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          localizeTextNode(mutation.target as Text, language)
        }
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) localizeTextNode(node as Text, language)
          if (node instanceof Element) localizeTree(node, language)
        })
      }
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      window.confirm = nativeConfirm
    }
  }, [language])

  const value = useMemo(() => ({
    language,
    setLanguage,
    t: (key: string) => translateStatic(key, language),
  }), [language])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
