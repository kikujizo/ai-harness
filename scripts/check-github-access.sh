#!/bin/sh
# GitHub 読み書きの診断。リポジトリルートから実行する。
# 終了コード: 0=全項目OK, 1=一部NG
set -e

OK=0
NG=0

pass() {
  echo "[OK] $1"
  OK=$((OK + 1))
}

fail() {
  echo "[NG] $1"
  NG=$((NG + 1))
}

warn() {
  echo "[WARN] $1"
}

section() {
  echo ""
  echo "== $1 =="
}

section "git 操作"
if git fetch origin --dry-run 2>/dev/null; then
  pass "git fetch（読み取り）"
else
  fail "git fetch（読み取り）— Cursor GitHub App / remote 設定を確認"
fi

if git push --dry-run origin HEAD 2>/dev/null; then
  pass "git push dry-run（書き込み）"
else
  fail "git push dry-run（書き込み）— branch 保護または App 権限を確認"
fi

section "gh CLI（GitHub API）"
if ! command -v gh >/dev/null 2>&1; then
  warn "gh CLI が見つかりません。API 診断をスキップします。"
else
  REMOTE=$(git remote get-url origin 2>/dev/null || true)
  REPO=$(printf '%s' "$REMOTE" | sed -n 's#.*github\.com[:/]\([^/]*\/[^/.]*\).*#\1#p')
  if [ -z "$REPO" ]; then
    warn "origin から owner/repo を特定できませんでした。"
  else
    if gh api "repos/$REPO" --jq '.full_name' >/dev/null 2>&1; then
      pass "gh api repos/$REPO（リポジトリ参照）"
    else
      fail "gh api repos/$REPO — App または PAT 権限を確認"
    fi

    if gh issue list --repo "$REPO" --limit 1 >/dev/null 2>&1; then
      pass "gh issue list（Issue 読み取り）"
    else
      fail "gh issue list — Issues 権限または MCP + PAT を確認（403 integration なら §github-integration.md 参照）"
    fi

    if gh pr list --repo "$REPO" --limit 1 >/dev/null 2>&1; then
      pass "gh pr list（PR 読み取り）"
    else
      fail "gh pr list — Pull requests 権限を確認"
    fi
  fi
fi

section "環境変数（値は表示しない）"
for v in GITHUB_PERSONAL_ACCESS_TOKEN GITHUB_TOKEN GH_TOKEN; do
  if [ -n "$(eval "printf '%s' \"\${$v:-}\"")" ]; then
    pass "$v が設定されている"
  else
    warn "$v 未設定 — MCP 利用時は Cloud Secrets または shell env に設定"
  fi
done

section "MCP 設定ファイル"
if [ -f .cursor/mcp.json ]; then
  pass ".cursor/mcp.json が存在する"
elif [ -f .cursor/mcp.json.example ]; then
  warn ".cursor/mcp.json 未作成 — .cursor/mcp.json.example を参照"
else
  warn "MCP 設定テンプレートなし — Dashboard の MCP 設定を確認"
fi

section "サマリ"
echo "OK: $OK / NG: $NG"
if [ "$NG" -gt 0 ]; then
  echo "詳細: docs/harness/ops/github-integration.md"
  exit 1
fi
exit 0
