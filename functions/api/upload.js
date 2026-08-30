/**
 * POST /api/upload
 * 接收 multipart/form-data 图片，通过 Cloudflare KV REST API 写入命名空间。
 * 凭据取自环境变量 env.CF_KV_TOKEN（已在项目设置中配置为 secret）。
 */
const ACCT = "15e7bfc2475d3ac5e82b087b43b86aa9";
const NS = "26a1a51ecec9466f8a4ecb2661bcd1b0";
const KV = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${NS}`;

export async function onRequestPost({ request, env }) {
  const token = env.CF_KV_TOKEN;
  if (!token) return Response.json({ ok: false, error: "服务端未配置 KV 凭据" }, { status: 500 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ ok: false, error: "缺少文件" }, { status: 400 });
    }
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
    if (!allowed.includes(file.type)) {
      return Response.json({ ok: false, error: "不支持的图片格式（仅 jpg/png/webp/gif/avif）" }, { status: 415 });
    }
    const max = 5 * 1024 * 1024;
    if (file.size > max) {
      return Response.json({ ok: false, error: "图片过大（上限 5MB）" }, { status: 413 });
    }
    const id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const name = String(file.name || "untitled").slice(0, 80);
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
    }
    const b64 = btoa(bin);
    const value = JSON.stringify({ t: file.type, n: name, c: "投稿", d: b64 });
    const r = await fetch(`${KV}/values/img:${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: value,
    });
    if (!r.ok) return Response.json({ ok: false, error: "KV 写入失败(" + r.status + ")" }, { status: 500 });
    return Response.json({ ok: true, id, url: "/api/asset/" + id, name, cat: "投稿" });
  } catch (e) {
    return Response.json({ ok: false, error: "服务器错误：" + (e && e.message ? e.message : e) }, { status: 500 });
  }
}
