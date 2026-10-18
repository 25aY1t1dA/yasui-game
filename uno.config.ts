import { defineConfig, presetUno, presetIcons, presetTypography } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      cdn: 'https://esm.sh/'
    }),
    presetTypography({
      cssExtend: {
        'code': { color: '#00E5FF', 'font-family': 'monospace' },
        'a': { color: '#00E5FF', 'text-decoration': 'none' },
        'a:hover': { 'text-decoration': 'underline' },
        'ul > li::before': { 'background-color': '#64748B' }
      }
    }),
  ],
  theme: {
    colors: {
      canvas: '#090A0F',
      surface: {
        DEFAULT: '#11131A',
        hover: '#161922',
        inset: '#0D0F15',
      },
      carbon: {
        border: '#222634',
        borderHover: '#2E3446',
      },
      text: {
        primary: '#F8FAFC',
        secondary: '#94A3B8',
        muted: '#64748B',
      },
      cyber: {
        blue: '#00E5FF',
        blueHover: '#33EBFF',
        blueActive: '#00B8CC',
      }
    },
    fontFamily: {
      sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      mono: ['JetBrains Mono', 'Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
    }
  },
  shortcuts: {
    'yg-shell': 'max-w-7xl mx-auto px-4',
    'yg-container': 'max-w-7xl mx-auto px-4',
    'yg-section': 'py-8 md:py-12',
    'yg-card': 'bg-[#11131A] border border-[#222634] rounded-lg transition-colors duration-150 hover:border-[#2E3446]',
    'yg-card-interactive': 'bg-[#11131A] border border-[#222634] rounded-lg transition-colors duration-150 hover:bg-[#151821] hover:border-[#00E5FF]/40 cursor-pointer',
    'yg-card-cyber': 'bg-[#11131A] border border-[#222634] rounded-lg transition-colors duration-150 block relative',
    'yg-panel': 'bg-[#11131A] border border-[#222634] rounded-lg shadow-xl',
    'yg-input': 'w-full bg-[#0D0F17] border border-[#222634] focus:border-[#00E5FF] text-[#F8FAFC] placeholder-[#64748B] text-xs font-mono rounded-md px-3 py-2 outline-none transition-colors',
    'yg-select': 'bg-[#0D0F17] border border-[#222634] focus:border-[#00E5FF] text-[#F8FAFC] rounded-md px-3 py-2 outline-none transition-colors font-mono text-xs',
    'yg-btn-primary': 'inline-flex items-center justify-center gap-1.5 bg-[#00E5FF] hover:bg-[#33EBFF] active:bg-[#00B8CC] text-[#090A0F] font-semibold text-xs uppercase tracking-wider rounded-md px-4 py-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
    'yg-btn-secondary': 'inline-flex items-center justify-center gap-1.5 bg-[#161922] hover:bg-[#1E2230] text-[#F8FAFC] border border-[#262B3D] rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer',
    'yg-btn-danger': 'inline-flex items-center justify-center gap-1.5 bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-400 font-semibold text-xs uppercase tracking-wider px-3 py-2 rounded-md transition-colors cursor-pointer',
    'yg-btn-icon': 'flex items-center justify-center w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-md bg-[#161922] border border-[#222634] hover:border-[#00E5FF]/40 text-[#94A3B8] hover:text-[#00E5FF] transition-colors cursor-pointer',
    'yg-price': 'font-mono font-bold tabular-nums tracking-tight text-[#F8FAFC]',
    'yg-badge': 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium border',
    'yg-badge-instant': 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/25',
    'yg-badge-online': 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25',
    'yg-badge-cyan': 'yg-badge bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/25',
    'yg-badge-emerald': 'yg-badge bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    'yg-badge-red': 'yg-badge bg-red-500/10 text-red-400 border-red-500/25',
    'yg-badge-yellow': 'yg-badge bg-amber-500/10 text-amber-400 border-amber-500/25',
    'yg-badge-gray': 'yg-badge bg-[#161922] text-[#94A3B8] border-[#222634]',
    'yg-badge-overlay': 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold tracking-wide bg-[#090A0F]/90 backdrop-blur-md text-[#00E5FF] border border-[#00E5FF]/40 shadow-[0_2px_8px_rgba(0,0,0,0.85)]',
    'yg-badge-overlay-online': 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold tracking-wide bg-[#090A0F]/90 backdrop-blur-md text-emerald-400 border border-emerald-500/40 shadow-[0_2px_8px_rgba(0,0,0,0.85)]',
    'yg-product-card': 'bg-[#11131A] border border-[#222634] hover:border-[#00E5FF]/40 transition-colors duration-150 block relative rounded-lg overflow-hidden'
  }
});