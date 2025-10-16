/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gray: {
          750: '#374151', // Custom gray-750 for existing component
        }
      }
    },
  },
  plugins: [],
}
