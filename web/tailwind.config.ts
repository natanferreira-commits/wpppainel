import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        whatsapp: {
          // cores aproximadas do WhatsApp pro preview
          bg: '#0b141a',
          panel: '#1f2c33',
          bubble: '#005c4b',
          text: '#e9edef',
          time: '#8696a0',
        },
      },
    },
  },
  plugins: [],
};

export default config;
