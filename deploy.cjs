const original = require("os").hostname;
require("os").hostname = () => "pc";
const { execSync } = require("child_process");
execSync("npx vercel login --cwd " + __dirname, { stdio: "inherit" });
