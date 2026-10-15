# 一键把本项目发布到 GitHub Pages
# 用法：在 PowerShell 里运行  .\tools\deploy-github.ps1  或指定仓库名 .\tools\deploy-github.ps1 -Repo my-name
#
# 前置条件（只需一次）：
#   1) gh auth login          —— 登录 GitHub 账号（浏览器授权，令牌只存在你本机）
#   2) 已有 SSH key 并加到 GitHub（本机 id_ed25519 已验证可用，走 443 端口）

param(
  [string]$Repo = 'shuang11-calculator',
  [string]$Branch = 'gh-pages'
)

$ErrorActionPreference = 'Stop'
$proj = Split-Path -Parent $PSScriptRoot
Set-Location $proj

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Die($msg)  { Write-Host "`n!! $msg" -ForegroundColor Red; exit 1 }

Step '0/6 检查 git 仓库'
if (-not (Test-Path '.git')) { Die '当前目录不是 git 仓库，先执行 git init -b main' }
Ok ("当前分支：" + (git rev-parse --abbrev-ref HEAD))

Step '1/6 检查 gh 登录状态'
$auth = (gh auth status 2>&1 | Out-String)
if ($auth -notmatch 'Logged in') {
  Die @"
尚未登录 GitHub。请先运行：

    gh auth login

选择 GitHub.com -> SSH -> 用浏览器登录。登录完成后再运行本脚本。
"@
}
$user = ((gh api user --jq .login) 2>$null).Trim()
if (-not $user) { $user = 'danke92' }
Ok "已登录：$user"

Step '2/6 构建部署内容'
node tools/build.js | ForEach-Object { Ok $_ }
if (-not (Test-Path 'dist/index.html')) { Die '构建失败：dist/index.html 不存在' }

Step '3/6 校验 gh-pages 分支内容'
$tracked = git ls-tree -r --name-only $Branch
if (-not $tracked) { Die "分支 $Branch 不存在或为空" }
if ($tracked -notcontains 'index.html') { Die "分支 $Branch 缺少 index.html" }
Ok ("$Branch 含 " + ($tracked -join '、'))

Step '4/6 在 GitHub 上创建仓库（已存在则跳过）'
$exists = (gh repo view "$user/$Repo" --json name 2>$null)
if ($exists) {
  Ok "仓库已存在：https://github.com/$user/$Repo"
} else {
  gh repo create $Repo --public --description "双11 各平台减免政策叠加计算器：逐层算到手价并四平台比价" | Out-Null
  Ok "已创建：https://github.com/$user/$Repo"
}

Step '5/6 配置 remote 并推送'
$have = (git remote) -contains 'origin'
if ($have) { git remote set-url origin "git@github.com:$user/$Repo.git" }
else       { git remote add origin "git@github.com:$user/$Repo.git" }
Ok ("origin -> " + (git remote get-url origin))

git push -u origin main
if ($LASTEXITCODE -ne 0) { Die '推送 main 失败（检查 SSH key 是否已加到 GitHub）' }
Ok 'main 已推送'

git push -u origin $Branch
if ($LASTEXITCODE -ne 0) { Die '推送 gh-pages 失败' }
Ok 'gh-pages 已推送'

Step '6/6 开启 GitHub Pages'
try {
  gh api -X POST "repos/$user/$Repo/pages" -f "source[branch]=$Branch" -f "source[path]=/" 2>$null | Out-Null
  Ok 'Pages 已开启'
} catch {
  Ok 'Pages 可能已开启或需手动确认（见下方链接）'
}

$url = "https://$($user.ToLower()).github.io/$Repo/"
Write-Host "`n===============================================================" -ForegroundColor Yellow
Write-Host " 部署完成，网址（首次生效约需 1 分钟）：" -ForegroundColor Yellow
Write-Host " $url" -ForegroundColor White
Write-Host " 仓库：https://github.com/$user/$Repo" -ForegroundColor DarkGray
Write-Host " Pages 设置：https://github.com/$user/$Repo/settings/pages" -ForegroundColor DarkGray
Write-Host "===============================================================`n" -ForegroundColor Yellow
Write-Host "以后更新内容：改完源码后运行" -ForegroundColor Gray
Write-Host "    node tools/build.js      # 重建 dist/" -ForegroundColor Gray
Write-Host "    git push                 # 推 main（源码）" -ForegroundColor Gray
Write-Host "    .\tools\publish-pages.ps1  # 用最新 dist/ 刷新 gh-pages 分支" -ForegroundColor Gray
