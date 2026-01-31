import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { aliases } from '@swc-uxp-wrappers/utils'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: aliases,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    minify: false,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'index.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        inlineDynamicImports: true,
      },
    },
  },
})
