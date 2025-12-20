import { defineConfig } from "eslint/config";
import js from "@eslint/js";

export default defineConfig([
  {
    files: ["src/**/*.{js,ts}"],

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