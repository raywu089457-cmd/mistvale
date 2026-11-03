// dispatch-accept.mjs — pure helpers for reading an `Accept:` command, so the dispatcher (and its selftest, and
// tools/checks/dispatch-accept-auto.test.mjs) share one definition of "generic suite", "checker" and "in scope".
// No side effects: importing this module reads no file and runs no command.
//
// Why it exists (T53): T49's plan wrote `Accept: npm test`, a suite that does not touch the card's own subject, the
// checker passed on the unchanged tree and the dispatcher printed accept:PASS with nothing changed. A plan's accept
// command must therefore run at least one `tools/checks/` checker of its own.

// one shell command → its segments (`&&`, `||`, `;`), trimmed and without empty pieces
export const splitAccept = cmd => String(cmd || '')
  .split(/&&|\|\||;/)
  .map(s => s.trim())
  .filter(Boolean);

// the `tools/checks/` checkers an accept command runs: unique, forward slashes, in first-seen order
export const acceptCheckers = cmd => {
  const out = [];
  for (const m of String(cmd || '').matchAll(/tools[\\/]checks[\\/][\w.\-/\\]+\.\w+/gi)) {
    const f = m[0].replace(/\\/g, '/');
    if (!out.includes(f)) out.push(f);
  }
  return out;
};

// generic suite: `npm test`, `npm run verify|verify:quick|build|lint` (`verify:` prefix included), `node tools/verify.mjs`
const GENERIC = [/^npm\s+(test|run\s+(verify|build|lint))\b/, /^node\s+tools\/verify\.mjs\b/];
// no checker AND nothing but generic suites (an empty command counts): such an accept proves nothing about the card
export const isGenericAccept = cmd => {
  const segs = splitAccept(cmd);
  if (acceptCheckers(cmd).length) return false;
  return !segs.length || segs.every(s => GENERIC.some(re => re.test(s)));
};

// scope: the plan's Files list plus every checker its accept command names (T49 was scope:OUT for its own checker).
// An empty list stays empty: `outOfScope` reads that as "not parsable", which must not turn into "everything is stray".
export const allowedWithCheckers = (allowed, cmd) =>
  allowed.length ? [...new Set([...allowed, ...acceptCheckers(cmd)])] : allowed;
