import { copyFile, readFile, writeFile } from 'node:fs/promises';

const cname = await readFile(new URL('../CNAME', import.meta.url));
if (!cname.toString().trim()) throw new Error('CNAME must contain the custom domain');
await copyFile(new URL('../CNAME', import.meta.url), new URL('../dist/CNAME', import.meta.url));
await writeFile(new URL('../dist/.nojekyll', import.meta.url), '');
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
if (!html.includes('/assets/')) throw new Error('The built page must reference bundled assets');
console.log(`Static site prepared for ${cname.toString().trim()}`);
