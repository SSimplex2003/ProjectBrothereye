'use client'

import { useEffect, useState } from 'react'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Get saved theme from localStorage or use system preference
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const theme = saved || (prefersDark ? 'dark' : 'light')
    
    const root = document.documentElement
    if (theme === 'light') {
      root.classList.remove('dark')
    } else {
      root.classList.add('dark')
    }
  }, [])

  return <>{children}</>
}

export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const currentTheme = saved || (prefersDark ? 'dark' : 'light')
    
    setThemeState(currentTheme)
    setMounted(true)
  }, [])

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme)
    localStorage.setItem('theme', newTheme)
    
    const root = document.documentElement
    if (newTheme === 'light') {
      root.classList.remove('dark')
    } else {
      root.classList.add('dark')
    }
  }

  return { theme, setTheme, mounted }
}
