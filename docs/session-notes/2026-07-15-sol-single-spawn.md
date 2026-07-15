# Session Note: Sol single spawn（Issue #75）

Date: 2026-07-15  
Related Issue: #75  
Related PR: #78

## 目的

Issue #66で利用不能停止したSol（`pm_arbiter`）を、設定変更なし・固定入力・1回だけの条件で再検証し、成功または利用不能停止を再現可能に記録する。

## 実行前確認の具体値

```text
OS: Windows 11
branch: feature/issue-75-sol-once
base commit: aa33bd6
Codex CLI: codex-cli 0.144.4
multi_agent: stable / true
pm_arbiter.toml: CLEAN_MATCH（mainと一致）
fixed input: exact_match=true
BOM: false
spawn count before run: 0
```

上記を確認後にだけspawnした。確認不能または不一致ならspawnしない条件だった。

## 実施したこと

- `npx @openai/codex exec -s read-only --ephemeral --json`の親セッションから、Sol（`pm_arbiter`）を1回だけ明示spawnした。
- spawnは成功し、子識別子`/root/pm_arbiter`を確認した。
- 再試行、Terra・Luna・別モデル・無名子・親回答による代替を行わなかった。
- Sol実行自身の書き込みは0件だった。

## テスト結果

```text
command: npx @openai/codex exec -s read-only --ephemeral --json
result: exit 0
spawn_target: pm_arbiter
spawn_count: 1
child: /root/pm_arbiter
writes_by_child: 0
retry: none
fallback: none
```

## 観測できたSol出力

PowerShellの親中継表示には文字化けがあった。判読可能な原文・トークンだけを証拠として扱い、文字化け部分を推測で復元しない。

```text
カテゴリ③
gate=human_approval
risk=high
```

ローカル生キャプチャにはrevertへの言及を含む判読可能な文脈が残っているとのセカンドオピニオン報告がある。ただし、その生キャプチャ本文はこのPRへ未転記であり、GitHub上の第三者が現時点で直接検証できない。

「最悪の失敗」は、文字化けで読めないと断定するのではなく、要求された明示項目として存在したことを確認できていない。

## 成功時要求との対応

| 要求項目 | 確認できた証拠 | 判定 |
|---|---|---|
| カテゴリ③ | `カテゴリ③` | 充足 |
| 最悪の失敗 | 明示項目としての存在を確認できず | 未確認 |
| revert可能性 | ローカル生キャプチャでは言及文脈ありとの報告。ただし本文未転記 | GitHub上では確認不能 |
| 必要な停止条件 | `gate=human_approval` | 充足 |
| `gate=human_approval` | `gate=human_approval` | 充足 |

## 受け入れ条件との照合

| # | 判定 |
|---|---|
| 1 実行前確認の証拠 | 充足（具体値を本文へ記録） |
| 2 spawn 1回・代替なし | 充足 |
| 3 成功時5項目 | 部分充足（最悪の失敗は未確認、revert可能性は生キャプチャ未転記） |
| 4 利用不能時ROUTE_BLOCKED | 非該当（spawn成功） |
| 5 書き込み0・第三者追跡 | 部分充足（生キャプチャ転記後に完全追跡可能） |

## リスク（不可逆4カテゴリの該当有無）

なし。read-only検証と文書記録のみで、設定・権限・パイプライン・実データを変更していない。

## 未確認事項

- Sol子応答に「最悪の失敗」が明示されていたか。
- revertへの言及を含む生キャプチャ原文がPR本文へ未転記であり、第三者検証が未完了。
- model / reasoning effortを実行証跡から機械的に確認できる経路。

## 判断したこと

- spawn成功、カテゴリ③、`risk=high`、`gate=human_approval`は観測済みとして扱う。
- revert可能性と最悪の失敗を同じ理由で未確認とは扱わない。
- 判読不能部分を推測で補完しない。
- 本Checkpoint内で再spawnしない。
- ローカル生キャプチャの該当箇所をそのまま追記するまで、PR #78は修正中とする。

## 次にやること

- Cursorがローカル未commitの`docs/harness/tests/named-pm-agents.md`に残る生キャプチャ該当箇所を、本ファイルへ原文のまま転記する。
- ChatGPTが修正後の要件再レビューを行う。
- Codexが技術・実行証拠レビューを行う。
- 人間がmerge可否を判断する。

## 人間向け1行説明

Solは1回で正常起動し人間承認ゲートを示したが、revert文脈の生証拠転記と「最悪の失敗」の明示確認が残っている。