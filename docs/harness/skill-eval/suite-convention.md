# Skill 評価スイート規約

## 目的

lab Skill（現時点では `route-pm-model` パイロット）の**判断品質を最小回帰**する。
本スイートは全 Skill 展開や CI 組み込みを目的とせず、case/oracle 分離・counted run 記録・構造検証の最小実装を提供する。

## ディレクトリと役割

| パス | 役割 | 読者 |
|---|---|---|
| `docs/harness/skill-eval/cases/` | solver 向け入力のみ（状況・依頼文脈） | Skill 適用者（solver） |
| `docs/harness/skill-eval/oracles/` | 期待判定・pass/fail 基準 | 評価者のみ |
| `docs/harness/skill-eval/records/` | counted run の実績記録 | 評価者・レビュア |
| `scripts/Test-SkillEvalSuite.ps1` | 構造・整合の機械検証 | 実装者・レビュア |

## 分離規則

1. **case は oracle を参照・引用しない。** case には期待答え・route 候補・停止判定を書かない。
2. oracle は対応 case と**同じベース名**（例: `route-pm-model-pilot`）とする。
3. record は case に対する counted run を記録する。評価時に oracle と照合する。
4. solver は case のみを入力として Skill 手順を適用する。oracle は solve 完了後の照合まで開かない（`oracle_undisclosed_before_solve=true` を記録する）。

## counted run の必須記録項目

各 run に次を必須とする。

| 項目 | 説明 |
|---|---|
| `run_id` | 実行識別子（同一 record 内で重複禁止） |
| `input_sha256` | case ファイル内容の SHA-256（小文字 hex 64 桁） |
| `model` | solver に使ったモデル名 |
| `workspace` | 実行ワークスペース識別子（同一 record 内で重複禁止） |
| `fresh_context` | `true` / `false` — 新規コンテキストで solve したか |
| `oracle_undisclosed_before_solve` | `true` / `false` — solve 前に oracle を開いていないか |
| solver 出力要約 | route 判定結果など Skill 実績形式の要約 |
| 評価結果 | `pass` / `fail` と短い根拠（oracle 照合） |

同一 case に対する複数 counted run では、**`input_sha256` は同一**（case ファイルが変わらない限り）。

## 外部由来の概念 vs ai-harness 固有実装

### 外部由来（概念のみ）

- **case / oracle 分離**: solver 入力と評価基準を分け、事前答え合わせを防ぐ
- **counted run**: 同一入力に対する反復実行と記録
- **入力ダイジェスト**（`input_sha256`）: case 内容の固定化と記録間の一致検証
- **fresh context**: 各 run が独立コンテキストであることの宣言
- **oracle 事前非開示**（`oracle_undisclosed_before_solve`）: solve 前に期待値を見ない運用

### ai-harness 固有

- 上記パス配置（`docs/harness/skill-eval/` 以下）
- Windows PowerShell 5.1 構造 validator（`scripts/Test-SkillEvalSuite.ps1`）
- `route-pm-model` パイロット case / oracle / record
- 必須記録項目のフィールド名と markdown 記録フォーマット
- `AGENTS.md` lab 共通規則・`route-pm-model` SKILL 手順との整合

## スコープ外

- bash 版 validator
- CI 組み込み
- 全 lab / core Skill への展開
- 外部リポジトリの case / oracle / Skill 本文のコピー
