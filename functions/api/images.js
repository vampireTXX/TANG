/**
 * GET /api/images
 * 通过 Cloudflare KV REST API 列出已上传的图片（最新在前）。
 * 凭据取自环境变量 env.CF_KV_TOKEN。
 */
const ACCT = "15e7bfc2475d3ac5e82b087b43b86aa9";
const NS = "26a1a51ecec9466f8a4ecb2661bcd1b0";
const KV = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${NS}`;

export async function onRequestGet({ env }) {
  const token = env.CF_KV_TOKEN;
  if (!token) return Response.json({ ok: false, error: "服务端未配置 KV 凭据" }, { status: 500 });
  try {
    const r = await fetch(`${KV}/keys?prefix=img:`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return Response.json({ ok: false, error: "KV 读取失败(" + r.status + ")" }, { status: 500 });
    const data = await r.json();
    const keys = (data.result || []).map((k) => k.name);
    const items = [];
    for (const key of keys) {
      const id = key.slice(4); // 去掉 "img:" 前缀
      const g = await fetch(`${KV}/values/${key}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!g.ok) continue;
      let meta = {};
      try { meta = await g.json(); } catch (e) {}
      items.push({ id, name: meta.n || id, cat: meta.c || "投稿", url: "/api/asset/" + id });
    }
    items.sort((a, b) => String(b.id).localeCompare(String(a.id)));
    return Response.json(items);
  } catch (e) {
    return Response.json({ ok: false, error: String(e && e.message ? e.message : e) }, { status: 500 });
  }
}
