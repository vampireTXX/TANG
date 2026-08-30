/**
 * POST /api/upload
 * 接收 multipart/form-data 图片。
 *   - 若 KV 中配置了群晖 NAS（cfg:NAS_BASE / cfg:NAS_USER / cfg:NAS_PASS），
 *     文件写入 NAS 的 /shanchuan/<分类>/ 目录，KV 仅保存轻量索引。
 *   - 否则回退 Cloudflare KV（base64 整图存储）。
 * NAS 凭据存于 KV 的 cfg:* 键（不进仓库、不进 Pages 环境变量），
 * 由本函数运行时从 KV 读取。
 */
const ACCT = "15e7bfc2475d3ac5e82b087b43b86aa9";
const NS = "26a1a51ecec9466f8a4ecb2661bcd1b0";
const KV = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${NS}`;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX = 5 * 1024 * 1024;

function extOf(type) {
  return ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif" })[type] || ".bin";
}

async function kvGet(env, key) {
  const token = env.CF_KV_TOKEN;
  if (!token) return "";
  const r = await fetch(`${KV}/values/${key}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return "";
  return (await r.text()).trim();
}

// 群晖 NAS 配置取自 KV 的 cfg:* 键
async function loadNasConfig(env) {
  const [NAS_BASE, NAS_USER, NAS_PASS, NAS_DIR] = await Promise.all([
    kvGet(env, "cfg:NAS_BASE"),
    kvGet(env, "cfg:NAS_USER"),
    kvGet(env, "cfg:NAS_PASS"),
    kvGet(env, "cfg:NAS_DIR"),
  ]);
  return { NAS_BASE, NAS_USER, NAS_PASS, NAS_DIR };
}

function safeFolder(name) {
  return (name || "投稿").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().slice(0, 24) || "投稿";
}

/* ---------- 群晖 NAS (DSM File Station) ---------- */
async function nasLogin(cfg) {
  const u = new URL(cfg.NAS_BASE.replace(/\/+$/, "") + "/webapi/auth.cgi");
  u.searchParams.set("api", "SYNO.API.Auth");
  u.searchParams.set("version", "7");
  u.searchParams.set("method", "login");
  u.searchParams.set("account", cfg.NAS_USER);
  u.searchParams.set("passwd", cfg.NAS_PASS);
  u.searchParams.set("session", "FileStation");
  u.searchParams.set("format", "sid");
  const r = await fetch(u.toString(), { method: "POST" });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error("NAS 登录失败: " + JSON.stringify(j.error || r.status));
  return j.data.sid;
}

async function nasUpload(cfg, sid, bytes, dir, filename) {
  const url = new URL(cfg.NAS_BASE.replace(/\/+$/, "") + "/webapi/entry.cgi");
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

    const cfg = await loadNasConfig(env);
    const useNas = !!(cfg.NAS_BASE && cfg.NAS_USER && cfg.NAS_PASS);
    const baseDir = (cfg.NAS_DIR || "/pixel-drop").replace(/\/+$/, "");
    const dir = baseDir + "/" + category;   // 例：/shanchuan/风景
    let store = "kv";
    let nasPath = "";

    if (useNas) {
      try {
        const sid = await nasLogin(cfg);
        nasPath = await nasUpload(cfg, sid, bytes, dir, id + extOf(type));
        store = "nas";
      } catch (e) {
        // NAS 不可达（如被 GFW 阻断）时回退 KV，保证上传不失败
        store = "kv";
        nasPath = "";
      }
    }
    if (store === "kv") {
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
