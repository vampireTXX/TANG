# PIXEL·DROP — 像素颗粒模块化图片投放站

一个以像素颗粒与模块化视觉为核心的响应式图片画廊 / 投稿站。

## 特性
- **鼠标跟随水波纹像素波动**：全屏 canvas，低分辨率离屏缓冲放大渲染硬边像素块；鼠标移动时低频生成柔和水波环、缓慢向外扩散（最多 4 圈，软高斯环），点击产生一圈更明显的涟漪。`prefers-reduced-motion` 下自动关闭。
- **模块化响应式画廊**：`auto-fill` 自适应 1→4 列；图片经低分辨率重绘 + `image-rendering: pixelated` 像素化，右上角一键切换「像素 / 清晰」。
- **分类筛选 + 灯箱**：全部 / 风景 / 城市 / 人物 / 抽象 / 投稿；灯箱支持 ←→ 翻页与 Esc 关闭。
- **真实后端投稿（可存群晖 NAS）**：投稿图片通过 Cloudflare Pages Functions 持久化。默认存入 Cloudflare KV；若配置 `NAS_*` 环境变量，则文件写入你的群晖 NAS（DSM File Station），KV 仅存轻量索引，画廊经 Functions 代理取流展示。

## 后端接口（Cloudflare Pages Functions）
- `POST /api/upload` — multipart 上传图片（jpg/png/webp/gif/avif，≤5MB），返回 `{ ok, id, url, name, store }`
- `GET  /api/images` — 列出已上传图片
- `GET  /api/asset/:id` — 按 id 返回图片二进制（NAS 存储时从群晖取流）

## 切换到群晖 NAS 存储
在项目「设置 → 环境变量」中增加（secret）：
- `NAS_BASE`：如 `https://nas.example.com:5001`（需公网可达 + 有效 HTTPS 证书，否则 Cloudflare 边缘无法访问）
- `NAS_USER` / `NAS_PASS`：NAS 账号密码
- `NAS_DIR`（可选，默认 `/pixel-drop`）

配置后新上传的图片直接落在你的 NAS 上。

## 本地预览
在项目目录运行静态服务器即可，例如：
```bash
python3 -m http.server 8080
# 打开 http://localhost:8080
```
（本地预览时 `/api/*` 后端不可用，投稿会回退为浏览器内预览；部署到 Cloudflare Pages 后即为真实持久化。）

## 部署
代码位于仓库根目录（含 `functions/`），推送到 `main` 分支即由 Cloudflare Pages 自动构建部署。需配置 `CF_KV_TOKEN`（KV REST 凭据，已设为 secret）。
