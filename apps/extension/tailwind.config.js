/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: {
          DEFAULT: '#161616',
          elevated: '#1c1c1c',
          deep: '#141414',
        },
        accent: {
          DEFAULT: '#7c3aed',
          hover: '#6d28d9',
        },
        status: {
          green: '#10b981',
          amber: '#f59e0b',
          red: '#ef4444',
        },
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '6px',
        md: '10px',
        lg: '12px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
