/**
 * GET /api/images
 * 列出 KV 中已上传的图片（最新在前）。绑定名：PIXEL_BUCKET
 */
export async function onRequestGet({ env }) {
  try {
    const listed = await env.PIXEL_BUCKET.list({ prefix: "img:" });
    const items = [];
    for (const k of listed.keys || []) {
      const id = k.name.slice(4); // 去掉 "img:" 前缀
      const val = await env.PIXEL_BUCKET.get(k.name);
      if (!val) continue;
      let meta = {};
      try { meta = JSON.parse(val); } catch (e) {}
      items.push({
        id,
        name: meta.n || id,
        cat: meta.c || "投稿",
        url: "/api/asset/" + id,
        created: null,
      });
    }
    // id 以时间倒序 base36 开头，字典序近似时间倒序
    items.sort((a, b) => String(b.id).localeCompare(String(a.id)));
    return Response.json(items);
  } catch (e) {
    return Response.json({ ok: false, error: String(e && e.message ? e.message : e) }, { status: 500 });
  }
}
