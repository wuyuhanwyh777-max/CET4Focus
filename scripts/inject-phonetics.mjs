import { readFileSync, writeFileSync } from "fs";

// 1. Build ECDICT phonetic map
console.log("Reading ECDICT...");
const csv = readFileSync("ecdict.csv", "utf-8");
const lines = csv.split("\n");
const phoneticMap = new Map();

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const firstComma = line.indexOf(",");
  if (firstComma === -1) continue;
  const word = line.slice(0, firstComma).toLowerCase().trim();
  const rest = line.slice(firstComma + 1);
  const secondComma = rest.indexOf(",");
  const phonetic = secondComma > -1 ? rest.slice(0, secondComma).trim() : rest.trim();
  if (phonetic && !phoneticMap.has(word)) {
    phoneticMap.set(word, phonetic);
  }
}
console.log(`Loaded ${phoneticMap.size} phonetics from ECDICT`);

// 2. Update cet4Words.ts
console.log("Updating cet4Words.ts...");
const cet4Path = "src/data/cet4Words.ts";
let content = readFileSync(cet4Path, "utf-8");

let updated = 0;
let missing = 0;

// Match each w(...) call — handles both with and without phonetic params
content = content.replace(
  /w\("([^"]+)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*(true|false),\s*(true|false),\s*(\[[^\]]*\])\)/g,
  (fullMatch, word, pos, zh, en, high, key, tags) => {
    const phonetic = phoneticMap.get(word.toLowerCase());
    if (phonetic) {
      const safePhonetic = phonetic.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      updated++;
      return `w("${word}", "${pos}", "${zh}", "${en}", ${high}, ${key}, ${tags}, "${safePhonetic}", "${safePhonetic}")`;
    }
    missing++;
    return fullMatch;
  }
);

// Handle already-injected lines (one phonetic + empty): re-inject with both UK/US filled
content = content.replace(
  /w\("([^"]+)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*(true|false),\s*(true|false),\s*(\[[^\]]*\]),\s*"([^"]*)",\s*"([^"]*)"\)/g,
  (fullMatch, word, pos, zh, en, high, key, tags, uk, us) => {
    const phonetic = phoneticMap.get(word.toLowerCase());
    if (phonetic && (!us || us === "")) {
      const safePhonetic = phonetic.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      updated++;
      return `w("${word}", "${pos}", "${zh}", "${en}", ${high}, ${key}, ${tags}, "${safePhonetic}", "${safePhonetic}")`;
    }
    return fullMatch;
  }
);

writeFileSync(cet4Path, content, "utf-8");

// 3. Also update the w() function to accept phonetic params
// (it already does — no change needed)

console.log(`Updated: ${updated}, Missing phonetic: ${missing}`);
console.log("Done! Check src/data/cet4Words.ts");
