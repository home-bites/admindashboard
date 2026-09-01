/**
 * Static checks for the admin dashboard.
 *
 * There was no linter and no type checker here, so `vite build` was the only
 * gate — and Vite does no scope analysis. An identifier that does not exist,
 * or a hook called conditionally, builds perfectly and then throws at runtime.
 * Both of those existed in this codebase and were found the first time this
 * config ran.
 *
 * The rule set is deliberately narrow: correctness rules that catch real
 * runtime faults, not style opinions that would bury them under hundreds of
 * findings across 26,000 pre-existing lines.
 */
import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**", "*.config.js", "scripts/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      // The two that matter most here — both are runtime crashes a build
      // cannot see.
      "no-undef": "error",
      "react-hooks/rules-of-hooks": "error",

      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^(_|React)" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],

      // JSX correctness without the style noise.
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];
