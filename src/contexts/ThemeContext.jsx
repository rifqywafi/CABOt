'use client';

// src/contexts/ThemeContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

const ThemeContext = createContext({
  theme: 'dark', // 'dark' | 'inverted'
  setTheme: () => {},
  toggleTheme: () => {},
  isInverted: false,
});

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('cabo_theme');
      if (savedTheme === 'inverted' || savedTheme === 'dark') {
        setTheme(savedTheme);
      }
    } catch {
      // LocalStorage unavailable
    }
  }, []);

  const changeTheme = (newTheme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem('cabo_theme', newTheme);
    } catch {
      // LocalStorage unavailable
    }
  };

  const toggleTheme = () => {
    changeTheme(theme === 'dark' ? 'inverted' : 'dark');
  };

  const isInverted = theme === 'inverted';

  // Apply or remove 'inverted' class on html/body for universal CSS variable styling
  useEffect(() => {
    const root = document.documentElement;
    if (isInverted) {
      root.classList.add('theme-inverted');
    } else {
      root.classList.remove('theme-inverted');
    }
  }, [isInverted]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: changeTheme, toggleTheme, isInverted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeSwitchButton({ className = '' }) {
  const { theme, toggleTheme, isInverted } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition shadow-sm flex items-center gap-1.5 ${
        isInverted
          ? 'bg-white hover:bg-slate-100 border-[#c8d1d9] text-[#1a1a1a]'
          : 'bg-[#242424] hover:bg-[#2e2e2e] border-[#545454] text-[#c8d1d9] hover:text-white'
      } ${className}`}
      title={isInverted ? 'Ganti ke Mode Gelap (Dark Mode)' : 'Ganti ke Mode Terang / Inverted'}
      aria-label="Toggle inverted theme"
    >
      {isInverted ? (
        <>
          <Moon className="w-3.5 h-3.5 text-[#a465b5]" />
          <span>Dark</span>
        </>
      ) : (
        <>
          <Sun className="w-3.5 h-3.5 text-amber-400" />
          <span>Invert</span>
        </>
      )}
    </button>
  );
}

export default ThemeContext;

