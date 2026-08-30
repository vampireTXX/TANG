/**
 * GET /api/images
 * 通过 Cloudflare KV 列出已上传图片（最新在前）。
 * 兼容两种键：meta:<id>（新，含 store 字段）、img:<id>（旧，整图 base64）。
 * 凭据取自环境变量 env.CF_KV_TOKEN。
 */
const ACCT = "15e7bfc2475d3ac5e82b087b43b86aa9";
const NS = "26a1a51ecec9466f8a4ecb2661bcd1b0";
const KV = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${NS}`;

export async function onRequestGet({ env }) {
  const token = env.CF_KV_TOKEN;
  if (!token) return Response.json({ ok: false, error: "服务端未配置 KV 凭据" }, { status: 500 });
  try {
    const items = [];
    const seen = new Set();
    const addFromMeta = (key, meta) => {
      const id = key.slice(key.indexOf(":") + 1);
      if (seen.has(id)) return;
      seen.add(id);
      items.push({ id, name: meta.n || id, cat: meta.c || "投稿", url: "/api/asset/" + id });
    };

    // 新索引：meta:<id>
    const rm = await fetch(`${KV}/keys?prefix=meta:`, { headers: { Authorization: `Bearer ${token}` } });
    if (rm.ok) {
      const dm = await rm.json();
      for (const k of dm.result || []) {
        const g = await fetch(`${KV}/values/${k.name}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!g.ok) continue;
        let meta = {};
        try { meta = await g.json(); } catch (e) {}
        addFromMeta(k.name, meta);
      }
    }
    // 旧记录兼容：img:<id>
    const ri = await fetch(`${KV}/keys?prefix=img:`, { headers: { Authorization: `Bearer ${token}` } });
    if (ri.ok) {
      const di = await ri.json();
      for (const k of di.result || []) {
        const g = await fetch(`${KV}/values/${k.name}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!g.ok) continue;
        let meta = {};
        try { meta = await g.json(); } catch (e) {}
        addFromMeta(k.name, meta);
      }
    }

    items.sort((a, b) => String(b.id).localeCompare(String(a.id)));
    return Response.json(items);
  } catch (e) {
    return Response.json({ ok: false, error: String(e && e.message ? e.message : e) }, { status: 500 });
  }
}
