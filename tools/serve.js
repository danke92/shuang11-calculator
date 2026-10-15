/*
 * 极简静态服务器 —— 给「局域网访问」和「Cloudflare 临时隧道」共用。
 *
 * 用法：
 *   node tools/serve.js               # 监听 0.0.0.0:8111，根目录 dist/
 *   node tools/serve.js --port 9000   # 换端口
 *   node tools/serve.js --root .      # 换根目录（默认 dist）
 *
 * 只暴露静态资源，且限定在白名单扩展名内，
 * 防止隧道把 README / tools / design 源文件之类的东西一起发到公网。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const argv = process.argv.slice(2);
function argOf(name, fallback) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const ROOT = path.resolve(argOf('root', path.join(__dirname, '..', 'dist')));
const PORT = Number(argOf('port', '8111'));
const HOST = argOf('host', '0.0.0.0');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ 'Cache-Control': 'no-cache' }, headers || {}));
  res.end(body);
}

const server = http.createServer(function (req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  if (urlPath === '/') urlPath = '/index.html';

  // 规范化后必须仍在 ROOT 内（挡住 ../ 穿越）
  const target = path.resolve(ROOT, '.' + urlPath);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  const ext = path.extname(target).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TYPES, ext)) {
    return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  fs.readFile(target, function (err, buf) {
    if (err) {
      return send(res, 404, 'Not Found: ' + urlPath, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    send(res, 200, buf, { 'Content-Type': TYPES[ext], 'Content-Length': buf.length });
  });
});

server.listen(PORT, HOST, function () {
  const nets = os.networkInterfaces();
  const lan = [];
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (n) {
      if (n.family === 'IPv4' && !n.internal) lan.push(n.address + ' (' + name + ')');
    });
  });
  console.log('静态根目录 : ' + ROOT);
  console.log('本机访问   : http://127.0.0.1:' + PORT + '/');
  lan.forEach(function (a) { console.log('局域网访问 : http://' + a.split(' ')[0] + ':' + PORT + '/  ' + a); });
  console.log('按 Ctrl+C 停止。');
});
