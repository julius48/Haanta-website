import js from "@eslint/js"
import tseslint from "typescript-eslint"
import globals from "globals"

/**
 * Shared Haanta ESLint config.
 * Security-relevant rules: no eval, no implied eval, no hard-coded colours outside packages/ui.
 */
export const ignores = {
  ignores: ["**/dist/**", "**/.next/**", "**/.medusa/**", "**/coverage/**", "**/node_modules/**", "**/*.d.ts"],
}

export const base = [
  ignores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/__tests__/**", "**/integration-tests/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/no-non-null-assertion": "off" },
  },
]

/** Apps must use design tokens from @haanta/ui; hex colour literals are not allowed. */
export const noHardcodedColours = {
  files: ["**/*.ts", "**/*.tsx"],
  ignores: ["**/*.test.ts", "**/*.test.tsx", "**/e2e/**"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "Literal[value=/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/]",
        message: "Hard-coded colours are not allowed. Use design tokens from @haanta/ui.",
      },
      {
        selector: "TemplateElement[value.raw=/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/]",
        message: "Hard-coded colours are not allowed. Use design tokens from @haanta/ui.",
      },
    ],
  },
}

export default base
