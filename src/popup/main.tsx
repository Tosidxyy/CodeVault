import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Welcome } from '../components/Welcome';
import '../styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><main className="w-[360px] p-3"><Welcome /><a className="mt-3 block text-center text-xs text-neutral-600 underline" href="options.html" target="_blank">关于与设置</a></main></StrictMode>,
);
