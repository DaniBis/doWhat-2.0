/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        // tweak the values to your taste
        card: "0 4px 14px rgba(0,0,0,0.08)",
      },
      borderRadius: {
        xl: "0.75rem",
      },
      colors: {
        brand: {
          teal: "#0d9488",
          mustard: "#FDB515",
          slate: "#1e293b",
        },
      },
    },
  },
  plugins: [],
};
