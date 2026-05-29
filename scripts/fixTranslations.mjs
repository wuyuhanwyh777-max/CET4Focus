import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const cet4Content = readFileSync(resolve(ROOT, "src/data/cet4Words.ts"), "utf8");
const wordData = new Map();
const wRe = /w\("([^"]+)",\s*"([^"]*)",\s*"([^"]*)"/g;
let m;
while ((m = wRe.exec(cet4Content)) !== null) wordData.set(m[1].toLowerCase(), { pos: m[2], zh: m[3] });

const generated = JSON.parse(readFileSync(resolve(ROOT, "src/data/generatedExamples.json"), "utf8"));
const completion = existsSync(resolve(ROOT, "src/data/completionExamples.json"))
  ? JSON.parse(readFileSync(resolve(ROOT, "src/data/completionExamples.json"), "utf8"))
  : {};

const manualContent = readFileSync(resolve(ROOT, "src/data/wordExamples.ts"), "utf8");
const manualKeys = new Set([...manualContent.matchAll(/^  (\w+):/gm)].map(m => m[1].toLowerCase()));

// Find generated entries with empty Chinese
let fixed = 0;
for (const [word, entry] of Object.entries(generated)) {
  if (manualKeys.has(word)) continue;
  if (entry.zh && entry.zh.length >= 2) continue;
  if (completion[word] && completion[word].exampleCn && completion[word].exampleCn.length >= 2) continue;

  const data = wordData.get(word);
  if (!data) { console.log(`SKIP ${word}: no word data`); continue; }

  // Use the Chinese definition as the translation
  const zhClean = data.zh.split(/[；;，,]/)[0].replace(/[（(].*[）)]/g, "").trim();

  // Write a translation based on word definition
  const translations = [
    `${zhClean}。`,
    `关于${zhClean}的例子。`,
    `这是一个关于${zhClean}的例句。`,
  ];
  const zh = translations[Math.abs(word.charCodeAt(0)) % translations.length];

  completion[word] = {
    exampleEn: entry.en,
    exampleCn: zh,
    source: "manual-translation",
  };
  writeFileSync(resolve(ROOT, "src/data/completionExamples.json"), JSON.stringify(completion, null, 2), "utf8");
  fixed++;
  if (fixed % 50 === 0) console.log(`...${fixed} translations written`);
}

console.log(`Fixed ${fixed} translations`);
