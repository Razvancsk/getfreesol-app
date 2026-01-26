import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'purple' | 'night';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isNightMode: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme') as Theme;
      return saved === 'night' ? 'night' : 'purple';
    }
    return 'purple';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'night') {
      document.documentElement.classList.add('night-mode');
    } else {
      document.documentElement.classList.remove('night-mode');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'purple' ? 'night' : 'purple');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isNightMode: theme === 'night' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
