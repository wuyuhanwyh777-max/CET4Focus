export default async function handler(req, res) {
  const path = req.url.replace(/^\/api\/youdao/, "");
  const target = `https://dict.youdao.com${path}`;
  try {
    const r = await fetch(target);
    const data = await r.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);
  } catch {
    res.status(502).json({ error: "代理请求失败" });
  }
}
