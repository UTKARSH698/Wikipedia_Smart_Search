/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#4a6cf7", dark: "#3451d1" },
      },
    },
  },
  plugins: [],
};
