export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/youdao/, "");
  const target = `https://dict.youdao.com${path}${url.search}`;
  try {
    const r = await fetch(target);
    return new Response(await r.text(), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "代理失败" }), { status: 502 });
  }
};
