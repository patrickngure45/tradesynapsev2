import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next_bad_*/**",
    "out/**",
    "build/**",
    ".server/**",
    "scripts/**",
    "next-env.d.ts",
  ]),

  // This codebase includes a number of intentional `any` usages (especially in
  // API boundary parsing). Treat them as warnings so `npm run lint` is usable.
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;
