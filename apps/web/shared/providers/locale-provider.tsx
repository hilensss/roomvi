'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_STORAGE_KEY,
  type Locale,
} from '@/shared/i18n/locale';
import {
  ENGLISH_META_DESCRIPTION,
  translateRussianText,
} from '@/shared/i18n/translations';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const TRANSLATABLE_ATTRIBUTES = ['alt', 'aria-label', 'placeholder', 'title'] as const;
const SKIPPED_ELEMENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE']);
const LOCALE_CHANGE_EVENT = 'roomvi-locale-change';

function subscribeToLocale(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(LOCALE_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  };
}

function getLocaleSnapshot(): Locale {
  const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE;
}

function getServerLocaleSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeToLocale,
    getLocaleSnapshot,
    getServerLocaleSnapshot,
  );
  const originalText = useRef(new WeakMap<Text, string>());
  const originalAttributes = useRef(
    new WeakMap<Element, Map<string, string>>(),
  );
  const applyingTranslation = useRef(false);

  const setLocale = useCallback((nextLocale: Locale) => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  }, []);

  useEffect(() => {
    const localizeText = (textNode: Text) => {
      const parent = textNode.parentElement;
      if (
        !parent ||
        SKIPPED_ELEMENTS.has(parent.tagName) ||
        parent.closest('[data-no-i18n]')
      ) {
        return;
      }

      if (locale === 'ru') {
        const original = originalText.current.get(textNode);
        if (original !== undefined && textNode.nodeValue !== original) {
          textNode.nodeValue = original;
        }
        originalText.current.delete(textNode);
        return;
      }

      const currentValue = textNode.nodeValue ?? '';
      const previousOriginal = originalText.current.get(textNode);
      const previousTranslation =
        previousOriginal === undefined
          ? undefined
          : translateRussianText(previousOriginal);
      const original =
        previousOriginal === undefined || currentValue !== previousTranslation
          ? currentValue
          : previousOriginal;

      originalText.current.set(textNode, original);
      const translated = translateRussianText(original);
      if (translated !== currentValue) textNode.nodeValue = translated;
    };

    const localizeElement = (element: Element) => {
      if (
        SKIPPED_ELEMENTS.has(element.tagName) ||
        element.closest('[data-no-i18n]')
      ) {
        return;
      }

      let originals = originalAttributes.current.get(element);

      for (const attribute of TRANSLATABLE_ATTRIBUTES) {
        const currentValue = element.getAttribute(attribute);
        if (currentValue === null) continue;

        if (locale === 'ru') {
          const original = originals?.get(attribute);
          if (original !== undefined && currentValue !== original) {
            element.setAttribute(attribute, original);
          }
          originals?.delete(attribute);
          continue;
        }

        if (!originals) {
          originals = new Map();
          originalAttributes.current.set(element, originals);
        }

        const previousOriginal = originals.get(attribute);
        const previousTranslation =
          previousOriginal === undefined
            ? undefined
            : translateRussianText(previousOriginal);
        const original =
          previousOriginal === undefined || currentValue !== previousTranslation
            ? currentValue
            : previousOriginal;

        originals.set(attribute, original);
        const translated = translateRussianText(original);
        if (translated !== currentValue) element.setAttribute(attribute, translated);
      }

      if (locale === 'ru' && originals?.size === 0) {
        originalAttributes.current.delete(element);
      }
    };

    const localizeTree = (root: Node) => {
      applyingTranslation.current = true;

      if (root.nodeType === Node.TEXT_NODE) {
        localizeText(root as Text);
      } else if (root.nodeType === Node.ELEMENT_NODE) {
        const element = root as Element;
        localizeElement(element);

        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        );
        let node = walker.nextNode();
        while (node) {
          if (node.nodeType === Node.TEXT_NODE) localizeText(node as Text);
          else localizeElement(node as Element);
          node = walker.nextNode();
        }
      }

      applyingTranslation.current = false;
    };

    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
    document.title = locale === 'en' ? 'Roomvi — AI Interior Design' : 'Roomvi';

    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute(
        'content',
        locale === 'en'
          ? ENGLISH_META_DESCRIPTION
          : 'AI-платформа для дизайна интерьера с реальными товарами',
      );
    }

    localizeTree(document.body);

    const observer = new MutationObserver((mutations) => {
      if (applyingTranslation.current) return;

      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          localizeTree(mutation.target);
          continue;
        }

        if (mutation.type === 'attributes') {
          localizeTree(mutation.target);
          continue;
        }

        mutation.addedNodes.forEach(localizeTree);
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });

    return () => observer.disconnect();
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used inside LocaleProvider');
  return context;
}
