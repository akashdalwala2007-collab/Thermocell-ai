/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        galvanic: {
          bg: '#070c18',
          surface: '#08101e',
          inset: '#060a14',
          border: '#142340',
          borderHover: '#1e3b66',
          primary: '#06b6d4',
          primaryLight: '#4cd7f6',
          secondary: '#38bdf8',
          secondaryLight: '#7bd0ff',
          muted: '#64748b',
          dim: '#94a3b8',
          text: '#e2e8f0',
        },
        navy: {
          950: '#070c18',
          900: '#08101e',
          850: '#090e1a',
          800: '#0d1527',
          700: '#142340',
          600: '#1e3b66',
          500: '#27467a',
        },
        card: {
          bg: '#08101e',
          border: '#142340',
          borderHover: '#1e3b66',
        },
        provenance: {
          real: '#38bdf8',
          synthetic: '#a78bfa',
          predicted: '#06b6d4',
        },
        triage: {
          reuse: '#10b981',
          reuseAccent: '#34d399',
          retire: '#ef4444',
          retireAccent: '#f87171',
          investigate: '#f59e0b',
          investigateAccent: '#fbbf24',
        }
      },
      boxShadow: {
        'glow-cyan': '0 0 25px -5px rgba(6, 182, 212, 0.3)',
        'glow-blue': '0 0 25px -5px rgba(56, 189, 248, 0.25)',
        'glow-card': '0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 0 15px -3px rgba(30, 58, 102, 0.25)',
      }
    },
  },
  plugins: [],
}

