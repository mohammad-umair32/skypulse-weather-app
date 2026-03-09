/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js}"],
  theme: {
    extend: {
      fontFamily: {
        outfit: ['Outfit', 'sans-serif'],
        serif:  ['DM Serif Display', 'serif'],
      },
      fontSize: {
        '11':  '11px',
        '100': '100px',
        '88':  '88px',
        '72':  '72px',
        '42':  '42px',
        '40':  '40px',
        '32':  '32px',
        '26':  '26px',
        '22':  '22px',
        '10.5':'10.5px',
      },
      letterSpacing: {
        'tight-xl': '-5px',
        'tight-lg': '-1px',
        'tight-md': '-0.5px',
        'wide-sm':  '0.7px',
        'wide-md':  '0.8px',
        'wide-lg':  '0.9px',
      },
      borderRadius: {
        'card': '20px',
        'sm-custom': '12px',
      },
      backdropBlur: {
        '28': '28px',
        '30': '30px',
      },
      maxWidth: {
        'app': '1200px',
      },
      zIndex: {
        '200': '200',
        '1000': '1000',
        '9999': '9999',
      },
      animation: {
        'fadeUp':     'fadeUp 0.6s ease forwards',
        'fadeUpFast': 'fadeUp 0.5s ease forwards',
        'spin-slow':  'spin 0.8s linear infinite',
        'sunPulse':   'sunPulse 6s ease-in-out infinite',
        'slideDown':  'slideDown 0.4s ease forwards',
        'dropIn':     'dropIn 0.2s ease forwards',
        'shake':      'shake 0.35s ease forwards',
      },
      keyframes: {
        fadeUp: {
          'from': { opacity: '0', transform: 'translateY(20px)' },
          'to':   { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          'from': { transform: 'translateY(-100%)' },
          'to':   { transform: 'translateY(0)' },
        },
        dropIn: {
          'from': { opacity: '0', transform: 'translateY(-8px)' },
          'to':   { opacity: '1', transform: 'translateY(0)' },
        },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%':     { transform: 'translateX(-6px)' },
          '40%':     { transform: 'translateX(6px)' },
          '60%':     { transform: 'translateX(-4px)' },
          '80%':     { transform: 'translateX(4px)' },
        },
        sunPulse: {
          '0%,100%': { transform: 'scale(1)' },
          '50%':     { transform: 'scale(1.06)' },
        },
      },
      screens: {
        'xs': '360px',
      },
      gridTemplateAreas: {
        // defined in custom.css since Tailwind doesn't support grid-template-areas natively
      },
    },
  },
  plugins: [],
};
