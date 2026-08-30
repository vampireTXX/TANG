#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
nas_pull.py — 群晖 NAS 主动拉取脚本
====================================
从「像素投放站」的公开接口把新上传的图片，按分类拉取到本地共享文件夹：

    /shanchuan/<分类>/<文件名>

设计要点：
  - 只依赖 Python 标准库（urllib / json / os），DSM 装好 Python3 即可运行。
  - 出站访问 Cloudflare（China -> CF），不受 GFW 入站限制影响，稳定可用。
  - 已拉取的 id 记录在 <BASE_DIR>/.pulled_ids.txt，避免重复下载。
  - 两个可配置项可用环境变量覆盖（无需改脚本）：
        NAS_PULL_SITE  站点根地址，默认 https://shaunchuan.pages.dev
        NAS_PULL_BASE  本地共享文件夹根，默认 /volume1/shanchuan
  - 分类目录名取上传时选择的分类（风景/城市/人物/抽象/投稿），已做安全化处理。

运行方式（DSM 任务计划）：
  控制面板 -> 任务计划 -> 新增 -> 用户定义的脚本（root）
  计划：每 5 分钟；用户自定义脚本填：  python3 /volume1/shanchuan/nas_pull.py
  注意：先把本文件放到 /volume1/shanchuan/nas_pull.py（或改下面的默认路径）。
"""
import os
import sys
import json
import time
import urllib.request
import urllib.error

SITE = os.environ.get("NAS_PULL_SITE", "https://shaunchuan.pages.dev").rstrip("/")
BASE_DIR = os.environ.get("NAS_PULL_BASE", "/volume1/shanchuan")
STATE_FILE = os.path.join(BASE_DIR, ".pulled_ids.txt")
UA = "Mozilla/5.0 (SynologyNAS; nas_pull)"
TIMEOUT = 40

EXT_BY_CT = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
    "image/gif": ".gif", "image/avif": ".avif",
}


def safe(s, maxlen=80):
    """把任意分类名/文件名清洗为安全的单段名称。"""
    s = (s or "").strip()
    for ch in '/\\:*?"<>|\t\n\r\0':
        s = s.replace(ch, "_")
    s = s.strip(" ._")
    return s[:maxlen] or "untitled"


def load_state():
    if not os.path.exists(STATE_FILE):
        return set()
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        return set(line.strip() for line in f if line.strip())


def save_state(ids):
    os.makedirs(BASE_DIR, exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        for i in sorted(ids):
            f.write(i + "\n")


def http_get(url, binary=False):
    last = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                data = r.read()
                ctype = r.headers.get("Content-Type", "")
                return data, ctype
        except Exception as e:
            last = e
            time.sleep(1.5)
    raise last


def main():
    print("[nas_pull] %s  站点=%s  目标=%s" % (time.strftime("%Y-%m-%d %H:%M:%S"), SITE, BASE_DIR))
    try:
        raw, _ = http_get(SITE + "/api/images")
        items = json.loads(raw.decode("utf-8"))
    except Exception as e:
        print("[nas_pull] 拉取图片列表失败: %s" % e)
        return

    if not isinstance(items, list):
        print("[nas_pull] 列表格式异常")
        return

    pulled = load_state()
    new = [it for it in items if it.get("id") and it["id"] not in pulled]
    print("[nas_pull] 共 %d 张，待拉取 %d 张" % (len(items), len(new)))

    ok = 0
    for it in new:
        iid = it["id"]
        cat = safe(it.get("cat") or "投稿")
        name = safe(it.get("name") or iid)
        # 确保有扩展名
        if "." not in name:
            name += ".jpg"
        dest_dir = os.path.join(BASE_DIR, cat)
        os.makedirs(dest_dir, exist_ok=True)
        dest = os.path.join(dest_dir, name)
        if os.path.exists(dest):
            dest = os.path.join(dest_dir, "%s_%s" % (iid, name))
        try:
            data, ctype = http_get(SITE + it["url"])
            if not data:
                raise ValueError("空内容")
            # 若原文件名无扩展名，用 Content-Type 兜底修正
            if "." not in os.path.basename(dest):
                ext = EXT_BY_CT.get(ctype.split(";")[0].strip(), ".bin")
                dest += ext
            with open(dest, "wb") as f:
                f.write(data)
            pulled.add(iid)
            ok += 1
            print("[nas_pull] ✓ %s/%s  (%d 字节)" % (cat, os.path.basename(dest), len(data)))
        except Exception as e:
            print("[nas_pull] ✗ %s 失败: %s" % (iid, e))

    save_state(pulled)
    print("[nas_pull] 本次新增 %d 张，累计已拉取 %d 张" % (ok, len(pulled)))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("[nas_pull] 异常: %s" % e)
        sys.exit(1)
