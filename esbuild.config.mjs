import { readFileSync } from 'node:fs';
import * as esbuild from 'esbuild';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/ud-cli.cjs',
  external: ['keytar'],
  loader: { '.json': 'json' },
  define: {
    __PKG_VERSION__: JSON.stringify(pkg.version),
  },
});

console.log('Bundle created: dist/ud-cli.cjs');
