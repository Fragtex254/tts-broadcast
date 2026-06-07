/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#F2EEDF', 2: '#ECE6D2' },
        ink: { DEFAULT: '#2A241B', soft: '#5C5345' },
        pink: '#E1A4C2',
        lemon: '#D6DD63',
        blush: '#E8C9B6',
        sage: '#B7C7A8',
        lilac: '#C9BEDC',
      },
      borderRadius: {
        card: '24px',
      },
      boxShadow: {
        card: '0 1px 4px rgba(42, 36, 27, 0.04)',
        'card-hover': '0 4px 12px rgba(42, 36, 27, 0.08)',
        btn: '0 1px 3px rgba(42, 36, 27, 0.06)',
      },
      fontFamily: {
        display: ["'Cormorant Garamond'", "'ZCOOL XiaoWei'", "'Noto Serif SC'", 'serif'],
        body: ["'Work Sans'", "'Yozai'", "'Noto Sans SC'", 'sans-serif'],
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'fade-in-left': 'fade-in-left 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'fade-in': 'fade-in 0.3s ease forwards',
        'breathe': 'breathe 2.5s ease-in-out infinite',
        'shake': 'shake 0.3s ease-in-out',
        'scale-bounce': 'scale-bounce 0.3s ease',
        'waveform-pulse': 'waveform-pulse 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
