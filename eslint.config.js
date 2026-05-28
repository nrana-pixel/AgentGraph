// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

const sharedRules = {
  ...tseslint.configs["recommended"].rules,
  "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/consistent-type-imports": [
    "error",
    { prefer: "type-imports" },
  ],
};

export default [
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**"],
  },
  {
    // Source files get type-aware parsing via the package tsconfigs.
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: true,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: sharedRules,
  },
  {
    // Test files are excluded from the build tsconfigs (so they don't land in
    // dist), so they aren't in any project. The rules below are all syntactic,
    // so parse them without a project rather than forcing them into one.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    languageOptions: {
      parser: tsparser,
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...sharedRules,
      // Test doubles legitimately use `any` to mock query-builder chains.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
