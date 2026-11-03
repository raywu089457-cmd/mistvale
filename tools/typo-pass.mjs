#!/usr/bin/env node
// T15 typography pass: unify font families onto --font-ui / --font-num and
// raise sub-10px font sizes to 10px. Idempotent, no dependencies.
// Usage: node tools/typo-pass.mjs [file]   (default src/pixel-style.css)

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] ?? 'src/pixel-style.css');
const src = readFileSync(file, 'utf8');

// Matches `font:`, `font-family:` and `font-size:` declarations only.
// Not custom properties such as `--font-num:` / `--font-ui:` (those are
// preceded by `-`) and not `font-weight:` / `font-style:`.
const DECL = /(^|[;{}\s])(font(?:-family|-size)?):([^;}]*)/g;

let familiesReplaced = 0;
let sizesRaised = 0;

// True when `value` has `Consolas` at `idx` as the first family in the list.
function startsFamilyList(value, idx) {
  const before = value.slice(0, idx).replace(/\s+$/, '');
  if (before === '') return true; // font-family value: list starts here
  // font shorthand: family list must follow a size, optionally with /line-height
  return /(?:^|[\s/])\d*\.?\d+(?:px|em|rem|%|pt|ch|vw|vh)?(?:\/[\d.]+[a-z%]*)?$/i.test(before);
}

const out = src.replace(DECL, (whole, lead, prop, value) => {
  let next = value;

  // (a) family list led by Consolas -> token
  if (prop === 'font' || prop === 'font-family') {
    const idx = next.indexOf('Consolas');
    if (idx !== -1 && startsFamilyList(next, idx)) {
      next = next.slice(0, idx) + 'var(--font-num)';
      familiesReplaced++;
    }
  }

  // (b) 7px / 8px / 9px sizes -> 10px (line heights after `/` are left alone)
  if (prop === 'font' || prop === 'font-size') {
    next = next.replace(/(^|[:\s])([789])px(?=$|[\/\s!])/g, (m, pre, digit) => {
      sizesRaised++;
      return pre + '10px';
    });
  }

  return lead + prop + ':' + next;
});

if (out !== src) writeFileSync(file, out, 'utf8');

console.log(`file: ${file}`);
console.log(`written: ${out !== src}`);
console.log(`families replaced: ${familiesReplaced}`);
console.log(`sizes raised: ${sizesRaised}`);
