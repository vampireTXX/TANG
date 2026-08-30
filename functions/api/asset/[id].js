/**
 * GET /api/asset/:id
 * 根据存储位置返回图片二进制：
 *   - meta:<id>.store == 'nas'  -> 从群晖 NAS 取流返回（图片真实存放在用户 NAS）
 *   - 否则                       -> 从 KV 的 img:<id> base64 解码返回（回退/旧数据）
 * 凭据取自环境变量：CF_KV_TOKEN（必填）、NAS_*（nas 模式下必填）。
 */
const ACCT = "15e7bfc2475d3ac5e82b087b43b86aa9";
const NS = "26a1a51ecec9466f8a4ecb2661bcd1b0";
const KV = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/storage/kv/namespaces/${NS}`;

/* ---------- 群晖 NAS ---------- */
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

async function nasDownload(env, nasPath) {
  const sid = await nasLogin(env);
  const u = new URL(env.NAS_BASE.replace(/\/+$/, "") + "/webapi/entry.cgi");
  u.searchParams.set("api", "SYNO.FileStation.Download");
  u.searchParams.set("version", "2");
  u.searchParams.set("method", "download");
  u.searchParams.set("path", nasPath);
  u.searchParams.set("mode", "download");
  u.searchParams.set("_sid", sid);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error("NAS 下载失败: " + r.status);
  return r;
}

export async function onRequestGet({ env, params }) {
  const token = env.CF_KV_TOKEN;
  const id = params.id;
  if (!token) return new Response("服务端未配置 KV 凭据", { status: 500 });
  if (!id) return new Response("Missing id", { status: 400 });

  // 1) 读取索引，判断是否 NAS 存储
  const gm = await fetch(`${KV}/values/meta:${id}`, { headers: { Authorization: `Bearer ${token}` } });
  let meta = {};
  if (gm.ok) { try { meta = await gm.json(); } catch (e) {} }

  if (meta.store === "nas" && meta.nasPath && env.NAS_BASE && env.NAS_USER && env.NAS_PASS) {
    try {
      const nasRes = await nasDownload(env, meta.nasPath);
      return new Response(nasRes.body, {
        headers: {
          "content-type": meta.t || "image/jpeg",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    } catch (e) {
      return new Response("NAS 取流失败: " + (e && e.message ? e.message : e), { status: 502 });
    }
  }

  // 2) 回退 / 旧数据：从 KV 整图 base64 读取
  const g = await fetch(`${KV}/values/img:${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!g.ok) return new Response("Not found", { status: 404 });
  let data = {};
  try { data = await g.json(); } catch (e) {}
  if (!data.d) return new Response("Bad data", { status: 500 });
  const bin = atob(data.d);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      "content-type": data.t || "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
