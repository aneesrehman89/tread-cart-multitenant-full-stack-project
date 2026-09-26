import type { Config } from 'tailwindcss';

/**
 * Tokens lifted from the design system in `UI's/1- user-customized-theaming.png`:
 * a deep forest-green brand ramp, a lime accent, green-tinted neutrals, and
 * semantic colours kept distinct from the brand so order status stays legible.
 *
 * `brand` here is the platform console's own chrome. Individual stores override
 * their storefront colours through Tenant.brandPrimary / brandAccent.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F0F7F3',
          100: '#DCEDE3',
          200: '#BBDCC9',
          300: '#8CC3A6',
          400: '#55A47D',
          500: '#2F855A',
          600: '#1F6B46',
          700: '#15543A',
          800: '#0F4230',
          900: '#0B3325',
          950: '#072219',
        },
        accent: {
          400: '#A3E635',
          500: '#84CC16',
          600: '#65A30D',
        },
        // Green-tinted greys for page background, borders and text.
        ink: {
          50: '#F7F8F6',
          100: '#EFF1ED',
          200: '#E2E6E0',
          300: '#CBD2C8',
          400: '#9AA397',
          500: '#6B756A',
          600: '#4B554A',
          700: '#343C34',
          800: '#222923',
          900: '#141A15',
        },
        surface: '#FFFFFF',
        canvas: '#F6F7F4',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 20 / 0.04), 0 1px 3px 0 rgb(16 24 20 / 0.06)',
        pop: '0 8px 24px -6px rgb(16 24 20 / 0.16)',
      },
    },
  },
  plugins: [],
};

export default config;
