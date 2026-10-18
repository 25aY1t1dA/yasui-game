import { defineConfig, presetUno, presetIcons, presetTypography } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      cdn: 'https://esm.sh/'
    }),
    presetTypography({
      cssExtend: {
        'code': { color: '#8b5cf6' },
        'a': { color: '#22d3ee', 'text-decoration': 'none' },
        'a:hover': { 'text-decoration': 'underline' },
        'ul > li::before': { 'background-color': '#9ca3af' }
      }
    }),
  ],
  shortcuts: {
    'yg-shell': 'max-w-7xl mx-auto px-4',
    'yg-card': 'bg-gray-900/60 border border-gray-800 rounded-xl transition duration-300',
    'yg-card-interactive': 'bg-gray-900/60 border border-gray-800 hover:border-cyan-400/60 rounded-xl transition-all duration-300 hover:-translate-y-0.5 shadow-sm',
    'yg-card-cyber': 'cyber-card bg-gray-900/60 border border-gray-800 hover:border-cyan-400 transition-all duration-300 block relative',
    'yg-panel': 'bg-black/95 border border-cyan-500/40 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.9)] backdrop-blur-xl',
    'yg-input': 'w-full bg-black/90 border border-gray-800 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-600 font-mono transition outline-none focus:shadow-[0_0_15px_rgba(34,211,238,0.15)]',
    'yg-btn-primary': 'inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-white text-black font-black uppercase text-xs tracking-wider px-4 py-2.5 rounded-xl transition shadow-[0_0_15px_rgba(34,211,238,0.25)] hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
    'yg-btn-secondary': 'inline-flex items-center justify-center gap-1.5 bg-gray-900/80 hover:bg-gray-800 border border-gray-800 hover:border-cyan-500/50 text-gray-300 hover:text-white font-bold text-xs uppercase px-4 py-2.5 rounded-xl transition cursor-pointer',
    'yg-btn-danger': 'inline-flex items-center justify-center gap-1.5 bg-red-950/60 hover:bg-red-900/60 border border-red-500/40 text-red-400 font-bold text-xs uppercase px-3 py-2 rounded-xl transition cursor-pointer',
    'yg-btn-icon': 'flex items-center justify-center w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-xl bg-gray-900/80 border border-gray-800 hover:border-cyan-500/50 hover:bg-cyan-950/30 text-gray-300 hover:text-cyan-400 transition cursor-pointer',
    'yg-badge': 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-bold border',
    'yg-badge-cyan': 'yg-badge border-cyan-500/40 bg-cyan-950/40 text-cyan-400',
    'yg-badge-emerald': 'yg-badge border-emerald-500/40 bg-emerald-950/40 text-emerald-400',
    'yg-badge-red': 'yg-badge border-red-500/40 bg-red-950/40 text-red-400',
    'yg-badge-yellow': 'yg-badge border-yellow-500/40 bg-yellow-950/40 text-yellow-400',
    'yg-badge-gray': 'yg-badge border-gray-800 bg-gray-900/80 text-gray-400',
    'yg-product-card': 'bg-gray-900/60 border border-gray-800 hover:border-cyan-400 transition-all duration-300 hover:-translate-y-1 block relative shadow-md rounded-xl overflow-hidden'
  }
});