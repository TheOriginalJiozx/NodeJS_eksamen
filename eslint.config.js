// eslint.config.js
import { defineConfig } from "eslint/config";
import js from "@eslint/js";

export default defineConfig([
  {
    // Kun JS/TS filer i src-mappen
    files: ["src/**/*.{js,ts}"],

    // Ignorer alt andet
    ignores: [
      "node_modules",
      "build",
      "dist",
      ".svelte-kit",
      "**/*.svelte",
      "**/*.d.ts"
    ],

    ...js.configs.recommended,

    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      semi: ["error", "always"],
      quotes: ["error", "single"],
      "no-unused-vars": ["warn"],
      "no-empty": ["warn"]
    }
  }
]);