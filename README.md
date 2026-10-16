# 双11 减免计算器

> **在线地址（手机也能直接打开）：<https://danke92.github.io/shuang11-calculator/>**
> 源码仓库：<https://github.com/danke92/shuang11-calculator>

一个纯静态网页小工具：把「商品标价 + 各平台优惠玩法」按**真实叠加顺序**逐层算下来，给出预计到手价、折扣率和四平台比价。

打开方式：双击 `index.html`（不需要服务器、不需要联网、没有依赖）。

**想在其他设备上用**（手机 / 平板 / 别人的电脑）：见下方「[跨设备使用](#跨设备使用)」，有单文件离线版、局域网访问、临时公网链接、永久部署四条路。

---

## 它算什么

核心是「折上折」的顺序，顺序错了金额就错了。本工具按各平台 2026 双11 公示的规则顺序计算：

```
原价 / 大促报名价
  → 官方立减 / 官方直降（先降价）
  → 店铺券 / 店铺满减
  → 平台加补券 / 品类券
  → 会员专享（88VIP 消费券、PLUS 券、拼多多省钱月卡）
  → 88VIP 额外 95 折（部分品牌旗舰店）
  → 超级红包 / 淘金币 / 京豆等无门槛抵扣
  → 国家以旧换新补贴（按券后实付计算，按品类封顶）
  → 旧机折抵 / 以旧换新回收价
```

几个容易被漏掉的细节，工具里都做了处理：

- **门槛逐层判断**：每层券用的都是「上一层扣完之后」的剩余金额，所以满减可能出现「差一点没到门槛」的情况，明细里会写清楚。
- **多件商品**：官方立减、会员折扣按**单件价**计算再乘件数；满减券按**整单金额**判断门槛（与平台口径一致）。
- **国补基数**：国家以旧换新补贴是在券、红包、会员折扣之后，按实付金额再乘补贴比例并封顶。
- **旧机折抵**：算在国补之后，只减现金、不参与国补基数。
- **88VIP 消费券膨胀**：第一批 7 张 1555 元券包（10/13 起领、10/20 20:00 起用），有「满 480 减 60」和「满 1500 减 150」两档，券面可选。

---

## 功能

| 功能 | 说明 |
| --- | --- |
| 四个平台标签页 | 淘宝/天猫、京东、拼多多、抖音商城，每个平台的玩法、默认值、提示文案都不同 |
| 逐层明细 | 每层显示「扣了多少钱、怎么算的、还剩多少」，未生效的层也会标出来并说明原因 |
| 一键套用场景 | 「只算官方立减」「常见叠加（券+会员）」「极限叠加（含国补/以旧换新）」，会按平台自动关掉不适用的层 |
| 四平台比价 | 同一件商品同一批参数跑四个平台，按到手价升序排列，并标注最低价 |
| 规则设置抽屉 | 所有默认立减率、国补比例、券档位都能改，改动存在浏览器 localStorage，可一键「恢复官方默认」 |
| 响应式 | 窄屏单栏并自动把价格卡复制到输入区顶部，填一个参数就能看到到手价 |

---

## 各平台内置的关键数值

> 规则来源均为各平台 2026 双11 公开招商规则与官方活动说明（工具内「规则设置」抽屉里附了来源链接）。仅供参考，**实际以结算页为准**。

- **淘宝/天猫**：取消跨店满减，改为**单件立减**，官方立减 8.5 折起；品牌立减叠平台消费券后最低约 7.2 折；88VIP 消费券（满 480 减 60 / 满 1500 减 150）+ 部分品牌额外 95 折；红包/淘金币无门槛抵扣。
- **京东**：官方直降为主（无定金预售），10/12 20:00 现货开卖 → 11/13；10/31 20:00 开门红；PLUS 会员专属日 11/08；国补 + 以旧换新占比高。
- **拼多多**：百亿补贴直降为主，无复杂满减；省钱月卡券（平台侧）。
- **抖音商城**：官方立减 + 平台券 + 店铺券叠加，另有平台加补券。

---

## 目录结构

```
shuang11-calculator/
├─ index.html          页面骨架：顶部栏 / 平台标签 / 输入区 / 结果区 / 底部栏 / 规则抽屉
├─ styles.css          全部样式（含 940px、560px 两档响应式断点）
├─ js/
│  ├─ rules.js         规则数据层：四平台玩法、券档位、国补比例与封顶、活动时间线、省钱提示
│  ├─ engine.js        计算引擎：calculate() 逐层扣减、subsidyConfig()、compareAll() 比价、fmt()
│  └─ app.js           界面逻辑：标签切换、表单绑定、渲染明细/比价/规则摘要、预设场景、规则抽屉
├─ dist/               构建产物（node tools/build.js 生成，可直接部署或分发）
│  ├─ index.html、styles.css、js/    可直接托管的静态站点
│  └─ 双11减免计算器-单文件版.html     CSS/JS 全内联，双击即用
├─ design/             视觉设计交付物：规范文档、设计系统页、交付 hub 页
└─ tools/
   ├─ build.js         构建：产出 dist/ 站点 + 单文件离线版
   ├─ serve.js         极简静态服务器（局域网 / 隧道共用，带路径穿越与扩展名白名单防护）
   ├─ test-engine.js   引擎回归测试（node tools/test-engine.js）
   ├─ render.js        无头 Edge 渲染/截图/取值脚本（开发自用，可删）
   └─ bin/cloudflared.exe   临时公网隧道用的客户端（可选，可删）
```

---

## 跨设备使用

### 方式一：单文件离线版（最省事，无需网络）

```bash
node tools/build.js
```

产出 `dist/双11减免计算器-单文件版.html`（约 84 KB），CSS/JS 全部内联：

- 用微信 / 邮件 / U 盘发给任何人，对方**双击就能用**，断网也能用；
- 手机上用浏览器打开这个文件同样可用；
- 因为它是一个完整页面，也可以直接传到任意静态托管上。

### 方式二：局域网访问（同一 WiFi 下的手机 / 平板）

```bash
node tools/build.js          # 先构建 dist/
node tools/serve.js          # 默认监听 0.0.0.0:8111
```

启动后终端会打印可用地址，例如 `http://10.161.145.78:8111/`，同一 WiFi 下的设备直接访问即可。

> 注意：Windows 防火墙默认**拦截入站连接**，首次访问可能会失败。放行需要管理员权限：
> `New-NetFirewallRule -DisplayName "S11 Calculator" -Direction Inbound -Protocol TCP -LocalPort 8111 -Action Allow`
> （在管理员 PowerShell 里执行一次即可。）

### 方式三：临时公网链接（跨网络、无需登录、无需管理员）

```bash
node tools/serve.js                                    # 终端 A
tools\bin\cloudflared.exe tunnel --url http://127.0.0.1:8111   # 终端 B
```

cloudflared 会输出一个 `https://xxxx.trycloudflare.com` 形式的临时地址，**任何网络下的设备**都能打开（走 Cloudflare 边缘回源，出站连接，不受本机防火墙影响）。

限制：地址是随机的、不固定，关掉进程即失效，官方不保证可用性 —— 适合临时演示或发给别人试用，不适合长期对外。

### 方式四：永久部署（固定网址）

`dist/` 是纯静态站点，直接拖进去即可，不需要任何构建配置：

| 平台 | 操作 |
| --- | --- |
| Cloudflare Pages | 新建项目 → 上传 `dist/`（或连 Git 仓库，构建命令留空，输出目录 `dist`） |
| Netlify | Drag & drop `dist/` 到 Netlify Drop |
| Vercel | `vercel deploy dist --prod`，或把 `dist` 设为输出目录 |
| GitHub Pages | 用仓库内置脚本一键发布，见下方「发布到 GitHub Pages」 |
| 任意虚拟主机 / 对象存储 | 直接把 `dist/` 里的文件传上去 |

> 规则设置抽屉的改动存在各设备浏览器的 `localStorage` 里，**不会**在设备之间同步；换设备后是官方默认值。

---

## 发布到 GitHub Pages（固定网址）

**状态：已上线 ✅** —— <https://danke92.github.io/shuang11-calculator/>
（Pages 源 = 分支 `gh-pages` / 目录 `/ (root)`；本机访问 `github.com` 网页被网络层阻断，
所以首次建仓库、开 Pages 是在浏览器里手动完成的，之后的更新全部走脚本。）

仓库里已经准备好了两个脚本，只需授权一次。

### 一次性准备

```powershell
gh auth login          # 选 GitHub.com → SSH → 浏览器授权，令牌只存本机
```

SSH key 需已添加到 GitHub（本机 `~/.ssh/id_ed25519` 已配好，且 `~/.ssh/config` 里让
`github.com` 走 `ssh.github.com:443`，规避 22 端口不稳定）。

### 一键发布

```powershell
.\tools\deploy-github.ps1                     # 默认仓库名 shuang11-calculator
.\tools\deploy-github.ps1 -Repo my-site       # 换仓库名
```

脚本会依次：检查登录 → `node tools/build.js` 构建 → 校验 `gh-pages` 分支内容 →
用 `gh repo create` 建仓库（已存在则跳过）→ 配置 `origin` 为 SSH → 推送 `main` 与 `gh-pages`
→ 调 API 开启 Pages。完成后输出网址：

```
https://<你的用户名>.github.io/shuang11-calculator/
```

### 以后更新内容

```powershell
node tools/build.js          # 重建 dist/
.\tools\publish-pages.ps1    # 用最新 dist/ 刷新 gh-pages 并推送（内部也会自动构建）
```

`publish-pages.ps1` 用**临时索引**把 `dist/` 写成一次提交后再推送，
不会动你当前的工作区，也不会把 `dist/` 提交进 `main`。

### 仓库结构约定

| 分支 | 内容 | 用途 |
| --- | --- | --- |
| `main` | 源码（`index.html`、`styles.css`、`js/`、`design/`、`tools/`、README） | 开发与留档 |
| `gh-pages` | `dist/` 构建产物（`index.html` 在根目录） | GitHub Pages 直接发布 |

Pages 的发布源请设为 **分支 `gh-pages` / 目录 `/ (root)`**（脚本已尝试自动设置，
失败时到仓库 Settings → Pages 手动选一次即可）。

---

## 想改规则 / 换成明年的双11

只需要动 `js/rules.js`：

- 每个平台的 `official`（立减率/直降金额）、`voucher`（券档位）、`member`（会员折扣）、`subsidy`（国补比例与封顶）都是纯数据；
- `DEFAULTS` 放全局默认值；
- 页面顶部「规则版本」和「规则设置」抽屉会自动跟着数据走。

## 测试

```bash
node tools/test-engine.js     # 校验叠加顺序、门槛判断、国补封顶、比价排序
```

再加一条「真实浏览器里跑一遍」的验证（会用无头 Edge 打开页面并断言到手价、明细行数、
布局顺序、可见价格卡数量；`--js-file` 用于塞进长脚本）：

```bash
node tools/render.js https://danke92.github.io/shuang11-calculator/ --js-file tools/assert-pages.js --width 390
```

预期输出里应包含：`"afterFullPreset": "2,149.15"`、`"stepRows": 7`、`"visiblePriceCards": 1`。

---

## 免责说明

工具按各平台公开规则做**数学叠加**，不含「券是否真的领得到」「是否限品类/限地区」「付款时间是否在有效窗口内」等平台侧限制。最终到手价以结算页显示为准。
