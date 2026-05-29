import { readFileSync, writeFileSync } from "fs";

let app = readFileSync("src/App.tsx", "utf8");

// 1. Remove sync-pill line (the whole div line)
app = app.replace(/[ \t]*<div className=\{`sync-pill \$\{isLoadingCurrent \? "loading" : "ready"\}`\}>\{isLoadingCurrent \? "正在补全词典数据" : "词典数据已同步"\}<\/div>\n/g, "");

// 2. Merge 词性+中文意思 into one box
const oldBody = `<div className="word-body">
      <div>
        <b>词性</b>
        <p>{meaning.partOfSpeech || "暂无"}</p>
      </div>
      <div>
        <b>中文意思</b>
        <p>{meaning.definitionZh}</p>
      </div>
      <div>
        <b>例句</b>`;

const newBody = `<div className="word-body">
      <div>
        <b>词性</b> {meaning.partOfSpeech || "暂无"}
        <span style={{display:"inline-block",width:12}} />
        <b>中文意思</b> {meaning.definitionZh}
      </div>
      <div>
        <b>例句</b>`;

if (app.includes(oldBody)) {
  app = app.replace(oldBody, newBody);
  console.log("WordBody merged");
} else {
  console.log("WordBody pattern not found — trying regex");
  // Try regex fallback
  app = app.replace(
    /(<div className="word-body">\s*<div>\s*<b>词性<\/b>\s*<p>\{meaning\.partOfSpeech \|\| "暂无"\}<\/p>\s*<\/div>\s*<div>\s*<b>中文意思<\/b>\s*<p>\{meaning\.definitionZh\}<\/p>\s*<\/div>\s*<div>\s*<b>例句<\/b>)/,
    '<div className="word-body">\n      <div>\n        <b>词性</b> {meaning.partOfSpeech || "暂无"}\n        <span style={{display:"inline-block",width:12}} />\n        <b>中文意思</b> {meaning.definitionZh}\n      </div>\n      <div>\n        <b>例句</b>'
  );
}

// 3. Remove English definition (already done — verify)
if (app.includes("英文释义")) console.log("WARNING: 英文释义 still present");
else console.log("英文释义 already removed");

writeFileSync("src/App.tsx", app);
console.log("Done");
