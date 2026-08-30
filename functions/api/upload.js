/**
 * POST /api/upload
 * 接收 multipart/form-data 图片。
 *   - 若配置了群晖 NAS（env.NAS_BASE / NAS_USER / NAS_PASS），文件写入 NAS，
 *     KV 仅保存轻量索引 {store:'nas', nasPath, n, c, t}。
 *   - 否则回退 Cloudflare KV（base64 整图存储）。
 * 凭据取自环境变量：CF_KV_TOKEN（必填）、NAS_*（可选）。
 */
const ACCT = "15e7bfc2475d3ac5e82b087b43b86aa9";
const NS = "26a1a51ecec9466f8a4ecb2661bcd1b0";
const KV = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${NS}`;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX = 5 * 1024 * 1024;

function extOf(type) {
  return ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif" })[type] || ".bin";
}

/* ---------- 群晖 NAS (DSM File Station) ---------- */
async function nasLogin(env) {
  const u = new URL(env.NAS_BASE.replace(/\/+$/, "") + "/webapi/auth.cgi");
  u.searchParams.set("api", "SYNO.API.Auth");
  u.searchParams.set("version", "7");
  u.searchParams.set("method", "login");
  u.searchParams.set("account", env.NAS_USER);
  u.searchParams.set("passwd", env.NAS_PASS);
  u.searchParams.set("session", "FileStation");
  u.searchParams.set("format", "sid");
  const r = await fetch(u.toString(), { method: "POST" });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error("NAS 登录失败: " + JSON.stringify(j.error || r.status));
  return j.data.sid;
}

async function nasUpload(env, sid, bytes, dir, filename) {
  const url = new URL(env.NAS_BASE.replace(/\/+$/, "") + "/webapi/entry.cgi");
  url.searchParams.set("api", "SYNO.FileStation.Upload");
  url.searchParams.set("version", "2");
  url.searchParams.set("method", "upload");
  url.searchParams.set("_sid", sid);
  const form = new FormData();
  form.append("path", dir);
  form.append("create_parents", "true");
  form.append("file", new Blob([bytes]), filename);
  const r = await fetch(url.toString(), { method: "POST", body: form });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error("NAS 上传失败: " + JSON.stringify(j.error || r.status));
  return dir + "/" + filename;
}

// 仅保留安全字符，避免路径穿越 / 非法文件名（中文分类名保留）
function safeFolder(name) {
  return (name || "投稿").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().slice(0, 24) || "投稿";
}

export async function onRequestPost({ request, env }) {
  const token = env.CF_KV_TOKEN;
  if (!token) return Response.json({ ok: false, error: "服务端未配置 KV 凭据" }, { status: 500 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ ok: false, error: "缺少文件" }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return Response.json({ ok: false, error: "不支持的图片格式（仅 jpg/png/webp/gif/avif）" }, { status: 415 });
    }
    if (file.size > MAX) {
      return Response.json({ ok: false, error: "图片过大（上限 5MB）" }, { status: 413 });
    }
    const id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const name = String(file.name || "untitled").slice(0, 80);
    const type = file.type;
    const category = safeFolder(form.get("category"));
    const bytes = new Uint8Array(await file.arrayBuffer());

    const useNas = !!(env.NAS_BASE && env.NAS_USER && env.NAS_PASS);
    const baseDir = (env.NAS_DIR || "/pixel-drop").replace(/\/+$/, "");
    const dir = baseDir + "/" + category;   // 例：/shanchuan/风景
    let store = "kv";
    let nasPath = "";

    if (useNas) {
      const sid = await nasLogin(env);
      nasPath = await nasUpload(env, sid, bytes, dir, id + extOf(type));
      store = "nas";
    } else {
      // KV 回退：整图以 base64 存储
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      const value = JSON.stringify({ t: type, n: name, c: category, d: btoa(bin) });
      const r = await fetch(`${KV}/values/img:${id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: value,
      });
      if (!r.ok) return Response.json({ ok: false, error: "KV 写入失败(" + r.status + ")" }, { status: 500 });
    }

    // 索引（两路存储都写，便于 /api/images 统一列出）
    const meta = JSON.stringify({ store, nasPath, n: name, c: category, t: type });
    await fetch(`${KV}/values/meta:${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: meta,
    });

    return Response.json({ ok: true, id, store, url: "/api/asset/" + id, name, cat: category });
  } catch (e) {
    return Response.json({ ok: false, error: "服务器错误：" + (e && e.message ? e.message : e) }, { status: 500 });
  }
}
