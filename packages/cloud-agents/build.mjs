import { build } from 'esbuild';

await build({
  entryPoints: ['src/worker.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/worker.js',
  target: 'esnext',
  platform: 'browser',
  // Don't bundle Cloudflare runtime (provided by Workers)
  external: [],
  // Mark node builtins as external (not available in Workers)
  banner: {
    js: `// cocapn-agent Worker bundle — built ${new Date().toISOString()}`,
  },
});

console.log('✅ Built dist/worker.js');
