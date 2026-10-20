'use client';

// src/contexts/LanguageContext.jsx
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Globe } from 'lucide-react';
import { locales, getLocaleTexts, defaultLocale } from '@/locales';

const LanguageContext = createContext({
  lang: defaultLocale,
  setLang: () => {},
  toggleLang: () => {},
  texts: locales[defaultLocale],
  t: (key) => key,
});

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(defaultLocale);

  useEffect(() => {
    try {
      const savedLang = localStorage.getItem('cabo_language');
      if (savedLang === 'en' || savedLang === 'id') {
        setLang(savedLang);
      } else {
        localStorage.setItem('cabo_language', defaultLocale);
      }
    } catch {
      // LocalStorage unavailable
    }
  }, []);

  const changeLang = (newLang) => {
    setLang(newLang);
    try {
      localStorage.setItem('cabo_language', newLang);
    } catch {
      // LocalStorage unavailable
    }
  };

  const toggleLang = () => {
    changeLang(lang === 'id' ? 'en' : 'id');
  };

  // Structured menu texts for the active language
  const texts = useMemo(() => {
    return getLocaleTexts(lang);
  }, [lang]);

  // Backward-compatible fallback helper: supports both dot notation "landing.appTitle" and flat keys
  const t = (path) => {
    if (!path) return '';
    // If path has dot notation like 'landing.appTitle'
    if (path.includes('.')) {
      const parts = path.split('.');
      let current = texts;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          return path;
        }
      }
      return typeof current === 'string' ? current : path;
    }

    // Search top-level menu objects for matching property
    for (const menu of Object.values(texts)) {
      if (menu && typeof menu === 'object' && path in menu) {
        const val = menu[path];
        return typeof val === 'string' ? val : path;
      }
    }

    return path;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang, toggleLang, texts, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageSwitchButton({ className = '' }) {
  const { lang, toggleLang } = useLanguage();

  return (
    <button
      onClick={toggleLang}
      className={`px-2.5 py-1 text-xs font-bold rounded-lg border border-[#545454] bg-[#242424] hover:bg-[#2e2e2e] text-[#c8d1d9] hover:text-white flex items-center gap-1.5 transition shadow-sm ${className}`}
      title={lang === 'id' ? 'Ganti ke Bahasa Inggris' : 'Switch to Bahasa Indonesia'}
    >
      <Globe className="w-3.5 h-3.5 text-[#a465b5]" />
      <span>{lang === 'id' ? '🇮🇩 ID' : '🇬🇧 EN'}</span>
    </button>
  );
}
