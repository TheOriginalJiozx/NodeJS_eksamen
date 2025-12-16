import { writeFileSync } from "node:fs";
import logger from "./src/lib/logger.js";

// Simpel Tailwind config template
const config = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: { extend: {} },
  plugins: [],
};`;

writeFileSync("tailwind.config.cjs", config);
writeFileSync("postcss.config.cjs", `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };`);

logger.info("Tailwind config files created!");