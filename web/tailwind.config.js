/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef9ee',
          100: '#fdf0d3',
          200: '#fadda5',
          300: '#f6c46d',
          400: '#f2a432',
          500: '#ef8b12', // Primary orange — eggs
          600: '#d06e09',
          700: '#ad530b',
          800: '#8a4110',
          900: '#723710',
        },
      },
    },
  },
  plugins: [],
};
