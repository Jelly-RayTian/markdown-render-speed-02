// Entry point run by the harness as `node /bot/main.ts` (Node 22, types stripped natively).
// Reads every case from /input/cases.json, renders each one on its own with parse(), and writes the
// HTML strings, in the cases' order, to /output/html.json. Fixed paths only: no environment, no clock.

import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from './parse.js';

type Case = { id: string; markdown: string };

const cases: Case[] = JSON.parse(readFileSync('/input/cases.json', 'utf8'));
const out: string[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) out[i] = parse(cases[i].markdown);
writeFileSync('/output/html.json', JSON.stringify(out));
