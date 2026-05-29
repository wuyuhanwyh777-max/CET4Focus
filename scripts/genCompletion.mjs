import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Read missing words
const missingPath = resolve(ROOT, "data/missingExamples.txt");
if (!existsSync(missingPath)) { console.log("No missingExamples.txt"); process.exit(1); }
const missing = readFileSync(missingPath, "utf8").split(/\r?\n/).filter(Boolean).map(s => s.trim().toLowerCase());

// Read CET-4 word data
const cet4Content = readFileSync(resolve(ROOT, "src/data/cet4Words.ts"), "utf8");
const wordData = new Map();
const wRe = /w\("([^"]+)",\s*"([^"]*)",\s*"([^"]*)"/g;
let m;
while ((m = wRe.exec(cet4Content)) !== null) {
  wordData.set(m[1].toLowerCase(), { pos: m[2], zh: m[3] });
}

// Load existing generated
const genPath = resolve(ROOT, "src/data/generatedExamples.json");
let generated = {};
if (existsSync(genPath)) { try { generated = JSON.parse(readFileSync(genPath, "utf8")); } catch {} }

// Load completion
const compPath = resolve(ROOT, "src/data/completionExamples.json");
let completion = {};
if (existsSync(compPath)) { try { completion = JSON.parse(readFileSync(compPath, "utf8")); } catch {} }

// Templates
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

const nounTemplates = [
  (w, zh) => ({ en: `The teacher explained the meaning of ${w} to the students.`, cn: `老师向学生们解释了${zh}的含义。` }),
  (w, zh) => ({ en: `${capitalize(w)} is an important topic discussed in the meeting.`, cn: `${zh}是会议中讨论的一个重要话题。` }),
  (w, zh) => ({ en: `We need to pay more attention to the issue of ${w}.`, cn: `我们需要更加关注${zh}的问题。` }),
  (w, zh) => ({ en: `A clear understanding of ${w} is necessary for this task.`, cn: `清楚地理解${zh}对这项任务是必要的。` }),
  (w, zh) => ({ en: `The book provides a detailed introduction to ${w}.`, cn: `这本书详细介绍了${zh}。` }),
  (w, zh) => ({ en: `He gave a presentation about ${w} at the conference.`, cn: `他在会议上做了一个关于${zh}的报告。` }),
  (w, zh) => ({ en: `Many researchers are studying the effects of ${w}.`, cn: `许多研究者正在研究${zh}的影响。` }),
  (w, zh) => ({ en: `${capitalize(w)} plays a key role in this area of research.`, cn: `${zh}在这个研究领域中起着关键作用。` }),
  (w, zh) => ({ en: `She is writing a paper on ${w} for her university course.`, cn: `她正在为大学课程写一篇关于${zh}的论文。` }),
  (w, zh) => ({ en: `I learned a lot about ${w} from the lecture yesterday.`, cn: `我从昨天的讲座中学到了很多关于${zh}的知识。` }),
];

const verbTemplates = [
  (w, zh) => ({ en: `We should learn how to ${w} this kind of problem.`, cn: `我们应该学会如何${zh}这类问题。` }),
  (w, zh) => ({ en: `She decided to ${w} the plan before taking action.`, cn: `她决定先${zh}计划再采取行动。` }),
  (w, zh) => ({ en: `It is important to ${w} all the information carefully.`, cn: `仔细${zh}所有信息是很重要的。` }),
  (w, zh) => ({ en: `He tried to ${w} the situation as best as he could.`, cn: `他尽最大努力${zh}了局势。` }),
  (w, zh) => ({ en: `The team worked hard to ${w} the project on time.`, cn: `团队努力按时${zh}了这个项目。` }),
  (w, zh) => ({ en: `You need to ${w} this matter as soon as possible.`, cn: `你需要尽快${zh}这件事。` }),
  (w, zh) => ({ en: `They are learning to ${w} new technology in the classroom.`, cn: `他们正在学习在课堂上${zh}新技术。` }),
  (w, zh) => ({ en: `We must ${w} the challenges we face with courage.`, cn: `我们必须勇敢地${zh}我们面临的挑战。` }),
];

const adjTemplates = [
  (w, zh) => ({ en: `This is a very ${w} issue that deserves our attention.`, cn: `这是一个非常${zh}的问题，值得我们的关注。` }),
  (w, zh) => ({ en: `The results of the experiment were quite ${w}.`, cn: `实验结果相当${zh}。` }),
  (w, zh) => ({ en: `She has a very ${w} attitude toward her work.`, cn: `她对工作有一种非常${zh}的态度。` }),
  (w, zh) => ({ en: `We need to find a more ${w} solution to this challenge.`, cn: `我们需要找到更${zh}的解决方案。` }),
  (w, zh) => ({ en: `The weather today is rather ${w} for this time of year.`, cn: `今天的天气在一年中的这个时候算是相当${zh}的。` }),
];

const advTemplates = [
  (w, zh) => ({ en: `She solved the problem ${w} and effectively.`, cn: `她${zh}且有效地解决了问题。` }),
  (w, zh) => ({ en: `The team acted ${w} to meet the tight deadline.`, cn: `团队${zh}地行动以应对紧张的截止日期。` }),
  (w, zh) => ({ en: `He spoke ${w} about his experience during the meeting.`, cn: `他在会议上${zh}地谈到了自己的经历。` }),
];

function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i); return Math.abs(h); }

function getZhClean(zh) {
  return zh.split(/[；;，,]/)[0].replace(/[（(].*[）)]/g, "").replace(/^[nvad.]+\.?\s*/, "").trim();
}

function generateExample(word, pos, zh) {
  const mainPos = (pos.split("/")[0] || "").trim();
  const zhClean = getZhClean(zh);
  const idx = hashCode(word);

  let templates;
  if (mainPos.startsWith("v.")) templates = verbTemplates;
  else if (mainPos.startsWith("adj.")) templates = adjTemplates;
  else if (mainPos.startsWith("adv.")) templates = advTemplates;
  else templates = nounTemplates;

  const t = templates[idx % templates.length];
  return t(word, zhClean);
}

let added = 0;
for (const word of missing) {
  if (generated[word] || completion[word]) continue;
  const data = wordData.get(word);
  if (!data) { console.log(`SKIP ${word}: no data`); continue; }
  const ex = generateExample(word, data.pos, data.zh);
  completion[word] = { exampleEn: ex.en, exampleCn: ex.cn, source: "manual-completion" };
  writeFileSync(compPath, JSON.stringify(completion, null, 2), "utf8");
  added++;
  if (added % 100 === 0) console.log(`...${added} examples written`);
}

console.log(`Done. Added ${added} examples to completionExamples.json`);
