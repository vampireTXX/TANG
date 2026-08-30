/**
 * POST /api/upload
 * 接收 multipart/form-data 的图片，写入绑定的 KV 命名空间（base64 + 元信息），
 * 返回可访问地址。绑定名：PIXEL_BUCKET
 */
export async function onRequestPost({ request, env }) {
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
    await env.PIXEL_BUCKET.put("img:" + id, value);
    return Response.json({ ok: true, id, url: "/api/asset/" + id, name, cat: "投稿" });
  } catch (e) {
    return Response.json({ ok: false, error: "服务器错误：" + (e && e.message ? e.message : e) }, { status: 500 });
  }
}
