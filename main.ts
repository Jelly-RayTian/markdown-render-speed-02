import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from './parse.js';

const cases = JSON.parse(readFileSync('/input/cases.json', 'utf8'));
const output = cases.map(({ markdown }) => parse(markdown));
writeFileSync('/output/html.json', JSON.stringify(output));
