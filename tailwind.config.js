/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cabo: {
          purple: '#a465b5',
          'purple-light': '#bd82ce',
          'purple-dark': '#7d458d',
          gray: '#545454',
          'gray-light': '#737373',
          'gray-dark': '#2e2e2e',
          'gray-darker': '#1c1c1c',
          platinum: '#c8d1d9',
          'platinum-light': '#e6edf3',
          'platinum-dark': '#8b949e',
          red: '#ff5757',
          'red-light': '#ff7878',
          'red-dark': '#e03e3e',
        },
        primary: {
          50: '#fbf7fd',
          100: '#f6ecfb',
          200: '#edd5f6',
          300: '#deaff0',
          400: '#c57de5',
          500: '#a465b5',
          600: '#8c4b9d',
          700: '#753b84',
          800: '#61326c',
          900: '#512d5a',
        },
        secondary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        }
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
      }
    },
  },
  plugins: [],
}