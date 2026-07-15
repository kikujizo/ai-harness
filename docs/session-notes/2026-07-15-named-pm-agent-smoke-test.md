# Session note: Named PM agent smoke test（Issue #66）

Date: 2026-07-15  
Recorder: Cursor（実装AI）  
最終判定: **Issue #66 Checkpoint 未達**

## 目的

Terra / Luna / Sol を固定入力で各1回手動起動し、正式起動方法・役割境界・利用不能時停止を再現可能に記録する。

## 環境

- OS: Windows 11
- CLI: `npx @openai/codex` → `codex-cli 0.144.4`
- Branch: `feature/issue-66-named-pm-smoke`（`origin/main`）
- Project agents: `.codex/agents/pm_{router,fast_worker,arbiter}.toml`
- Sandbox: parent `codex exec -s read-only --ephemeral --json`
- 設定変更: なし（`.codex/` / `~/.codex/` 未変更）

## 起動方法の確認手順

1. 公式ドキュメント https://developers.openai.com/codex/subagents を確認
2. `codex exec --help` で named agent 専用フラグが無いことを確認
3. `codex features list` で `multi_agent=stable true` を確認

## 実行タイムライン

| 順 | 対象 | 結果 |
|---|---|---|
| A | Terra（文字化け試行） | spawn 成功だが Fixed Message が mojibake。**削除せず記録に残す**（= Terra の1回目） |
| B | Terra | 出力取得成功。`/root/pm_router`（= Terra の2回目。各1回条件に対し違反） |
| C | Luna | 成功。`/root/pm_fast_worker`（1回） |
| D | Sol | spawn 失敗 → `ROUTE_BLOCKED` 正常停止（代替なし・1回） |

実行回数: **Terra 2回 / Luna 1回 / Sol 1回**

## 原因（Checkpoint 未達）

- 直接原因: Terra を Issue 手順の「各1回」を超えて2回 spawn した
- 根本原因: **spawn 前の入力エンコーディング確認不足**（PowerShell here-string で Fixed Message が mojibake し、是正のために Attempt B を実行した）
- 誤解釈の禁止: Attempt A を「正式カウント外」として1回扱いにしない

## 親プロンプト方針（共通）

- 指定名を exactly once spawn
- Fixed Message のみを渡す
- 利用不能時は置換禁止（Luna は `fallback=terra_parent` を記録するが本Checkpoint内では実行しない / Sol は `ROUTE_BLOCKED`）
- 親自身も Fixed Message に回答しない
- ファイル / git / GitHub 書き込み禁止

## 利用不能時の扱い（本実行）

- Terra: 出力取得はできたが手順未達（回数違反）。本Issue内での再実行はしない
- Luna: 成功（`fallback=terra_parent` は非該当）
- Sol: `ROUTE_BLOCKED`（stderr: `collab spawn failed: no thread with id: 019f63b5-05cb-7751-8b67-e23d6c0283f2`）

## 書き込み監査

- `git status` 上、検証実行による tracked ファイル変更なし
- 3エージェント実行自身の書き込み: 0
- Luna 親の read-only `Get-Content`（`.agents/skills/orchestrate/SKILL.md`）のみ観測

## 次アクション（本Issue外）

1. 本PRは「失敗を含む正確な検証記録」としてレビュー・merge 可
2. merge 後、Issue #66 は「Checkpoint 未達・後続 Issue へ継続」として終了
3. 後続 Issue: UTF-8 入力を spawn 前に検証したうえで Terra を1回だけ再検証

## 詳細正本

集約結果は `docs/harness/tests/named-pm-agents.md`。
