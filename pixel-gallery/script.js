/* =========================================================
   PIXEL·DROP — 交互脚本
   职责：渲染模块化画廊、像素化绘制、分类筛选、灯箱、投稿上传
   ========================================================= */
(function () {
  "use strict";

  const PIXEL_RES = 48;   // 网格单元像素分辨率（越小颗粒越粗）
  const LB_RES = 88;      // 灯箱像素分辨率

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

    const tag = document.createElement("span");
    tag.className = "cell__tag";
    tag.textContent = item.cat;

    media.append(canvas, img, tag);

    const meta = document.createElement("div");
    meta.className = "cell__meta";
    meta.innerHTML =
      '<h3 class="cell__title"></h3><p class="cell__desc"></p>';
    meta.querySelector(".cell__title").textContent = item.title;
    meta.querySelector(".cell__desc").textContent = item.desc;

    cell.append(media, meta);

    // 加载原图，绘制像素画布
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

  filters.addEventListener("click", function (e) {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    filters.querySelectorAll(".chip").forEach(function (c) {
      const on = c === btn;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-selected", on ? "true" : "false");
    });
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

  /* ---------- 投稿 / 上传（本地预览，不持久化） ---------- */
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");

  function addFiles(files) {
    Array.prototype.forEach.call(files, function (file) {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        gallery.unshift({
          src: ev.target.result,
          cat: "投稿",
          title: file.name.replace(/\.[^.]+$/, "").slice(0, 18) || "投稿作品",
          desc: "用户投稿 · 本地预览",
        });
        if (activeFilter !== "all" && activeFilter !== "投稿") {
          activeFilter = "all";
          filters.querySelectorAll(".chip").forEach(function (c) {
            const on = c.dataset.filter === "all";
            c.classList.toggle("is-active", on);
            c.setAttribute("aria-selected", on ? "true" : "false");
          });
        }
        render();
      };
      reader.readAsDataURL(file);
    });
  }

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
})();
