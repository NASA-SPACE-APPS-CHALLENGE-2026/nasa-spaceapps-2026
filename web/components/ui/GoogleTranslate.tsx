'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    plotTwistTranslateReady?: () => void;
    google?: { translate?: { TranslateElement: new (options: { pageLanguage: string; autoDisplay: boolean }, element: string) => unknown } };
  }
}

const ID = 'plottwist-google-translate';
const SCRIPT_ID = 'plottwist-translate-script';
const selectedLanguage = () => document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/)?.[1];
const setDocumentLanguage = (lang: string) => {
  document.documentElement.lang = lang;
  document.documentElement.dir = /^(ar|fa|iw|he|ur|ps|sd|ug|yi|dv|ckb)(-|$)/.test(lang) ? 'rtl' : 'ltr';
};

/** One document-wide, opt-in widget, shared by both route groups. Google owns its DOM. */
export function GoogleTranslate() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const initialized = useRef(false);

  useEffect(() => {
    const saved = selectedLanguage();
    if (saved) {
      setEnabled(true);
      setDocumentLanguage(decodeURIComponent(saved).split('/').at(-1) || 'en');
    }
    // Google mutates page text. A fresh document on navigation avoids reconciling
    // a previous route's translated DOM and lets Google restore its language cookie.
    const navigate = (event: MouseEvent) => {
      if (!selectedLanguage() || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.('a');
      if (!link || link.target || link.hasAttribute('download')) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      event.preventDefault();
      event.stopPropagation();
      location.assign(url.href);
    };
    document.addEventListener('click', navigate, true);
    return () => document.removeEventListener('click', navigate, true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const container = document.getElementById(ID)!;
    const ready = () => {
      if (!container.querySelector('select')) return;
      container.querySelector('select')?.setAttribute('aria-label', 'Translate website language');
      setStatus('ready');
    };
    const observer = new MutationObserver(ready);
    observer.observe(container, { childList: true, subtree: true });
    const initialize = () => {
      if (!initialized.current && window.google?.translate?.TranslateElement) {
        initialized.current = true;
        try {
          new window.google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, ID);
        } catch {
          initialized.current = false;
          setStatus('error');
        }
      }
      ready();
    };
    window.plotTwistTranslateReady = initialize;
    const timeout = window.setTimeout(() => {
      if (!container.querySelector('select')) setStatus('error');
    }, 15000);
    if (window.google?.translate?.TranslateElement) initialize();
    else if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://translate.google.com/translate_a/element.js?cb=plotTwistTranslateReady';
      script.async = true;
      script.onerror = () => setStatus('error');
      document.head.appendChild(script);
    }
    const change = (event: Event) => {
      const lang = (event.target as HTMLSelectElement).value || 'en';
      setDocumentLanguage(lang);
    };
    container.addEventListener('change', change);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      container.removeEventListener('change', change);
    };
  }, [enabled]);

  const reset = () => {
    // Clear host-only and parent-domain copies created by the Google widget.
    document.cookie = 'googtrans=; Max-Age=0; path=/';
    const parts = location.hostname.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      document.cookie = `googtrans=; Max-Age=0; path=/; domain=${parts.slice(i).join('.')}`;
    }
    location.reload();
  };

  return (
    <details className="translation-control notranslate" translate="no" onToggle={(event) => { if (event.currentTarget.open) setEnabled(true); }}>
      <summary aria-label="Translate website">🌐 Language</summary>
      <div className="translation-panel" dir="ltr">
        <p className="font-semibold">Translate this website</p>
        {enabled && status === 'loading' && <p role="status">Loading Google Translate…</p>}
        <div id={ID} />
        {status === 'error' && <p role="status">Google Translate could not load. Try your browser’s “Translate page” option.</p>}
        <p className="translation-note">Page text is sent to Google when you choose a language. Automatic translations may contain errors.</p>
        <button type="button" onClick={reset}>Restore English</button>
      </div>
    </details>
  );
}
