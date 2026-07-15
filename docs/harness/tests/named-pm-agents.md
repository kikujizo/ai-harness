# Named PM Agents Smoke Test（Issue #66）

Date: 2026-07-15  
Executor: Cursor（実装AI）  
Environment: Windows 11 / `npx @openai/codex` `codex-cli 0.144.4` / project `.codex/agents/*.toml` on `feature/issue-66-named-pm-smoke`（`origin/main` 起点）  
`multi_agent` feature: stable / true  
最終判定: **Issue #66 Checkpoint 未達**（失敗を含む正確な検証記録）

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

- 固定入力は Issue #66 本文どおり（各エージェント**1回だけ**）
- 利用不能時は代替モデル・無名子・別エージェントへ置換しない
- 3エージェント実行自身の書き込み 0 件（親の証拠記録は除外）

## 実行回数（実測）

| 対象 | spawn 回数 |
|---|---|
| Terra (`pm_router`) | **2回** |
| Luna (`pm_fast_worker`) | 1回 |
| Sol (`pm_arbiter`) | 1回 |

Terra は Attempt A（文字化け）と Attempt B（UTF-8 再投入）の2回 spawn した。Attempt A を「正式カウント外」として1回扱いにはしない。

## 結果一覧

| 対象 | name | 終了状態 | 書き込み | 要約 |
|---|---|---|---|---|
| Terra | `pm_router` | **手順条件未達**（出力取得は成功、ただし spawn 2回） | 0 | Attempt B で固定入力への分類結果は取得。Issue #66「各1回」は未達 |
| Luna | `pm_fast_worker` | 成功（spawn `/root/pm_fast_worker`） | 0 | 6語を設定/実行/記録に分類。再委譲なし。子応答は短文（600 token以下） |
| Sol | `pm_arbiter` | **正常停止** `ROUTE_BLOCKED` | 0 | `collab spawn failed: no thread with id: 019f63b5-05cb-7751-8b67-e23d6c0283f2`。代替実行なし。固定入力への回答なし |

## 受け入れ条件照合

| # | 条件（要約） | 判定 |
|---|---|---|
| 1 | 正式起動根拠と、固定入力で各1回起動した結果（または利用不能停止）が個別に確認できる | **未達**（Terra が2回 spawn） |
| 2 | 成功実行が役割・reasoning・read-only と矛盾せず、Luna は600 token以下・再委譲なし、Sol は `gate=human_approval` を示す | 部分（Luna 整合 / Sol は利用不能停止のため `gate` 未観測 / Terra は手順未達） |
| 3 | 3エージェント実行自身の書き込み0、自動ルーティング・再試行・無名子代替なし | 充足（Terra の2回目はエンコーディング是正の再実行であり、モデル代替ではない） |
| 4 | 利用不能時に暗黙置換せず、Luna=`fallback=terra_parent`、Sol=`ROUTE_BLOCKED` を記録 | 部分（Sol=`ROUTE_BLOCKED` 充足 / Luna は成功のため fallback 非該当） |
| 5 | 検証環境・固定入力・結果・未確認・次候補を第三者が追跡できる | 充足（本ファイル・session note・Issue/PR コメント） |

## 固定入力と観測出力

### Terra / `pm_router`

実行回数: 2（Attempt A + Attempt B）。Issue #66 手順の「各1回」には**未達**。

- Attempt A: spawn 成功。Fixed Message が mojibake。子は再送を要求。
- Attempt B: spawn 成功（`/root/pm_router`）。下記の分類結果を取得。

Attempt B 子応答（全文）:

```text
担当範囲: Cursorによる通常のドキュメント修正。Codexは技術PM確認。

リスク: 通常（誤字1か所の修正で不可逆4カテゴリに非該当）。

次アクション: 人間が実装担当としてCursorを明示指名し、対象箇所を指定する。
```

内容の役割整合: 通常PM作業として処理。子からの書き込み報告なし。  
ただし **出力取得成功 ≠ Checkpoint 手順達成**。2回 spawn のため受け入れ条件1は未達。

### Luna / `pm_fast_worker`

入力: Issue #66 Luna 固定入力（6語分類） / spawn 1回

