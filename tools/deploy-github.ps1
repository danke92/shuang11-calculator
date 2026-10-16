# 一键把本项目发布到 GitHub Pages
# 用法（本机执行策略默认禁止跑 .ps1，所以用这行）：
#   powershell -ExecutionPolicy Bypass -File .\tools\deploy-github.ps1
#   powershell -ExecutionPolicy Bypass -File .\tools\deploy-github.ps1 -Repo my-name
#
# 前置条件（只需一次）：
#   1) gh auth login    —— 登录 GitHub（浏览器授权）
#   2) 已有 SSH key 并加到 GitHub
#
# ⚠ 本机实测：github.com 网页被网络层阻断（hosts 里那条 140.82.121.3 是不通的 IP），
#   `gh auth login` 的浏览器授权会卡在回调上取不到令牌。所以在这个环境里更适合：
#   - 在浏览器里手动建仓库、手动开 Pages（Settings → Pages → gh-pages / root）；
#   - 之后的日常更新只用 publish-pages.ps1（它只走 SSH 推送，不碰 github.com 网页）。

param(
  [string]$Repo = 'shuang11-calculator',
  [string]$Branch = 'gh-pages'
)

# 这里刻意用 Continue：git / gh 会把进度和警告写到 stderr，
# 在 Stop 模式下 PowerShell 5.1 会把它当成终止性错误，导致脚本中途炸掉。
$ErrorActionPreference = 'Continue'
$proj = Split-Path -Parent $PSScriptRoot
Set-Location $proj

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Die($msg)  { Write-Host "`n!! $msg" -ForegroundColor Red; exit 1 }

# 跑外部命令并把 stdout+stderr 合成字符串返回；不抛错，由调用方看 $script:LastCode
function Run([string[]]$CmdArgs) {
  $exe  = $CmdArgs[0]
  $rest = @($CmdArgs[1..($CmdArgs.Count - 1)])
  $out  = & $exe @rest 2>&1
  $script:LastCode = $LASTEXITCODE
  return (@($out | ForEach-Object { $_.ToString() }))
}

Step '0/6 检查 git 仓库'
if (-not (Test-Path '.git')) { Die '当前目录不是 git 仓库，先执行 git init -b main' }
$head = @(Run @('git', 'rev-parse', '--abbrev-ref', 'HEAD'))
Ok ("当前分支：" + $head[0])

Step '1/6 检查 gh 登录状态'
# 别用输出文字去猜：gh 未登录时把提示写到 stderr，文字也会随版本变。
# 直接看 `gh auth status` 的退出码 —— 0 = 已登录，非 0 = 未登录。
$auth = (@(Run @('gh', 'auth', 'status')) -join "`n")
if ($script:LastCode -ne 0) {
  Die @"
尚未登录 GitHub（gh auth status 退出码 $script:LastCode）。它的输出是：

$auth

请先运行：

    gh auth login

选择 GitHub.com -> SSH -> 用浏览器登录。登录完成后再运行本脚本。
（若浏览器授权一直失败，见本文件顶部说明：改用「手动建仓库 + publish-pages.ps1」）
"@
}
$user = ''
$lines = @(Run @('gh', 'api', 'user', '--jq', '.login'))
if ($script:LastCode -eq 0 -and $lines.Count -gt 0) { $user = ($lines[0]).Trim() }
if (-not $user) { $user = 'danke92' }
Ok "已登录：$user"

Step '2/6 构建部署内容'
node tools/build.js | ForEach-Object { Ok $_ }
if (-not (Test-Path 'dist/index.html')) { Die '构建失败：dist/index.html 不存在' }

Step '3/6 校验 gh-pages 分支内容'
$tracked = @(Run @('git', 'ls-tree', '-r', '--name-only', $Branch))
if ($tracked.Count -eq 0 -or -not $tracked[0]) { Die "分支 $Branch 不存在或为空" }
if ($tracked -notcontains 'index.html') { Die "分支 $Branch 缺少 index.html" }
Ok ("$Branch 含 " + ($tracked -join '、'))

Step '4/6 在 GitHub 上创建仓库（已存在则跳过）'
$exists = @(Run @('gh', 'repo', 'view', "$user/$Repo", '--json', 'name'))
if ($script:LastCode -eq 0) {
  Ok "仓库已存在：https://github.com/$user/$Repo"
} else {
  $null = Run @('gh', 'repo', 'create', $Repo, '--public', '--description', '双11 各平台减免政策叠加计算器：逐层算到手价并四平台比价')
  if ($script:LastCode -ne 0) { Die "创建仓库失败（gh 未登录或无权限）" }
  Ok "已创建：https://github.com/$user/$Repo"
}

Step '5/6 配置 remote 并推送'
$remotes = @(Run @('git', 'remote'))
if ($remotes -contains 'origin') { $null = Run @('git', 'remote', 'set-url', 'origin', "git@github.com:$user/$Repo.git") }
else                             { $null = Run @('git', 'remote', 'add', 'origin', "git@github.com:$user/$Repo.git") }
Ok ("origin -> " + (@(Run @('git', 'remote', 'get-url', 'origin'))[0]))

$null = Run @('git', 'push', '-u', 'origin', 'main')
if ($script:LastCode -ne 0) { Die '推送 main 失败（检查 SSH key 是否已加到 GitHub）' }
Ok 'main 已推送'

$null = Run @('git', 'push', '-u', 'origin', $Branch)
if ($script:LastCode -ne 0) { Die "推送 $Branch 失败" }
Ok "$Branch 已推送"

Step '6/6 开启 GitHub Pages'
$null = Run @('gh', 'api', '-X', 'POST', "repos/$user/$Repo/pages", '-f', "source[branch]=$Branch", '-f', 'source[path]=/')
if ($script:LastCode -eq 0) {
  Ok 'Pages 已开启'
} else {
  Ok 'Pages 未开通或已存在（409/404），可在下方链接手动确认一次'
}

$url = "https://$($user.ToLower()).github.io/$Repo/"
Write-Host "`n===============================================================" -ForegroundColor Yellow
Write-Host " 部署完成，网址（首次生效约需 1 分钟）：" -ForegroundColor Yellow
Write-Host " $url" -ForegroundColor White
Write-Host " 仓库：https://github.com/$user/$Repo" -ForegroundColor DarkGray
Write-Host " Pages 设置：https://github.com/$user/$Repo/settings/pages" -ForegroundColor DarkGray
Write-Host "===============================================================`n" -ForegroundColor Yellow
Write-Host "以后更新内容：改完源码后运行" -ForegroundColor Gray
Write-Host "    powershell -ExecutionPolicy Bypass -File .\tools\publish-pages.ps1" -ForegroundColor Gray
Write-Host "（它会自动重建 dist/、刷新 gh-pages 并推送，不会弄脏工作区）" -ForegroundColor Gray
