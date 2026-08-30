/* =========================================================
   PIXEL·DROP — 交互脚本
   职责：模块化画廊 · 像素化 · 分类筛选 · 灯箱 · 随机呼吸闪烁像素颗粒背景 · 真实后端投稿
   ========================================================= */
(function () {
  "use strict";

  const PIXEL_RES = 48;   // 网格单元像素分辨率（越小颗粒越粗）
  const LB_RES = 88;      // 灯箱像素分辨率
  const API = "/api";     // Pages Functions 前缀

  /* ---------- 示例数据（picsum 种子图，稳定可复现） ---------- */
  const SEED = "https://picsum.photos/seed/";
  const gallery = [
    { src: SEED + "mtnridge/800/800",  cat: "风景", title: "晨雾山脊",   desc: "低饱和的远山与雾气层叠" },
    { src: SEED + "neonblock/800/800", cat: "城市", title: "霓虹街区",   desc: "夜晚楼宇的色光拼接" },
    { src: SEED + "portraitx/800/800", cat: "人物", title: "像素肖像",   desc: "侧光下的轮廓颗粒" },
    { src: SEED + "colorcube/800/800", cat: "抽象", title: "色块构成",   desc: "随机几何的撞色练习" },
    { src: SEED + "lakeview/800/800",  cat: "风景", title: "镜面湖泊",   desc: "对称构图的静水" },
    { src: SEED + "rooftop/800/800",  cat: "城市", title: "屋顶矩阵",   desc: "俯瞰城市的方格节奏" },
    { src: SEED + "profiley/800/800", cat: "人物", title: "凝视",       desc: "高对比的黑白质感" },
    { src: SEED + "wavesoft/800/800", cat: "抽象", title: "波纹",       desc: "流动的曲线噪声" },
    { src: SEED + "forestp/800/800",  cat: "风景", title: "针叶林",     desc: "密集垂直的线条" },
    { src: SEED + "gridcity/800/800", cat: "城市", title: "立交枢纽",   desc: "交通线的交错网络" },
  ];

  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  const filters = document.getElementById("filters");
  const statusEl = document.getElementById("uploadStatus");

  let activeFilter = "all";

  /* ---------- 像素化绘制（cover 裁剪 + 低分辨率放大） ---------- */
  function drawCover(ctx, img, cw, ch) {
    const ir = img.naturalWidth / img.naturalHeight;
    const cr = cw / ch;
    let sx, sy, sw, sh;
    if (ir > cr) { sh = img.naturalHeight; sw = sh * cr; sx = (img.naturalWidth - sw) / 2; sy = 0; }
    else         { sw = img.naturalWidth;  sh = sw / cr; sx = 0; sy = (img.naturalHeight - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  }

  function pixelateInto(canvas, img, res) {
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    drawCover(ctx, img, res, res);
  }

  /* =========================================================
     实时像素格「呼吸」动画引擎（固定随机式 · 不变形）
     - 把图片降采样成低分辨率像素格（res×res），每个格子位置固定
     - 每个格子按各自的「固定随机相位」做亮度呼吸 -> 像 LED 点阵明灭
     - 叠加一层很慢的全局呼吸，整体像在吸气/呼气
     - 不做任何位移，图片几何完全不变形
     - 仅在 pixel-mode 且非 reduced-motion 时运行
     ========================================================= */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const BREATH_RES = 40;       // 画廊单元像素格数（越大格块越细、越能看清照片轮廓）
  const LB_BREATH_RES = 64;    // 灯箱像素格数
  const BREATH_FPS = 30;       // 动画帧率（顺滑且省电）
  function pixelModeOn() { return document.body.classList.contains("pixel-mode"); }

  const breathViews = new Set();
  let breathRaf = null, breathLast = 0;

  function breathEnsureLoop() {
    if (breathRaf == null) breathRaf = requestAnimationFrame(breathTick);
  }

  function breathTick(now) {
    if (now - breathLast < 1000 / BREATH_FPS) { breathRaf = requestAnimationFrame(breathTick); return; }
    breathLast = now;
    let any = false;
    breathViews.forEach(function (v) {
      if (!v.el.isConnected) { breathViews.delete(v); return; }
      if (v.visible && v.img && v.hasPix && pixelModeOn() && !reduceMotion) { v.frame(now); any = true; }
    });
    breathRaf = any ? requestAnimationFrame(breathTick) : null;
  }

  // 创建一个「固定随机式明暗呼吸」的像素格视图，绑定到某个 canvas
  // 像素格位置固定（不变形）；每个格子按固定随机相位的 sin 做亮度呼吸
  function createBreathView(canvas, res) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const low = document.createElement("canvas");
    low.width = res; low.height = res;
    const lowCtx = low.getContext("2d");
    const pix = new Array(res * res);          // 每个格子原始 [r,g,b]
    const phase = new Float32Array(res * res); // 固定随机相位（生成一次，不随帧变化 -> 不闪烁）

    // 基于线性序列的确定性伪随机 -> 刷新一致、无雪花闪烁
    (function genPhase() {
      let seed = 1337;
      for (let i = 0; i < phase.length; i++) {
        seed = (seed * 9301 + 49297) % 233280;
        phase[i] = (seed / 233280) * Math.PI * 2;
      }
    })();

    const view = {
      el: canvas, img: null, visible: true, hasPix: false,
      setImage: function (image) {
        this.img = image;
        lowCtx.imageSmoothingEnabled = false;
        drawCover(lowCtx, image, res, res);
        try {
          const d = lowCtx.getImageData(0, 0, res, res).data;
          for (let i = 0, j = 0; i < d.length; i += 4, j++) {
            pix[j] = [d[i], d[i + 1], d[i + 2]];
          }
          this.hasPix = true;
        } catch (e) {
          this.hasPix = false; // 跨域无 CORS 头时回退静态像素图
        }
        if (this.hasPix && pixelModeOn() && !reduceMotion) breathEnsureLoop();
        else pixelateStatic(canvas, image, res);
      },
      setVisible: function (v) {
        this.visible = v;
        if (v && this.hasPix && pixelModeOn() && !reduceMotion) breathEnsureLoop();
      },
      frame: function (now) {
        if (!this.hasPix) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return; // 隐藏/灯箱关闭时不绘制
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = Math.max(1, Math.round(rect.width * dpr));
        const H = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
        const block = W / res;
        const t = now * 0.001;
        const global = 0.5 + 0.5 * Math.sin(t * 0.7);   // 全局缓慢呼吸 0..1（约 9s 周期）
        const bw = Math.ceil(block) + 1;                // 略大，避免格子间露缝
        ctx.imageSmoothingEnabled = false;
        for (let y = 0; y < res; y++) {
          for (let x = 0; x < res; x++) {
            const idx = y * res + x;
            const p = pix[idx];
            // 固定随机相位 -> 每格独立呼吸，不同步闪烁
            const local = 0.5 + 0.5 * Math.sin(t * 1.5 + phase[idx]);
            const b = 0.5 + 0.5 * (0.35 * global + 0.65 * local); // 亮度系数 ~0.5..1.0
            const px = Math.round(x * block);
            const py = Math.round(y * block);
            ctx.fillStyle = "rgb(" + ((p[0] * b) | 0) + "," + ((p[1] * b) | 0) + "," + ((p[2] * b) | 0) + ")";
            ctx.fillRect(px, py, bw, bw);
          }
        }
      },
    };
    breathViews.add(view);
    return view;
  }

  function pixelateStatic(canvas, img, res) {
    canvas.width = res; canvas.height = res;
    const c = canvas.getContext("2d");
    c.imageSmoothingEnabled = false;
    drawCover(c, img, res, res);
  }

  // 可视区域观察：只让进入视口的卡片参与动画
  const cellObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      const v = e.target._view;
      if (v) v.setVisible(e.isIntersecting);
    });
  }, { rootMargin: "160px" });

  /* ---------- 构建单个画廊单元 ---------- */
  function buildCell(item) {
    const cell = document.createElement("article");
    cell.className = "cell";
    cell.dataset.cat = item.cat;
    cell.tabIndex = 0;
    cell.setAttribute("role", "button");
    cell.setAttribute("aria-label", item.title + "（" + item.cat + "）");

    const media = document.createElement("div");
    media.className = "cell__media";

    const canvas = document.createElement("canvas");
    canvas.className = "cell__canvas";

    const img = document.createElement("img");
    img.className = "cell__img";
    img.alt = item.title;
    img.loading = "lazy";
    img.crossOrigin = "anonymous"; // 允许 getImageData 读取像素（呼吸动画需要）

    const tag = document.createElement("span");
    tag.className = "cell__tag";
    tag.textContent = item.cat;

    media.append(canvas, img, tag);

    const meta = document.createElement("div");
    meta.className = "cell__meta";
    meta.innerHTML = '<h3 class="cell__title"></h3><p class="cell__desc"></p>';
    meta.querySelector(".cell__title").textContent = item.title;
    meta.querySelector(".cell__desc").textContent = item.desc;

    cell.append(media, meta);

    const view = createBreathView(canvas, BREATH_RES);
    img.addEventListener("load", function () {
      if (img.naturalWidth) view.setImage(img);
    });
    img.src = item.src;
    cell._view = view;
    if (cellObserver) cellObserver.observe(cell);

    const open = function () { openLightbox(item); };
    cell.addEventListener("click", open);
    cell.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });

    item._el = cell;
    return cell;
  }

  /* ---------- 渲染 / 筛选 ---------- */
  function render() {
    grid.querySelectorAll(".cell").forEach(function (c) { if (cellObserver) cellObserver.unobserve(c); });
    grid.innerHTML = "";
    const visible = gallery.filter(function (it) {
      return activeFilter === "all" || it.cat === activeFilter;
    });
    visible.forEach(function (it) { grid.appendChild(buildCell(it)); });
    empty.hidden = visible.length !== 0;
  }

  function syncChips() {
    filters.querySelectorAll(".chip").forEach(function (c) {
      const on = c.dataset.filter === activeFilter;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  filters.addEventListener("click", function (e) {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    syncChips();
    render();
  });

  /* ---------- 灯箱 ---------- */
  const lb = document.getElementById("lightbox");
  const lbCanvas = document.getElementById("lbCanvas");
  const lbImg = document.getElementById("lbImg");
  const lbCaption = document.getElementById("lbCaption");
  let lbList = [];
  let lbIndex = 0;
  let lbView = null;
  function getLbView() { if (!lbView) lbView = createBreathView(lbCanvas, LB_BREATH_RES); return lbView; }

  function openLightbox(item) {
    lbList = gallery.filter(function (it) {
      return activeFilter === "all" || it.cat === activeFilter;
    });
    lbIndex = Math.max(0, lbList.indexOf(item));
    showLightbox();
    lb.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function showLightbox() {
    const item = lbList[lbIndex];
    if (!item) return;
    const tmp = new Image();
    tmp.crossOrigin = "anonymous";
    tmp.onload = function () {
      getLbView().setImage(tmp);
      lbImg.src = item.src;
      lbImg.alt = item.title;
    };
    tmp.src = item.src;
    lbCaption.textContent = item.title + "  ·  " + item.cat;
  }

  function step(d) {
    if (!lbList.length) return;
    lbIndex = (lbIndex + d + lbList.length) % lbList.length;
    showLightbox();
  }

  function closeLightbox() {
    lb.hidden = true;
    document.body.style.overflow = "";
  }

  document.getElementById("lbClose").addEventListener("click", closeLightbox);
  document.getElementById("lbPrev").addEventListener("click", function () { step(-1); });
  document.getElementById("lbNext").addEventListener("click", function () { step(1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) closeLightbox(); });
  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });

  /* ---------- 像素模式切换 ---------- */
  const toggle = document.getElementById("pixelToggle");
  toggle.addEventListener("click", function () {
    const on = document.body.classList.toggle("pixel-mode");
    toggle.setAttribute("aria-pressed", on ? "true" : "false");
    toggle.lastChild.textContent = on ? " 像素模式" : " 清晰模式";
    if (!lb.hidden) showLightbox();
    breathEnsureLoop(); // 切回像素模式时重新驱动呼吸动画
  });

  /* =========================================================
     随机呼吸闪烁的像素颗粒背景（无鼠标跟随）
     整屏固定网格 -> 每个像素块独立随机相位，慢呼吸 + 高频微闪
     低透明度铺底，营造「活的点阵」氛围，不干扰照片阅读
     ========================================================= */
  (function initGrainField() {
    const canvas = document.getElementById("grainField");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const GRID = 22;                                  // 每个像素块 = 22 CSS 像素
    const COLORS = [                                  // 有限发光色板（暗底上的点阵）
      [124, 92, 255],   // 紫
      [44, 232, 245],   // 青
      [255, 82, 119],   // 粉
      [43, 255, 136],   // 绿
      [249, 248, 113],  // 黄
    ];
    let W = 0, H = 0, bw = 0, bh = 0, dpr = 1;
    const cells = [];

    function build() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bw = Math.ceil(W / GRID); bh = Math.ceil(H / GRID);
      cells.length = 0;
      for (let i = 0; i < bw * bh; i++) {
        cells.push({
          c: COLORS[(Math.random() * COLORS.length) | 0],
          phase: Math.random() * Math.PI * 2,        // 固定随机相位 -> 各块不同步
          speed: 0.35 + Math.random() * 1.7,         // 呼吸快慢随机
          base: 0.05 + Math.random() * 0.11,         // 单体基础亮度（多数暗、偶发亮）
        });
      }
    }

    function draw(now) {
      const t = now * 0.001;
      ctx.clearRect(0, 0, W, H);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const cl = cells[y * bw + x];
          // 慢呼吸 sin + 高频微闪 -> 像随机明灭的 LED
          let v = 0.5 + 0.5 * Math.sin(t * cl.speed + cl.phase);
          v = v * 0.7 + 0.3 * Math.abs(Math.sin(t * cl.speed * 2.7 + cl.phase * 1.7));
          const a = cl.base * v;
          if (a < 0.012) continue;
          ctx.fillStyle = "rgba(" + cl.c[0] + "," + cl.c[1] + "," + cl.c[2] + "," + a.toFixed(3) + ")";
          ctx.fillRect(x * GRID, y * GRID, GRID, GRID);
        }
      }
    }

    let raf = null, last = 0;
    function loop(now) {
      if (now - last < 50) { raf = requestAnimationFrame(loop); return; }  // 约 20fps，省电
      last = now;
      draw(now);
      raf = requestAnimationFrame(loop);
    }
    function start() { if (raf == null && !reduce) raf = requestAnimationFrame(loop); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    window.addEventListener("resize", build);
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
    build();
    if (reduce) draw(0); else start();
  })();

  /* =========================================================
     真实后端：投稿持久化（Cloudflare KV，可切换群晖 NAS）
     ========================================================= */
  function setStatus(msg, isErr) {
    if (!statusEl) return;
    statusEl.hidden = !msg;
    statusEl.textContent = msg || "";
    statusEl.style.color = isErr ? "var(--pink)" : "var(--cyan)";
  }

  async function uploadFile(file, category) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category || "投稿");
    const r = await fetch(API + "/upload", { method: "POST", body: fd });
    if (!r.ok) {
      let m = "上传失败";
      try { const j = await r.json(); if (j && j.error) m = j.error; } catch (e) {}
      throw new Error(m);
    }
    return r.json();
  }

  async function loadRemoteImages() {
    try {
      const r = await fetch(API + "/images");
      if (!r.ok) return;
      const list = await r.json();
      if (!Array.isArray(list)) return;
      list.forEach(function (it) {
        gallery.unshift({
          src: it.url,
          cat: it.cat || "投稿",
          title: String(it.name || "投稿作品").replace(/\.[^.]+$/, "").slice(0, 18),
          desc: "用户投稿 · 已持久化",
          remote: true,
        });
      });
      render();
    } catch (e) { /* 后端尚未就绪时忽略，仅展示示例图 */ }
  }

  async function addFiles(files) {
    const arr = Array.prototype.slice.call(files);
    const catSel = document.getElementById("catSelect");
    const cat = catSel ? catSel.value : "投稿";
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      if (!file.type || !file.type.startsWith("image/")) continue;
      const title = (file.name || "投稿作品").replace(/\.[^.]+$/, "").slice(0, 18) || "投稿作品";
      setStatus("上传中：" + file.name + "（" + cat + "）…");
      try {
        const res = await uploadFile(file, cat);
        gallery.unshift({ src: res.url, cat: cat, title: title, desc: "用户投稿 · 已持久化", remote: true });
        setStatus("✓ 已持久化：" + file.name + "（" + cat + "）");
      } catch (err) {
        setStatus("后端不可用，已用本地预览：" + file.name, true);
        await new Promise(function (resolve) {
          const rd = new FileReader();
          rd.onload = function () {
            gallery.unshift({ src: rd.target.result, cat: cat, title: title, desc: "本地预览" });
            resolve();
          };
          rd.readAsDataURL(file);
        });
      }
      if (activeFilter !== "all" && activeFilter !== cat) { activeFilter = "all"; syncChips(); }
      render();
    }
  }

  /* ---------- 投稿 / 上传 ---------- */
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");

  dropzone.addEventListener("click", function () { fileInput.click(); });
  dropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", function () { addFiles(fileInput.files); fileInput.value = ""; });
  ["dragenter", "dragover"].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add("is-drag"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove("is-drag"); });
  });
  dropzone.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  /* ---------- 主视觉浮动像素块 ---------- */
  (function fillHero() {
    const box = document.getElementById("heroPixels");
    const colors = ["#ff5277", "#2ce8f5", "#f9f871", "#7c5cff", "#2bff88"];
    const count = Math.min(120, Math.ceil(window.innerWidth / 32) * Math.ceil(window.innerHeight / 32));
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const s = document.createElement("span");
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = (Math.random() * 6).toFixed(2) + "s";
      s.style.opacity = (0.15 + Math.random() * 0.5).toFixed(2);
      frag.appendChild(s);
    }
    box.appendChild(frag);
  })();

  /* ---------- 启动 ---------- */
  render();
  loadRemoteImages();
})();
