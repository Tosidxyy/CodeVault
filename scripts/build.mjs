import { build } from 'vite';

await build();
for (const entry of ['content', 'background', 'editor']) {
  await build({
    configFile: false,
    publicDir: false,
    // Service workers have no document; prefer libraries' worker exports.
    resolve: entry === 'background' ? { conditions: ['worker', 'module', 'production'] } : undefined,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      target: 'chrome120',
      emptyOutDir: false,
      lib: {
        entry: `src/${entry}/index.ts${entry === 'content' ? 'x' : ''}`,
        name: `CodeVault_${entry}`,
        formats: [entry === 'background' ? 'es' : 'iife'],
        fileName: () => `${entry}.js`,
      },
    },
  });
}
