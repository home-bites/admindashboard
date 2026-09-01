/**
 * Lint entry point.
 *
 * ESLint 9 defaults to flat config; this project uses the eslintrc format, so
 * the compatibility flag has to be set before ESLint loads. Doing it here
 * rather than inline in the npm script keeps it working on Windows shells,
 * which do not accept `VAR=value cmd`.
 *
 * Exists because there was no static analysis at all: `vite build` was the
 * only gate, and it does no scope analysis — an undefined identifier or a
 * conditionally-called hook builds cleanly and crashes at runtime. Both of
 * those were found here the first time this ran.
 */
process.env.ESLINT_USE_FLAT_CONFIG = "false";
const { ESLint } = await import("eslint");

// ESLint 9 removed the `extensions` option; the glob does the same job and
// works on both major versions.
const eslint = new ESLint();
const results = await eslint.lintFiles(["src/**/*.js", "src/**/*.jsx"]);
const formatter = await eslint.loadFormatter("stylish");
const output = formatter.format(results);
if (output) console.log(output);

const errors = results.reduce((n, r) => n + r.errorCount, 0);
const warnings = results.reduce((n, r) => n + r.warningCount, 0);
console.log(`\n${errors} error(s), ${warnings} warning(s)`);
// Only errors fail the build. The existing warnings are pre-existing unused
// imports across 26k lines; failing on them would make the gate unusable and
// it would simply be switched off.
process.exit(errors > 0 ? 1 : 0);
