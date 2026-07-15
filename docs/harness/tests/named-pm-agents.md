# Named PM Agents Smoke Test（Issue #66）

Date: 2026-07-15  
Executor: Cursor（実装AI）  
Environment: Windows 11 / `npx @openai/codex` `codex-cli 0.144.4` / project `.codex/agents/*.toml` on `feature/issue-66-named-pm-smoke`（`origin/main` 起点）  
`multi_agent` feature: stable / true

## 正式な手動起動方法（根拠）

1. 公式: [Subagents](https://developers.openai.com/codex/subagents)
   - カスタムエージェントは `.codex/agents/*.toml`（project）または `~/.codex/agents/`（personal）
   - 識別子は TOML の `name`
   - 起動は親セッションへの直接指示（例: named agent を spawn / Have `<name>` …）
2. ローカル CLI: `codex exec --help`（0.144.4）
   - トップレベルで名前付きエージェントを指定する `--agent` / `--agent-type` は**無い**
   - したがって本Checkpointの正式操作は、`codex exec -s read-only` の親プロンプトで **指定名を1体だけ spawn** すること

疑似起動（`-m gpt-5.6-terra` 等で親が本人役を演じる、TOML を読まずに同モデルで答える）は正式結果として扱わない。

## 実行条件

- 固定入力は Issue #66 本文どおり（各エージェント1回）
- 利用不能時は代替モデル・無名子・別エージェントへ置換しない
- 3エージェント実行自身の書き込み 0 件（親の証拠記録は除外）

## 結果一覧

| 対象 | name | 終了状態 | 書き込み | 要約 |
|---|---|---|---|---|
| Terra | `pm_router` | 成功（spawn `/root/pm_router`） | 0 | README誤字1件を通常リスクのドキュメント修正として分類。担当=Cursor、次=人間の明示指名 |
| Luna | `pm_fast_worker` | 成功（spawn `/root/pm_fast_worker`） | 0 | 6語を設定/実行/記録に分類。再委譲なし。子応答は短文（600 token以下） |
| Sol | `pm_arbiter` | **利用不能停止** `ROUTE_BLOCKED` | 0 | `collab spawn failed: no thread with id: 019f63b5-05cb-7751-8b67-e23d6c0283f2`。代替実行なし。固定入力への回答なし |

## 固定入力と観測出力

### Terra / `pm_router`

入力: Issue #66 Terra 固定入力（README誤字1か所のPM分類）

子応答（全文）:

```text
担当範囲: Cursorによる通常のドキュメント修正。Codexは技術PM確認。

リスク: 通常（誤字1か所の修正で不可逆4カテゴリに非該当）。

次アクション: 人間が実装担当としてCursorを明示指名し、対象箇所を指定する。
```

期待との照合: 通常PM作業として処理。子起動・書き込みの報告なし。矛盾なし。

### Luna / `pm_fast_worker`

入力: Issue #66 Luna 固定入力（6語分類）

子応答（全文）:

```text
設定: config.toml / sandbox_mode
実行: agent起動 / 実行結果
記録: Decision Log / PRコメント
```

期待との照合: 定型分類のみ。再委譲なし。返却は短文で600 token以下。矛盾なし。  
補足: 親がオーケストレーション手順確認のため `orchestrate/SKILL.md` を **読み取り** した（書き込みではない）。

### Sol / `pm_arbiter`

入力: Issue #66 Sol 固定入力（sandbox_mode 変更のリスク分類）

結果: spawn 失敗のため子応答なし。`ROUTE_BLOCKED` として停止。Terra/無名子への代替なし。  
このため本実行では Sol 本人による `gate=human_approval` 表明は未観測（利用不能停止が正規結果）。

## 観測できなかった項目

- 親の JSONL / 最終メッセージ上で、子の pinned `model` / `model_reasoning_effort` は表示されなかった
- TOML 上の定義（Terra=medium/`gpt-5.6-terra`、Luna=low/`gpt-5.6-luna`、Sol=high/`gpt-5.6-sol`）と、成功実行の振る舞いとの矛盾は観測されていない

## 未確認・次Checkpoint候補

1. Sol（`pm_arbiter` / `gpt-5.6-sol`）の spawn 失敗原因の切り分け（CLI multi_agent / モデル利用可否 / ephemeral）
2. 成功 spawn 時に model / reasoning effort を第三者が機械的に確認できる証跡経路
3. 実案件入力への接続は引き続き対象外（自動ルーティングも対象外）

## ローカル生証跡（scratch・非repo）

`%USERPROFILE%\.cache\ai-harness-scratch\ai-harness\20260715-issue66\`  
（prompt / last message / jsonl / meta。secret なし）
