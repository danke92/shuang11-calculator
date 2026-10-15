/*
 * 构建脚本 —— 产出两个东西：
 *
 *   dist/            可直接部署的静态站点（Cloudflare Pages / Netlify / 任意静态托管）
 *   dist/双11减免计算器-单文件版.html
 *                    CSS/JS 全部内联，零依赖，发给别人双击就能用（完全离线）
 *
 * 用法：node tools/build.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SINGLE_NAME = '双11减免计算器-单文件版.html';
const ROOT_SINGLE_NAME = '双11减免计算器-单文件版.html';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

/* ---------- 1. dist/：普通静态站点 ---------- */

function buildSite() {
  const files = ['index.html', 'styles.css', 'js/rules.js', 'js/engine.js', 'js/app.js'];
  files.forEach(function (rel) {
    const target = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), target);
  });
  // 分发用的说明文件（放在 tools/assets/，不参与网页加载）
  const asset = path.join(__dirname, 'assets', '使用说明.txt');
  if (fs.existsSync(asset)) fs.copyFileSync(asset, path.join(DIST, '使用说明.txt'));
  return files;
}

/* ---------- 2. 单文件版：内联 CSS / JS ---------- */

function buildSingleFile() {
  let html = read('index.html');

  // 内联 CSS：按出现顺序替换所有 <link rel="stylesheet" href="...">
  html = html.replace(/[ \t]*<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>\s*/gi,
    function (whole, href) {
      const css = read(href.replace(/^\.\//, '').replace(/^\//, ''));
      return '<style>\n' + css.replace(/<\/style>/gi, '<\\/style>') + '\n</style>\n';
    });

  // 内联 JS：按出现顺序替换所有 <script src="..."></script>
  html = html.replace(/[ \t]*<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>\s*/gi,
    function (whole, src) {
      const js = read(src.replace(/^\.\//, '').replace(/^\//, ''));
      return '<script>\n' + js.replace(/<\/script>/gi, '<\\/script>') + '\n</script>\n';
    });

  if (/<link[^>]*stylesheet/i.test(html) || /<script[^>]*src=/i.test(html)) {
    throw new Error('内联没做干净：单文件里仍有外部引用');
  }

  const banner = '<!-- 双11 减免计算器 · 单文件离线版\n'
    + '     CSS/JS 已全部内联，无需网络、无需服务器，双击本文件即可使用。\n'
    + '     由 tools/build.js 生成于 ' + new Date().toISOString().slice(0, 10) + '，请勿直接编辑本文件。 -->\n';
  // 保留 DOCTYPE 在最前，banner 放在它之后
  html = html.replace(/^(<!DOCTYPE html>\s*)/i, '$1' + banner);

  const out = path.join(DIST, SINGLE_NAME);
  fs.writeFileSync(out, html, 'utf8');
  // 项目根目录也放一份，方便直接双击/直接发给别人
  fs.copyFileSync(out, path.join(ROOT, ROOT_SINGLE_NAME));
  return out;
}

/* ---------- 跑 ---------- */

resetDir(DIST);
const files = buildSite();
const single = buildSingleFile();

console.log('dist/ 站点：' + files.join('、'));
console.log('单文件版  ：' + path.relative(ROOT, single)
  + '（' + (fs.statSync(single).size / 1024).toFixed(1) + ' KB）');
