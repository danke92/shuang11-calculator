# 把最新构建产物刷新到 gh-pages 分支并推送（源码改动后跑这个）
# 用法：.\tools\publish-pages.ps1

param(
  [string]$Branch = 'gh-pages',
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$proj = Split-Path -Parent $PSScriptRoot
Set-Location $proj

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "    $m" -ForegroundColor Green }
function Die($m)  { Write-Host "`n!! $m" -ForegroundColor Red; exit 1 }

if (-not (Test-Path '.git')) { Die '不在 git 仓库内' }

Step '1/4 重新构建 dist/'
if (-not $SkipBuild) { node tools/build.js | ForEach-Object { Ok $_ } }
if (-not (Test-Path 'dist/index.html')) { Die 'dist/index.html 不存在' }

Step '2/4 用 dist/ 生成新的 gh-pages 提交'
# 用临时索引，完全不碰当前工作区，避免误删源码
$tmpIndex = Join-Path $env:TEMP ("s11-pages-" + [guid]::NewGuid().ToString('N') + '.index')
$oldIndex = $env:GIT_INDEX_FILE
$env:GIT_INDEX_FILE = $tmpIndex
try {
  git read-tree --empty
  git --work-tree=dist add -A
  $files = git --work-tree=dist ls-files
  if (-not $files) { Die 'dist/ 里没有文件' }
  Ok ("打包 " + ($files -join '、'))
  $tree = (git write-tree).Trim()
  $parent = (git rev-parse --verify --quiet "refs/heads/$Branch") 2>$null
  $msg = "刷新部署：" + (Get-Date -Format 'yyyy-MM-dd HH:mm')
  if ($parent) { $commit = (git commit-tree $tree -p $parent -m $msg).Trim() }
  else         { $commit = (git commit-tree $tree -m $msg).Trim() }
  git update-ref "refs/heads/$Branch" $commit
  Ok "新提交 $($commit.Substring(0,7))"
} finally {
  Remove-Item $tmpIndex -Force -ErrorAction SilentlyContinue
  if ($oldIndex) { $env:GIT_INDEX_FILE = $oldIndex } else { Remove-Item Env:\GIT_INDEX_FILE -ErrorAction SilentlyContinue }
}

Step '3/4 推送 main 与 gh-pages'
git push origin main
git push origin $Branch
Ok '推送完成'

Step '4/4 提示'
$url = git remote get-url origin -ErrorAction SilentlyContinue
if ($url -match 'github\.com[:/](.+?)/(.+?)(\.git)?$') {
  Write-Host "`n 网址：https://$($matches[1].ToLower()).github.io/$($matches[2])/" -ForegroundColor Yellow
  Write-Host " 生效时间：通常 30-60 秒`n" -ForegroundColor DarkGray
}
