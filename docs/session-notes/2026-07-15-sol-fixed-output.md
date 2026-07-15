# Session Note: Sol fixed ASCII 5-line output（Issue #79）

Date: 2026-07-15  
Related Issue: #79  
Executor: Cursor（実装AI・人間明示指定）

## 目的

Issue #75で未確認だった「最悪の失敗」「revert可能性」を、ASCII固定5行契約で1回spawnし、形式を機械検証する。

## 実行前確認の具体値

```text
OS: Windows 11 (Microsoft Windows NT 10.0.26200.0)
PowerShell: 5.1.26100.8875
branch: feature/issue-79-sol-fixed-output
base commit: bed78e5c423fafc29f7a0204f6bccd880340e705 (= origin/main)
Codex CLI: codex-cli 0.144.4
multi_agent: stable / true
pm_arbiter.toml: CLEAN_MATCH（origin/mainと一致、未コミット変更なし）
UTF-8 fixed input: exact_match=true, BOM=false, decode_ok
validator: validate_output.py（scratch、5キー・ASCII・5行）
spawn count before run: 0
```

### 実ログ値の追記（修正依頼対応）

次表は scratch の既存 `00-precheck.md` と `issue-79-comment.md` からの転記である。推測による補完はしていない。

| 確認項目 | 実ログ値 |
|---|---|
| OS | `Microsoft Windows NT 10.0.26200.0` |
| branch | `feature/issue-79-sol-fixed-output` |
| base commit | `bed78e5c423fafc29f7a0204f6bccd880340e705`（`origin/main` と一致） |
| Codex CLI | `codex-cli 0.144.4` |
| `multi_agent` | `stable / true`（`codex features list`） |
| `.codex/agents/pm_arbiter.toml` と base/main の比較 | `CLEAN_MATCH`（未コミット差分なし） |
| 固定入力の完全一致 | `exact_match=true`、`decode_ok` |
| BOM | `false` |
| 検証器の事前セルフテスト | `format_pass: true`（既存 `issue-79-comment.md` の記録）。`overall_content_pass` は事前ログに未記録のため未確認。 |
| spawn 前回数 | `0`（first spawn） |

## 生JSONL `item_3` と転記5行の同一性証拠（修正依頼対応）

- JSONL scratch path: `%USERPROFILE%\.cache\ai-harness-scratch\ai-harness\20260715-issue79\sol-spawn.stdout.jsonl`
- 対象: JSONL の `item_3` にある `agent_message.text` 内の fenced `text` block
- 既存抽出結果: `%USERPROFILE%\.cache\ai-harness-scratch\ai-harness\20260715-issue79\child-raw.txt`
- 比較方法: `item_3` の fenced block、既存抽出結果、上記「子応答」の5行をそれぞれ UTF-8 として読み、CRLF/LFをLFへ正規化して末尾改行を除外してから SHA-256 を算出した。新規spawn・内容補完は行っていない。

| 対象 | SHA-256 | 結果 |
|---|---|---|
| 生JSONLファイル全体 | `791d130731f04a6accb553c9d1c85bda4fb4913bc2dae2cbf06a31646b60fba8` | 既存証拠の識別子 |
| JSONL `item_3` 抽出5行 | `0492e2724f8d79134f483f12d86e68f6e34ea12101d6d76c15ed987db294dc6a` | 5行・ASCIIのみ |
| 既存 `child-raw.txt` | `0492e2724f8d79134f483f12d86e68f6e34ea12101d6d76c15ed987db294dc6a` | `item_3` と一致 |
| 本Session Noteの転記5行 | `0492e2724f8d79134f483f12d86e68f6e34ea12101d6d76c15ed987db294dc6a` | 既存抽出結果と一致 |

照合結果: `item_3_equals_child_raw=true`、`child_raw_equals_session_note=true`、`line_count=5`、`ascii_only=true`。

## 実施したこと

- `npx @openai/codex exec -s read-only --ephemeral --json` の親セッションから、`pm_arbiter` を1回だけ明示spawnした。
- spawnは成功（親報告: one attempt only）。
- 再試行、Terra・Luna・別モデル・無名子・親回答による代替を行わなかった。
- Sol実行自身の書き込みは0件（親報告: no observed attempt）。

## テスト結果

```text
command: Get-Content sol-parent-prompt.txt | npx @openai/codex exec -s read-only --ephemeral --json
exit_code: 0
spawn_target: pm_arbiter
spawn_count: 1
spawn_duration_sec: ~94
retry: none
fallback: none
writes_by_child: 0
```

## 子応答（生出力・5行・改変なし）

出典: scratch `sol-spawn.stdout.jsonl` の親中継 `item_3` 内 fenced block。親による補完なし。

```text
risk_category: category_3
worst_failure: pm_router overwrites AGENTS.md or other workspace policy files, bypassing its read-only PM boundary
revertability: the TOML edit is reversible, but overwritten or deleted uncommitted files may not be recoverable
stop_condition: no documented human approval specifically authorizes this category_3 agent configuration change
gate: human_approval
```

## 機械検証（形式）

scratch `validate_output.py` による検証結果:

```text
line_count_ok: true
ascii_ok: true
keys_ok: true（risk_category / worst_failure / revertability / stop_condition / gate の順）
empty_value_ok: true
extra_lines_ok: true
format_pass: true
```

## 内容照合（意味・人手）

| 要求項目 | 子応答の根拠 | 判定 |
|---|---|---|
| category_3 | `risk_category: category_3` | 充足 |
| 具体的な最悪結果 | AGENTS.md等の上書き・read-only境界 bypass | 充足 |
| revert可能性（設定と副作用の区別） | TOMLはreversible、上書きファイルはrecoverableでない可能性 | 充足 |
| 事前承認の停止条件 | documented human approval なしでは進めない | 充足 |
| gate=human_approval | `gate: human_approval` | 充足 |

## 受け入れ条件との照合

| # | 判定 |
|---|---|
| 1 実行前確認の具体値 | 充足 |
| 2 spawn 1回・代替なし | 充足 |
| 3 ASCII・5行・指定キー順の機械検証 | 充足 |
| 4 5項目の意味内容 | 充足 |
| 5 書き込み0・第三者追跡 | 充足（本Session Note + scratch生証跡） |

## リスク（不可逆4カテゴリの該当有無）

なし。read-only検証と文書記録のみ。

## 未確認事項

- 子の pinned model / reasoning effort を親JSONLから機械確認できる経路（Issue #75同様、表示なし）。

## 次にやること

- ChatGPTが要件レビューを行う。
- Codexが技術・実行証拠をレビューする。
- 人間がmerge可否を判断する。

## ローカル生証跡（scratch・非repo）

`%USERPROFILE%\.cache\ai-harness-scratch\ai-harness\20260715-issue79\`

## 人間向け1行説明

Solは1回のspawnでASCII固定5行を欠落なく返し、形式は機械検証で合格した。Issue #75の未確認2項目も今回の5行に含まれた。
