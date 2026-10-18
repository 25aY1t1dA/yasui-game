import { defineConfig, presetUno, presetIcons, presetTypography } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(), // Preset standar (mirip Tailwind)
    presetIcons({ // Agar bisa pakai ikon i-lucide-...
      cdn: 'https://esm.sh/'
    }),
    presetTypography({
      cssExtend: {
        'code': { color: '#8b5cf6' },
        'a': { color: '#22d3ee', 'text-decoration': 'none' },
        'a:hover': { 'text-decoration': 'underline' },
        'ul > li::before': { 'background-color': '#9ca3af' } // Bullet color
      }
    }),
  ],
});