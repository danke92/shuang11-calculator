/**
 * 轻量 CDP 驱动：用 Edge 无头模式加载页面，执行一段 JS，并可选整页截图。
 *
 *   node tools/render.js <页面URL> [--js "表达式"] [--shot 输出.png] [--width 1400]
 *
 * 仅依赖 Node 内置的 WebSocket / fetch，不装任何第三方包。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
];

function parseArgs(argv) {
  const out = { url: argv[0], js: null, shot: null, width: 1400, wait: 600 };
  for (let i = 1; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--js') out.js = v;
    else if (k === '--shot') out.shot = v;
    else if (k === '--width') out.width = parseInt(v, 10);
    else if (k === '--wait') out.wait = parseInt(v, 10);
  }
  return out;
}

function findBrowser() {
  for (const p of EDGE_CANDIDATES) if (p && fs.existsSync(p)) return p;
  throw new Error('没有找到 Edge / Chrome');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) { /* 浏览器还没起来 */ }
    await sleep(250);
  }
  throw new Error('等待调试端口超时：' + url);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error('用法：node tools/render.js <url> [--js "..."] [--shot out.png] [--width 1400]');
    process.exit(2);
  }
  const browser = findBrowser();
  const port = 9333 + Math.floor(Math.random() * 200);
  const profile = path.join(os.tmpdir(), 'cdp-profile-' + Date.now());

  const child = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--window-size=' + args.width + ',1000',
    'about:blank',
  ], { stdio: 'ignore', detached: false });

  let exitCode = 0;
  try {
    await fetchJson(`http://127.0.0.1:${port}/json/version`);
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    let page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('没有可用的 page target');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let seq = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    const send = (method, params) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: args.width, height: 1000, deviceScaleFactor: 1, mobile: false,
    });

    const loaded = new Promise((res) => {
      const prev = ws.onmessage;
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.method === 'Page.loadEventFired') res();
        prev(ev);
      };
    });
    await send('Page.navigate', { url: args.url });
    await Promise.race([loaded, sleep(8000)]);
    await sleep(args.wait); // 等 JS 初始化与动画稳定

    if (args.js) {
      const r = await send('Runtime.evaluate', {
        expression: args.js, returnByValue: true, awaitPromise: true,
      });
      console.log(JSON.stringify(r.result ? r.result.value : null, null, 2));
    }

    if (args.shot) {
      const metrics = await send('Page.getLayoutMetrics');
      const h = Math.ceil(metrics.cssContentSize.height);
      await send('Emulation.setDeviceMetricsOverride', {
        width: args.width, height: Math.min(h, 8000), deviceScaleFactor: 1, mobile: false,
      });
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(args.shot, Buffer.from(shot.data, 'base64'));
      console.log('已截图：' + args.shot + '（' + args.width + '×' + Math.min(h, 8000) + '）');
    }

    ws.close();
  } catch (err) {
    exitCode = 1;
    console.error('渲染失败：' + err.message);
  } finally {
    try { child.kill(); } catch (e) { /* ignore */ }
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  process.exit(exitCode);
}

main();
