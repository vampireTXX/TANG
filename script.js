/* =========================================================
   PIXEL·DROP — 交互脚本
   职责：模块化画廊 · 像素化 · 分类筛选 · 灯箱 · 鼠标跟随像素粒子波动 · 真实后端投稿
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
    { src: SEED + "rooftop/800/800",   cat: "城市", title: "屋顶矩阵",   desc: "俯瞰城市的方格节奏" },
    { src: SEED + "profiley/800/800",  cat: "人物", title: "凝视",       desc: "高对比的黑白质感" },
    { src: SEED + "wavesoft/800/800",  cat: "抽象", title: "波纹",       desc: "流动的曲线噪声" },
    { src: SEED + "forestp/800/800",   cat: "风景", title: "针叶林",     desc: "密集垂直的线条" },
    { src: SEED + "gridcity/800/800",  cat: "城市", title: "立交枢纽",   desc: "交通线的交错网络" },
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
    // 跨域种子图不读取像素，仅绘制，无需 crossOrigin

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

    img.addEventListener("load", function () {
      if (img.naturalWidth) pixelateInto(canvas, img, PIXEL_RES);
    });
    img.src = item.src;

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
    tmp.crossOrigin = "anonymous"; // 同域后端图可直接，种子图仅绘制不读取
    tmp.onload = function () {
      pixelateInto(lbCanvas, tmp, LB_RES);
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
  });

  /* =========================================================
     鼠标跟随像素粒子波动（散发式）
     低分辨率离屏缓冲 -> 放大渲染，得到硬边像素块
     ========================================================= */
  (function initFX() {
    const canvas = document.getElementById("fxCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const PALETTE = ["#ff5277", "#2ce8f5", "#f9f871", "#7c5cff", "#2bff88"];
    const GRID = 5; // 每个粒子在缓冲里的 1 单位 = GRID 个 CSS 像素

    let W = 0, H = 0, bw = 0, bh = 0, buf = null, bctx = null, dpr = 1;
    let particles = [], raf = null, lastPos = null, lastPulse = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bw = Math.ceil(W / GRID); bh = Math.ceil(H / GRID);
      buf = document.createElement("canvas"); buf.width = bw; buf.height = bh;
      bctx = buf.getContext("2d");
    }

    function spawn(x, y, opt) {
      if (particles.length > 520) return;
      opt = opt || {};
      const ang = opt.angle != null ? opt.angle : Math.random() * Math.PI * 2;
      const sp = opt.speed != null ? opt.speed : (0.7 + Math.random() * 1.9);
      particles.push({
        x: x / GRID, y: y / GRID,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, decay: 0.010 + Math.random() * 0.018,
        size: Math.random() < 0.25 ? 2 : 1,
        color: PALETTE[(Math.random() * PALETTE.length) | 0],
        phase: Math.random() * 6.28,
        wave: 0.12 + Math.random() * 0.22,
        spin: Math.random() < 0.5 ? 1 : -1,
      });
    }

    // 鼠标移动：局部散射
    function burst(x, y) {
      if (reduce) return;
      for (let i = 0; i < 4; i++) spawn(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10);
    }
    // 周期性环向脉冲：散发式波动
    function ring(x, y) {
      if (reduce) return;
      const N = 26;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        spawn(x, y, { angle: a, speed: 1.3 + Math.random() * 1.3 });
      }
    }

    function kick() { if (raf == null) raf = requestAnimationFrame(loop); }

    function loop(t) {
      if (lastPos && !reduce && t - lastPulse > 820) { ring(lastPos.x, lastPos.y); lastPulse = t; }
      bctx.clearRect(0, 0, bw, bh);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.phase += 0.18;
        // 波动：给速度叠加垂直方向的扰动，让粒子呈曲线散发
        p.vx += Math.cos(p.phase) * 0.015 * p.spin;
        p.vy += Math.sin(p.phase) * 0.015 * p.spin;
        p.x += p.vx; p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0 || p.x < -2 || p.x > bw + 2 || p.y < -2 || p.y > bh + 2) {
          particles.splice(i, 1); continue;
        }
        bctx.globalAlpha = Math.max(0, p.life);
        bctx.fillStyle = p.color;
        bctx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
      }
      bctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buf, 0, 0, bw, bh, 0, 0, bw * GRID, bh * GRID);

      if (particles.length > 0 || (lastPos && !reduce)) raf = requestAnimationFrame(loop);
      else { raf = null; ctx.clearRect(0, 0, W, H); }
    }

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", function (e) {
      lastPos = { x: e.clientX, y: e.clientY };
      burst(e.clientX, e.clientY); kick();
    }, { passive: true });
    window.addEventListener("pointerdown", function (e) {
      lastPos = { x: e.clientX, y: e.clientY };
      ring(e.clientX, e.clientY); kick();
    }, { passive: true });
    document.addEventListener("mouseleave", function () { lastPos = null; });
    document.addEventListener("visibilitychange", function () { if (document.hidden) particles = []; });

    resize();
    if (!reduce) { ring(W / 2, H / 2); kick(); }
  })();

  /* =========================================================
     真实后端：投稿持久化（Cloudflare R2 via Pages Functions）
     ========================================================= */
  function setStatus(msg, isErr) {
    if (!statusEl) return;
    statusEl.hidden = !msg;
    statusEl.textContent = msg || "";
    statusEl.style.color = isErr ? "var(--pink)" : "var(--cyan)";
  }

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append("file", file);
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
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      if (!file.type || !file.type.startsWith("image/")) continue;
      const title = (file.name || "投稿作品").replace(/\.[^.]+$/, "").slice(0, 18) || "投稿作品";
      setStatus("上传中：" + file.name + " …");
      try {
        const res = await uploadFile(file);
        gallery.unshift({ src: res.url, cat: "投稿", title: title, desc: "用户投稿 · 已持久化", remote: true });
        setStatus("✓ 已持久化：" + file.name);
      } catch (err) {
        setStatus("后端不可用，已用本地预览：" + file.name, true);
        await new Promise(function (resolve) {
          const rd = new FileReader();
          rd.onload = function () {
            gallery.unshift({ src: rd.target.result, cat: "投稿", title: title, desc: "本地预览" });
            resolve();
          };
          rd.readAsDataURL(file);
        });
      }
      if (activeFilter !== "all" && activeFilter !== "投稿") { activeFilter = "all"; syncChips(); }
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
