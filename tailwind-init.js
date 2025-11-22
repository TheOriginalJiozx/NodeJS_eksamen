import { writeFileSync } from "node:fs";

// Simpel Tailwind config template
const config = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: { extend: {} },
  plugins: [],
};`;

writeFileSync("tailwind.config.cjs", config);
writeFileSync("postcss.config.cjs", `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };`);

console.log("Tailwind config files created!");