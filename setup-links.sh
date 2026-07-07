#!/bin/sh
# .claude/skills を .agents/skills（Skillの正本）への相対シンボリックリンクにする（macOS / Linux）。
# リポジトリルートから実行する。--check で検証のみ行う。
set -e

LINK=".claude/skills"
# リンク先は .claude/ 内から見た相対パス（.claude/skills -> ../.agents/skills）
REL_TARGET="../.agents/skills"

verify() {
  if [ ! -L "$LINK" ]; then
    echo "[NG] $LINK がシンボリックリンクではありません。"
    return 1
  fi
  if [ ! -f "$LINK/pm-review/SKILL.md" ]; then
    echo "[NG] 到達確認に失敗: $LINK/pm-review/SKILL.md が読めません。"
    return 1
  fi
  echo "[OK] 到達確認: $LINK/pm-review/SKILL.md を読めます。"
  return 0
}

if [ "$1" = "--check" ]; then
  verify
  exit $?
fi

if [ ! -d ".agents/skills" ]; then
  echo "[ERROR] 正本フォルダ .agents/skills がありません。リポジトリルートで実行してください。"
  exit 1
fi

if [ -e "$LINK" ] && [ ! -L "$LINK" ]; then
  echo "[WARN] $LINK が実フォルダとして存在します。自動削除はしません。中身を確認して手動で対応してください。"
  exit 1
fi

mkdir -p .claude
[ -L "$LINK" ] || ln -s "$REL_TARGET" "$LINK"
echo "[OK] $LINK -> $REL_TARGET のシンボリックリンクを用意しました。"
verify
