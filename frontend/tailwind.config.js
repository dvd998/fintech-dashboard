/** @type {import('tailwindcss').Config} */
export default {
  // Only generate CSS for files that actually use Tailwind classes
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class', // enables dark mode via a 'dark' class on <html>
  theme: {
    extend: {
      colors: {
        // Custom palette for the dashboard
        surface: {
          DEFAULT: '#0f1117',  // page background
          card:    '#1a1d27',  // card background
          border:  '#2a2d3d',  // borders & dividers
          hover:   '#22263a',  // row hover
        },
        brand: {
          DEFAULT: '#6366f1', // indigo accent
          light:   '#818cf8',
        },
        up:   '#10b981', // green  — positive price change
        down: '#ef4444', // red    — negative price change
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
