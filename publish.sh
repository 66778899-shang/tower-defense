#!/usr/bin/env bash
# 把本仓库发布到 GitHub（公开仓库）
#
# 用法（二选一）：
#   GITHUB_TOKEN=ghp_xxxxxxxxxxxx ./publish.sh
#   ./publish.sh ghp_xxxxxxxxxxxx [仓库名]
#
# Token 在 https://github.com/settings/tokens 生成：
#   必须是 **classic token 且勾选 repo**。
#   fine-grained token 实测无法创建仓库（POST /user/repos 返回 403），别在这上面浪费时间。
#   如果 token 一个 scope 都没勾，建仓会返回误导性的 404 Not Found（不是 401/403），
#   脚本开头的权限预检会先看 X-OAuth-Scopes 响应头把它拦下来。
#
# 安全说明：token 只临时挂在 pushurl 上，push 完立刻恢复，不会留在 .git/config 里。
# 建议推送完成后去 https://github.com/settings/tokens 把这个 token 删掉。

set -euo pipefail

TOKEN="${1:-${GITHUB_TOKEN:-}}"
NAME="${2:-tower-defense}"

if [ -z "$TOKEN" ]; then
  echo "✗ 缺少 token。用法：GITHUB_TOKEN=ghp_xxx ./publish.sh"
  exit 1
fi

API="https://api.github.com"
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json")

TMP=".gh_tmp"

USER=$(curl -s "${AUTH[@]}" "$API/user" -o "$TMP" && grep -o '"login": *"[^"]*"' "$TMP" | head -1 | cut -d '"' -f4)
if [ -z "$USER" ]; then
  echo "✗ 无法用这个 token 获取用户信息（token 无效或权限不足）"
  exit 1
fi
echo "→ GitHub 用户：$USER"

# 权限预检：没有 repo 权限的话，建仓和推送都会在后面以含糊的 404 失败，先看清楚更省事
SCOPES=$(curl -sI "${AUTH[@]}" "$API/user" | grep -i '^x-oauth-scopes:' | cut -d ':' -f2- | tr -d '\r' | sed 's/^ *//')
echo "→ token 权限：${SCOPES:-（空）}"
if ! echo "$SCOPES" | grep -qw 'repo'; then
  echo "✗ 缺少 repo 权限。请重新生成 classic token 并勾选 repo（fine-grained token 默认没有建仓权限）。"
  rm -f "$TMP"
  exit 1
fi

# 已存在就跳过创建，避免报错中断
EXIST=$(curl -s -w "%{http_code}" "${AUTH[@]}" "$API/repos/$USER/$NAME" -o "$TMP")
if [ "$EXIST" = "200" ]; then
  echo "→ 仓库 $USER/$NAME 已存在，直接推送"
else
  echo "→ 创建公开仓库 $NAME"
  RESP=$(curl -s "${AUTH[@]}" -X POST "$API/user/repos" -o "$TMP" \
    -d "{\"name\":\"$NAME\",\"description\":\"零依赖单文件 HTML5 塔防游戏（Canvas + 原生 JS）\",\"private\":false,\"has_issues\":true,\"has_wiki\":false,\"auto_init\":false}" && cat "$TMP")
  if echo "$RESP" | grep -q '"message"'; then
    echo "✗ 创建仓库失败：$(echo "$RESP" | grep -o '"message": *"[^"]*"' | head -1 | cut -d '"' -f4)"
    echo "  通常是 token 权限不够（fine-grained token 常见）。两个办法："
    echo "  1) 改用 classic token，勾选 repo 权限；"
    echo "  2) 手动在 https://github.com/new 建好空仓库 $NAME，再重跑本脚本（脚本会自动检测已存在并直接推送）。"
    exit 1
  fi
  echo "$RESP" | grep -o '"full_name": *"[^"]*"' | head -1
fi

git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$USER/$NAME.git"

# token 只临时挂在 pushurl 上：
# 不能写成 `git push -u https://user:TOKEN@... main` —— 那样 git 会把整条带 token 的 URL
# 写进 [branch "main"] 的 remote 字段，等于把 token 明文留在 .git/config 里。
# 用完立刻恢复成干净的 URL。
git remote set-url --push origin "https://$USER:$TOKEN@github.com/$USER/$NAME.git"
git push -u origin main
git remote set-url --push origin "https://github.com/$USER/$NAME.git"
git config branch.main.remote origin
git config branch.main.merge refs/heads/main

rm -f "$TMP"
echo "✓ 已发布：https://github.com/$USER/$NAME"
