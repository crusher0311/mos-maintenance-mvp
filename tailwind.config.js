/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0b0f14",
        panel: "#121821",
        line: "#1e2a3a",
        text: "#eaf2ff",
        muted: "#8ea0b3",
        good: "#2ecc71",
        soon: "#f1c40f",
        bad:  "#ff5c5c",
        accent:"#66b2ff",
      },
      borderRadius: { xl: "14px" },
    },
  },
  plugins: [],
};
