/**
 * GET /api/asset/:id
 * 按 id 从 KV 读取图片（base64 解码）并返回二进制。绑定名：PIXEL_BUCKET
 */
export async function onRequestGet({ env, params }) {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const val = await env.PIXEL_BUCKET.get("img:" + id);
  if (!val) return new Response("Not found", { status: 404 });
  let meta = {};
  try { meta = JSON.parse(val); } catch (e) {}
  if (!meta.d) return new Response("Bad data", { status: 500 });
  const bin = atob(meta.d);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      "content-type": meta.t || "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
