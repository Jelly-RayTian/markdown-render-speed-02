import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from './parse.js';

const cases = JSON.parse(readFileSync('/input/cases.json', 'utf8')) as { markdown: string }[];
const html = cases.map(({ markdown }) => parse(markdown));
writeFileSync('/output/html.json', JSON.stringify(html));
