// dispatch-accept-auto.test.mjs — unit tests for the `Accept: auto` rules in tools/dispatch-accept.mjs (T53).
// Plain node, no network, no pi, no files written: it only imports the pure helpers, so it is cheap and safe in an
// Accept line. Exit 1 on any failure.
//   isGenericAccept: a plan whose accept line is only npm test / npm run verify... proves nothing
//   acceptCheckers:  the tools/checks/ checkers an accept line runs (deduped, backslashes normalised) — PRECHECK runs each
//   allowedWithCheckers: a tools/checks/ file named in the accept line is in scope even when Files leaves it out (T49)
import { splitAccept, acceptCheckers, isGenericAccept, allowedWithCheckers } from '../dispatch-accept.mjs';

let bad = 0;
const check = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { bad++; console.log(`FAIL ${name}: ${g} != ${w}`); }
  else console.log(`ok ${name}`);
};

// splitAccept: one shell command → its segments
check('splitAccept chained', splitAccept('node tools/checks/a.mjs && npm run verify:quick'), ['node tools/checks/a.mjs', 'npm run verify:quick']);
check('splitAccept or/semicolon', splitAccept('a; b || c'), ['a', 'b', 'c']);
check('splitAccept empty', splitAccept(''), []);
check('splitAccept null', splitAccept(null), []);

// isGenericAccept: true only when there is no checker AND every segment is a generic suite
for (const cmd of ['npm test', 'npm run verify', 'npm run verify:quick', 'npm run build', 'npm run lint', '', '  ', 'npm test && npm run build'])
  check(`generic: ${cmd || '(empty)'}`, isGenericAccept(cmd), true);
for (const cmd of ['node tools/checks/x.mjs', 'node tools/checks/x.mjs && npm run verify:quick', 'npm test && node tools/checks/x.mjs', 'node tools/checks/deep/y.mjs'])
  check(`not generic: ${cmd}`, isGenericAccept(cmd), false);

// acceptCheckers: every tools/checks/ file, deduped, `\` → `/`
check('checkers one', acceptCheckers('node tools/checks/x.mjs'), ['tools/checks/x.mjs']);
check('checkers chained+deduped', acceptCheckers('node tools/checks/a.mjs && node tools/checks/b.mjs && node tools/checks/a.mjs'),
  ['tools/checks/a.mjs', 'tools/checks/b.mjs']);
check('checkers backslashes', acceptCheckers('node tools\\checks\\a.mjs'), ['tools/checks/a.mjs']);
check('checkers nested', acceptCheckers('node tools/checks/fixtures/deep.mjs'), ['tools/checks/fixtures/deep.mjs']);
check('checkers none', acceptCheckers('npm test'), []);
check('checkers empty', acceptCheckers(''), []);

// allowedWithCheckers: the Files list plus the accept line's checkers, no duplicates
check('scope adds checker', allowedWithCheckers(['tools/pi-dispatch.mjs'], 'node tools/checks/x.mjs'),
  ['tools/pi-dispatch.mjs', 'tools/checks/x.mjs']);
check('scope keeps Files order and dedupes', allowedWithCheckers(['tools/checks/x.mjs', 'docs/P.md'], 'node tools/checks/x.mjs && npm run verify:quick'),
  ['tools/checks/x.mjs', 'docs/P.md']);
check('scope without checkers', allowedWithCheckers(['a.js'], 'npm test'), ['a.js']);
// an unparsable Files list stays empty, so outOfScope() still reports "n/a" instead of "everything is stray"
check('scope empty list stays empty', allowedWithCheckers([], 'node tools/checks/x.mjs'), []);

if (bad) { console.log(`dispatch-accept-auto: ${bad} failure(s)`); process.exit(1); }
console.log('dispatch-accept-auto: PASS');
