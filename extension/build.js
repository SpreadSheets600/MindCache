import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runBuild() {
  console.log('--- 1. Building Popup & Settings UI ---');
  await build({
    configFile: false, // Disable merging from vite.config.ts
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true, // Clean the output directory first
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'index.html'),
          settings: resolve(__dirname, 'settings.html'),
        },
      },
    },
  });

  console.log('\n--- 2. Building Content Script (IIFE format) ---');
  await build({
    configFile: false, // Disable merging from vite.config.ts
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false, // Maintain popup & settings files
      lib: {
        entry: resolve(__dirname, 'src/content/index.ts'),
        name: 'content',
        formats: ['iife'],
        fileName: () => 'content.js',
      },
      rollupOptions: {
        output: {
          extend: true,
          entryFileNames: 'content.js',
        },
      },
    },
  });

  console.log('\n--- 3. Building Background Script (IIFE format) ---');
  await build({
    configFile: false, // Disable merging from vite.config.ts
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false, // Maintain all previous files
      lib: {
        entry: resolve(__dirname, 'src/background/index.ts'),
        name: 'background',
        formats: ['iife'],
        fileName: () => 'background.js',
      },
      rollupOptions: {
        output: {
          extend: true,
          entryFileNames: 'background.js',
        },
      },
    },
  });

  console.log('\nBuild processes completed successfully!');
}

runBuild().catch((err) => {
  console.error('Build process failed:', err);
  process.exit(1);
});
