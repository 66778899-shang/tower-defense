#!/usr/bin/env bash
# 把本仓库发布到 GitHub（公开仓库）
#
# 用法（二选一）：
#   GITHUB_TOKEN=ghp_xxxxxxxxxxxx ./publish.sh
#   ./publish.sh ghp_xxxxxxxxxxxx [仓库名]
#
# Token 在 https://github.com/settings/tokens 生成：
#   classic token，勾选 repo（以及可选 workflow）；fine-grained 需要有 "Administration: read/write"
#   与 "Contents: read/write" 权限。
#
# 安全说明：token 只用于本次 push 的 URL，不会写进 .git/config。

set -euo pipefail

TOKEN="${1:-${GITHUB_TOKEN:-}}"
NAME="${2:-tower-defense}"

if [ -z "$TOKEN" ]; then
  echo "✗ 缺少 token。用法：GITHUB_TOKEN=ghp_xxx ./publish.sh"
  exit 1
fi

API="https://api.github.com"
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json")

USER=$(curl -s "${AUTH[@]}" "$API/user" | grep -o '"login": *"[^"]*"' | head -1 | cut -d '"' -f4)
if [ -z "$USER" ]; then
  echo "✗ 无法用这个 token 获取用户信息（token 无效或权限不足）"
  exit 1
fi
echo "→ GitHub 用户：$USER"

# 已存在就跳过创建，避免报错中断
EXIST=$(curl -s -o /dev/null -w "%{http_code}" "${AUTH[@]}" "$API/repos/$USER/$NAME")
if [ "$EXIST" = "200" ]; then
  echo "→ 仓库 $USER/$NAME 已存在，直接推送"
else
  echo "→ 创建公开仓库 $NAME"
  curl -s "${AUTH[@]}" -X POST "$API/user/repos" \
    -d "{\"name\":\"$NAME\",\"description\":\"零依赖单文件 HTML5 塔防游戏（Canvas + 原生 JS）\",\"private\":false,\"has_issues\":true,\"has_wiki\":false,\"auto_init\":false}" \
    | grep -o '"full_name": *"[^"]*"' | head -1
fi

git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$USER/$NAME.git"
git push -u "https://$USER:$TOKEN@github.com/$USER/$NAME.git" main

echo "✓ 已发布：https://github.com/$USER/$NAME"
