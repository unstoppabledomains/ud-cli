import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/ud-cli.cjs',
  external: ['keytar'],
  loader: { '.json': 'json' },
  banner: {
    js: '#!/usr/bin/env node',
  },
});

console.log('Bundle created: dist/ud-cli.cjs');
