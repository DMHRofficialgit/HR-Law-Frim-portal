import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const DOMPurifyFactory = require('isomorphic-dompurify');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, 'src');
const outDir = __dirname;

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'https://localhost/',
  runScripts: 'dangerously',
});

const { window } = dom;
global.window = window;
global.document = window.document;
global.DOMParser = window.DOMParser;
global.XMLSerializer = window.XMLSerializer;
Object.defineProperty(global, 'navigator', {
  value: window.navigator,
  configurable: true,
});
global.HTMLElement = window.HTMLElement;
global.SVGElement = window.SVGElement;
global.getComputedStyle = window.getComputedStyle.bind(window);
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.DOMPurify = DOMPurifyFactory;

const mermaidModule = await import(pathToFileURL(
  path.join(__dirname, 'node_modules', 'mermaid', 'dist', 'mermaid.core.mjs')
).href);
const mermaid = mermaidModule.default;

await mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  theme: 'default',
  flowchart: { htmlLabels: false, curve: 'basis' },
});

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.mmd')).sort();
for (const file of files) {
  const id = path.basename(file, '.mmd');
  const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
  try {
    const { svg } = await mermaid.render(`diagram-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`, code);
    const outPath = path.join(outDir, `${id}.svg`);
    fs.writeFileSync(outPath, svg, 'utf8');
    console.log(`Wrote ${outPath}`);
  } catch (err) {
    console.error(`Failed ${file}:`, err.message || err);
  }
}
