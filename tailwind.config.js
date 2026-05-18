/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'bg-0': '#0a0807',
        'bg-1': '#14110f',
        'bg-2': '#1c1815',
        'bg-3': '#26211d',
        'bg-4': '#322a24',
        'text-0': '#f5ede1',
        'text-1': '#c9bfb0',
        'text-2': '#8a7f70',
        'text-3': '#5a5048',
        accent: '#d4a373',
        'accent-bright': '#f5b97a',
        'accent-deep': '#a67c4a',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
        arabic: ['Amiri', 'Geist', 'serif'],
      },
    },
  },
  plugins: [],
};
