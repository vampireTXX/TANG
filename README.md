# PIXEL·DROP — 像素颗粒模块化图片投放站

一个以像素颗粒与模块化视觉为核心的响应式图片画廊 / 投稿站。

## 特性
- **鼠标跟随像素粒子波动**：全屏 canvas，低分辨率离屏缓冲放大渲染硬边像素块；鼠标移动散发生成粒子，并周期性发出环向脉冲形成「散发式波动」。`prefers-reduced-motion` 下自动关闭。
- **模块化响应式画廊**：`auto-fill` 自适应 1→4 列；图片经低分辨率重绘 + `image-rendering: pixelated` 像素化，右上角一键切换「像素 / 清晰」。
- **分类筛选 + 灯箱**：全部 / 风景 / 城市 / 人物 / 抽象 / 投稿；灯箱支持 ←→ 翻页与 Esc 关闭。
- **真实后端投稿**：投稿图片通过 Cloudflare Pages Functions 写入 KV 命名空间，刷新后仍可见（非仅前端预览）。

## 后端接口（Cloudflare Pages Functions）
- `POST /api/upload` — multipart 上传图片（jpg/png/webp/gif/avif，≤5MB），返回 `{ ok, id, url, name }`
- `GET  /api/images` — 列出已上传图片
- `GET  /api/asset/:id` — 按 id 返回图片二进制

## 本地预览
在项目目录运行静态服务器即可，例如：
```bash
python3 -m http.server 8080
# 打开 http://localhost:8080
```
（本地预览时 `/api/*` 后端不可用，投稿会回退为浏览器内预览；部署到 Cloudflare Pages 后即为真实持久化。）

## 部署
代码位于仓库根目录（含 `functions/`），推送到 `main` 分支即由 Cloudflare Pages 自动构建部署。需在项目设置中绑定 KV 命名空间（绑定名 `PIXEL_BUCKET`）。
