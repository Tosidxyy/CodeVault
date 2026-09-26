import { build } from 'vite';

await build();
for (const entry of ['content', 'background']) {
  await build({
    configFile: false,
    publicDir: false,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      target: 'chrome120',
      emptyOutDir: false,
      lib: {
        entry: `src/${entry}/index.ts${entry === 'content' ? 'x' : ''}`,
        name: `CodeVault_${entry}`,
        formats: [entry === 'content' ? 'iife' : 'es'],
        fileName: () => `${entry}.js`,
      },
    },
  });
}
