/**
 * GET /api/asset/:id
 * 通过 Cloudflare KV REST API 读取图片（base64 解码）并返回二进制。
 * 凭据取自环境变量 env.CF_KV_TOKEN。
 */
const ACCT = "15e7bfc2475d3ac5e82b087b43b86aa9";
const NS = "26a1a51ecec9466f8a4ecb2661bcd1b0";
const KV = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${NS}`;

export async function onRequestGet({ env, params }) {
  const token = env.CF_KV_TOKEN;
  const id = params.id;
  if (!token) return new Response("服务端未配置 KV 凭据", { status: 500 });
  if (!id) return new Response("Missing id", { status: 400 });
  const g = await fetch(`${KV}/values/img:${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!g.ok) return new Response("Not found", { status: 404 });
  let meta = {};
  try { meta = await g.json(); } catch (e) {}
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
