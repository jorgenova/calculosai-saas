/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dde6ff',
          200: '#b9cafe',
          500: '#3b6ef8',
          600: '#2554e8',
          700: '#1c42cc',
          900: '#0f2370',
        },
      },
    },
  },
  plugins: [],
}