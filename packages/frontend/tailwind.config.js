/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        display: ['36px', { lineHeight: '44px', fontWeight: '600' }],
        h1: ['28px', { lineHeight: '36px', fontWeight: '600' }],
        h2: ['22px', { lineHeight: '30px', fontWeight: '600' }],
        h3: ['18px', { lineHeight: '26px', fontWeight: '500' }],
        body: ['14px', { lineHeight: '22px', fontWeight: '400' }],
      },
      colors: {
        ink: {
          50: '#F4F6F9',
          100: '#E6EAF0',
          200: '#C9D2DE',
          300: '#A3B1C4',
          400: '#7186A3',
          500: '#4C6483',
          600: '#354965',
          700: '#24344C',
          800: '#172336',
          900: '#0D1523',
        },
        aurum: {
          50: '#FBF7EE',
          100: '#F3E8CC',
          200: '#E6CE99',
          300: '#D6B36B',
          400: '#C89A46',
          500: '#AD7F2E',
          600: '#8C6522',
          700: '#6B4C19',
          800: '#4A3411',
          900: '#2E200A',
        },
        graphite: {
          50: '#F8F9FA',
          100: '#F1F3F5',
          200: '#E4E7EB',
          300: '#D1D6DC',
          400: '#9AA5B1',
          500: '#6B7684',
          600: '#4C5563',
          700: '#364152',
          800: '#202B3B',
          900: '#121826',
        },
        success: {
          50: '#EAF6EF', 500: '#2F8F5B', 600: '#26794D', 700: '#1F6440',
        },
        danger: {
          50: '#FBEEEC', 500: '#C6402F', 600: '#A83525', 700: '#922A1E',
        },
        warning: {
          50: '#FBF3E7', 500: '#B8791A', 600: '#9C6614', 700: '#8A5A11',
        },
        info: {
          50: '#EEF3FA', 500: '#3568B0', 600: '#2C589A', 700: '#24497D',
        },
      },
    },
  },
  plugins: [],
}
