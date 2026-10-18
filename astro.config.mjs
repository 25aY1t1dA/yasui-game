import { defineConfig } from 'astro/config';
import UnoCSS from 'unocss/astro';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from "vite";
import vercel from '@astrojs/vercel'; 

const { WP_URL, WP_API_URL } = loadEnv(process.env.NODE_ENV, process.cwd(), "");
const rawUrl = WP_URL || WP_API_URL || 'https://admin.yasuigame.com';
let wpDomain = 'admin.yasuigame.com';
try {
  wpDomain = new URL(rawUrl).hostname;
} catch (e) {
  wpDomain = 'admin.yasuigame.com';
}

export default defineConfig({
  site: 'https://yasuigame.com',
  output: 'server',
  adapter: vercel(), 
  integrations: [
    UnoCSS({
      injectReset: true,
    }), 
    sitemap()
  ],
  image: {
    domains: [wpDomain],
    remotePatterns: [{ protocol: "https" }, { protocol: "http" }],
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport'
  }
});
