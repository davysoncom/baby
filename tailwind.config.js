const defaultTheme = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html"],
  theme: {
    extend: {
      colors: {
        primary: "#FE7F9C",
        secondary: "#628eda",
      },
      fontFamily: {
        'sans': ['Lato', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
};
