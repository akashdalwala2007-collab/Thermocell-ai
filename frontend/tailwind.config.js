/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        provenance: {
          real: '#2563eb', // blue
          synthetic: '#9333ea', // purple
          predicted: '#16a34a', // green
        },
        triage: {
          reuse: '#16a34a', // green
          retire: '#dc2626', // red
          investigate: '#d97706', // amber
        }
      }
    },
  },
  plugins: [],
}

