# 把最新构建产物刷新到 gh-pages 分支并推送（源码改动后跑这个）
# 用法：powershell -ExecutionPolicy Bypass -File .\tools\publish-pages.ps1
#
# 说明：本机执行策略默认禁止运行 .ps1，所以推荐用上面那种带 -ExecutionPolicy Bypass 的写法，
#       或者先在当前窗口跑一次 Set-ExecutionPolicy -Scope Process Bypass。

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

# git 会把警告写到 stderr（例如 LF/CRLF 提示）。PowerShell 5.1 在
# $ErrorActionPreference='Stop' 下会把 stderr 当成终止性错误，所以这里统一包一层：
# 临时切成 Continue，只看退出码，并把输出按行返回。
#
# 注意 1：参数必须用「显式数组」传，写成 RunGit @('commit-tree', $tree, '-p', $base, '-m', $msg)。
# 早期版本写成 param([Parameter(ValueFromRemainingArguments=$true)]...)，那样调用
# `RunGit commit-tree $tree -p $base -m $msg` 时 PowerShell 会**静默吞掉 -p**，
# 建出一个没有父提交的孤儿提交，推送时报 non-fast-forward。
#
# 注意 2：函数名不能叫 Git —— PowerShell 命令名不区分大小写，`Git` 会盖住 `git.exe`，
# 函数内部再 `& git.exe ...` 就变成递归调用自己，报出「exit 」（退出码为空）这种怪错。
# 所以这里叫 RunGit，并且显式调用 git.exe。
function RunGit {
  param([string[]]$GitArgs)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out  = & git.exe @GitArgs 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
  $lines = @($out | ForEach-Object { $_.ToString() })
  if ($code -ne 0) {
    throw ("git " + ($GitArgs -join ' ') + " 失败（exit $code）：`n" + ($lines -join "`n"))
  }
  return $lines
}

# 取一个 ref 指向的 sha；不存在就返回空串（不抛错）
function Get-RefSha($ref) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $sha  = & git.exe rev-parse --verify --quiet $ref 2>$null
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
  if ($code -eq 0 -and $sha) { return ([string]($sha | Select-Object -First 1)).Trim() }
  return ''
}

if (-not (Test-Path '.git')) { Die '不在 git 仓库内' }

Step '1/4 重新构建 dist/'
if (-not $SkipBuild) { node tools/build.js | ForEach-Object { Ok $_ } }
if (-not (Test-Path 'dist/index.html')) { Die 'dist/index.html 不存在' }

Step '2/4 用 dist/ 生成新的 gh-pages 提交'
# 先把远端跟踪引用刷新，再拿它当父提交 —— 保证推上去一定是快进，不会 non-fast-forward
$prevEA = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& git.exe fetch --quiet origin $Branch 2>$null | Out-Null
$ErrorActionPreference = $prevEA
$base = Get-RefSha "refs/remotes/origin/$Branch"
if (-not $base) { $base = Get-RefSha "refs/heads/$Branch" }
if ($base) { Ok "父提交 $($base.Substring(0,7))" } else { Ok '首个提交（无父提交）' }

# 用临时索引，完全不碰当前工作区，避免误删源码
$tmpIndex = Join-Path $env:TEMP ("s11-pages-" + [guid]::NewGuid().ToString('N') + '.index')
$oldIndex = $env:GIT_INDEX_FILE
$env:GIT_INDEX_FILE = $tmpIndex
try {
  RunGit @('read-tree', '--empty') | Out-Null
  RunGit @('--work-tree=dist', 'add', '-A') | Out-Null
  $files = @(RunGit @('--work-tree=dist', 'ls-files'))
  if ($files.Count -eq 0) { Die 'dist/ 里没有文件' }
  Ok ("打包 " + ($files -join '、'))
  $tree = (@(RunGit @('write-tree'))[0]).Trim()
  $msg  = "刷新部署：" + (Get-Date -Format 'yyyy-MM-dd HH:mm')
  if ($base) {
    $commit = (@(RunGit @('commit-tree', $tree, '-p', $base, '-m', $msg))[0]).Trim()
  } else {
    $commit = (@(RunGit @('commit-tree', $tree, '-m', $msg))[0]).Trim()
  }
  # 自检：有父提交时，建出来的提交必须真的有 parent，否则宁可停下也不推垃圾
  if ($base -and -not (& git.exe cat-file -p $commit 2>$null | Select-String '^parent ')) {
    Die "自检失败：提交 $($commit.Substring(0,7)) 没有父提交，放弃推送"
  }
  RunGit @('update-ref', "refs/heads/$Branch", $commit) | Out-Null
  Ok "新提交 $($commit.Substring(0,7))"
} finally {
  Remove-Item $tmpIndex -Force -ErrorAction SilentlyContinue
  if ($oldIndex) { $env:GIT_INDEX_FILE = $oldIndex } else { Remove-Item Env:\GIT_INDEX_FILE -ErrorAction SilentlyContinue }
}

Step '3/4 推送 main 与 gh-pages'
RunGit @('push', 'origin', 'main')  | ForEach-Object { if ($_ -notmatch '^\s*$') { Ok $_ } }
RunGit @('push', 'origin', $Branch) | ForEach-Object { if ($_ -notmatch '^\s*$') { Ok $_ } }
Ok '推送完成'

Step '4/4 提示'
$url = @(RunGit @('remote', 'get-url', 'origin'))[0]
if ($url -match 'github\.com[:/](.+?)/(.+?)(\.git)?$') {
  Write-Host "`n 网址：https://$($matches[1].ToLower()).github.io/$($matches[2])/" -ForegroundColor Yellow
  Write-Host " 生效时间：通常 30-60 秒`n" -ForegroundColor DarkGray
}
