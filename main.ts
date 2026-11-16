// Entry driver for markdown-render-speed-02: run as `node /bot/main.ts` on Node 22.
// Reads every case from /input/cases.json, renders each one on its own with parse() and
// writes the HTML strings, in case order, to /output/html.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from './parse.js';

type Case = { id: string; markdown: string };

const cases: Case[] = JSON.parse(readFileSync('/input/cases.json', 'utf8'));
const count = cases.length;
const out: string[] = new Array(count);
for (let i = 0; i < count; i++) out[i] = parse(cases[i].markdown);
writeFileSync('/output/html.json', JSON.stringify(out));
