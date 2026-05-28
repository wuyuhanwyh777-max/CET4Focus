export default async function handler(req, res) {
  const path = req.url.replace(/^\/api\/bing/, "");
  const target = `https://cn.bing.com${path}`;
  try {
    const r = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const html = await r.text();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(html);
  } catch {
    res.status(502).json({ error: "代理请求失败" });
  }
}