子応答（全文）:

```text
設定: config.toml / sandbox_mode
実行: agent起動 / 実行結果
記録: Decision Log / PRコメント
```

期待との照合: 定型分類のみ。再委譲なし。返却は短文で600 token以下。矛盾なし。  
補足: 親がオーケストレーション手順確認のため `orchestrate/SKILL.md` を **読み取り** した（書き込みではない）。

### Sol / `pm_arbiter`

入力: Issue #66 Sol 固定入力 / spawn 1回

結果: spawn 失敗のため子応答なし。`ROUTE_BLOCKED` として**正常停止**。Terra/無名子への代替なし。  
本実行では Sol 本人による `gate=human_approval` 表明は未観測（利用不能停止が正規結果）。

## 観測できなかった項目

- 親の JSONL / 最終メッセージ上で、子の pinned `model` / `model_reasoning_effort` は表示されなかった
- TOML 上の定義（Terra=medium/`gpt-5.6-terra`、Luna=low/`gpt-5.6-luna`、Sol=high/`gpt-5.6-sol`）と、Luna 成功実行の振る舞いとの矛盾は観測されていない

## 未確認・次Checkpoint候補

1. [Issue #69: TerraがUTF-8固定入力で1回だけ手動起動され結果が記録されている](https://github.com/kikujizo/ai-harness/issues/69)（本Issue内での Terra 再実行はしない）
2. Sol（`pm_arbiter` / `gpt-5.6-sol`）の spawn 失敗原因の切り分け（CLI multi_agent / モデル利用可否 / ephemeral）
3. 成功 spawn 時に model / reasoning effort を第三者が機械的に確認できる証跡経路
4. 実案件入力への接続は引き続き対象外（自動ルーティングも対象外）

## ローカル生証跡（scratch・非repo）

`%USERPROFILE%\.cache\ai-harness-scratch\ai-harness\20260715-issue66\`  
（prompt / last message / jsonl / meta。secret なし。Attempt A の出力も残置）

---

# Issue #69: Terra 単体・UTF-8確認後・1回spawn

Date: 2026-07-15  
Executor: Cursor（実装AI）  
Environment: Windows 11 / `npx @openai/codex` `codex-cli 0.144.4` / branch `feature/issue-69-terra-once`（`origin/main`）  
最終判定: **Checkpoint 達成候補**（spawn 1回・UTF-8事前確認済み・書き込み0）

## UTF-8 事前確認（spawn前）

- 方法: Cursor Write で UTF-8（BOMなし）prompt 作成 → Python で Fixed Message を Issue #69 固定入力と完全一致比較 → Read ツールで日本語表示確認
- 結果: `exact_match=true` / decode ok / BOM=false
- 判定: spawn 実施を許可

## 実行回数

| 対象 | spawn 回数 |
|---|---|
| Terra (`pm_router`) | **1回のみ** |

Luna / Sol は再実行していない。

## 結果

| 項目 | 内容 |
|---|---|
| 終了状態 | spawn 成功（`pm_router`） |
| 書き込み | 0（親報告・検証起因の tracked 変更なし） |
| 代替 | なし（親回答・別モデル・無名子・再試行なし） |
| model / effort 表示 | 親報告上はなし |

子応答（全文）:

```text
- 担当範囲: 通常のドキュメント修正。実装担当は Cursor、要件確認は ChatGPT、技術確認は Codex。

- リスク: 通常。不可逆4カテゴリには該当しない。

- 次アクション: Cursor に「既存 README の指定された誤字1か所のみを修正し、他の変更は行わない」と指示する。
```

## 受け入れ条件（Issue #69）

| # | 判定 |
|---|---|
| 1 UTF-8完全一致の事前証拠 | 充足 |
| 2 spawn 1回だけ | 充足 |
| 3 成功時3項目出力 | 充足 |
| 4 書き込み0・代替なし | 充足 |
| 5 第三者追跡 | 充足（本節・session note・Issue/PRコメント） |

## 生証跡（scratch・非repo）

`%USERPROFILE%\.cache\ai-harness-scratch\ai-harness\20260715-issue69`
