# AI協働ハーネス v3.1（テンプレートリポジトリ版）

> このリポジトリ（`kikujizo/ai-harness`）が本ハーネスの正本。ローカル・Vault内のコピーは作業用であり、矛盾時はこのリポジトリが勝つ。
> （SSOT原則）

4AI協働体制（ChatGPT=仕様化 / Codex=技術PM / Cursor=実装 / Claude Code=レビュー・技術スーパーバイザ）を、
どのGitHubリポジトリにも置ける形にした汎用ルール＋Skill集。
**リポジトリの形＝導入後の形**（テンプレートリポジトリ）。配布物と実運用の二重構造は持たない。

## 30秒ガイド

- **導入する** → [docs/harness/setup.md](docs/harness/setup.md)（Use this template →`setup-links`→貼付2件で導入）
- **ルールの正本** → [AGENTS.md](AGENTS.md)（役割分担・リスク分類・出力契約はここが唯一の正本）
- **AI別の設定** → [docs/harness/roles/](docs/harness/roles/)（chatgpt / codex / claude-code / cursor）
- **ループを作る・直す** → [docs/harness/loops/principles.md](docs/harness/loops/principles.md)＋[.agents/skills/loop-design/](.agents/skills/loop-design/SKILL.md)
- **知見をルールに育てる** → [docs/harness/knowledge/reflux.md](docs/harness/knowledge/reflux.md)＋[.agents/skills/knowledge-reflux/](.agents/skills/knowledge-reflux/SKILL.md)

## 導入

### For Humans

1. GitHubの **Use this template** で自分のリポジトリを作る（またはclone/丸コピー）
2. リポジトリルートで `setup-links.bat`（Windows）/ `sh setup-links.sh`（macOS/Linux）を実行
   → `.agents/skills` への `.claude/skills` ジャンクション（リンク）が張られる
3. 貼付2件（ツール制約による手動同期）:
   [docs/harness/roles/chatgpt.md](docs/harness/roles/chatgpt.md) → ChatGPTの Project instructions、
   [docs/harness/roles/codex.md](docs/harness/roles/codex.md) → Codexのカスタム指示
4. [docs/risk-dial.md](docs/risk-dial.md) の記入欄を埋める

詳細手順・導入後チェックは [docs/harness/setup.md](docs/harness/setup.md)。

### For LLM Agents

このリポジトリをClaude Code等のエージェントに開かせ、[docs/harness/setup.md](docs/harness/setup.md) を読ませて
セットアップ（リンク生成・チェック）を実行させる。貼付2件（ChatGPT / Codex）はリポジトリ外ツールへの
手動同期のため人間が行う。

## 構成マップ

隠しフォルダ（`.`始まり）も含めて、すべて導入後の実配置そのもの。

| 場所 | 役割 |
|---|---|
| `AGENTS.md`・`CLAUDE.md` | 全AI共通の正本 / Claude Code実効ルール（ルート直下の実効ファイル） |
| `.claude/settings.json` | Claude Codeの権限（読み取り許可・破壊/秘匿deny）の実JSON |
| `.cursor/rules/ai-workflow.mdc` | Cursorの実効ルール（`alwaysApply`） |
| `.agents/skills/*/SKILL.md` | **Skillの正本（SSOT）**。本数は固定しない。実在は `.agents/skills/*/SKILL.md` で確認。Codexは直接読む。Claude Codeは `setup-links` のリンク経由 |
| `.claude/skills` | `setup-links` が張るジャンクション（macOS/Linuxはシンボリックリンク。`.gitignore` 済み・コミットしない） |
| `setup-links.bat`・`setup-links.sh` | リンク生成・検証（`--check`） |
| `docs/templates.md`・`docs/criteria/`・`docs/risk-dial.md`・`docs/loop-ledger.md` | **運用正本**（導入先で記入して育てる） |
| `docs/harness/` | 静的リファレンス（setup / roles解説 / loops / knowledge / ops） |

## 設計原則（このハーネス自体が従うルール）

1. **正本1箇所**: 同じ定義を複数ファイルに書かない。他ファイルは正本への参照で扱う。実効ファイルが正本、`docs/harness/roles/` は解説
2. **経緯レス正本**: 旧版・移行済み・制作経緯を正本に置かない。経緯は Decision Log が担う（[docs/harness/knowledge/ssot.md](docs/harness/knowledge/ssot.md)）
3. **役割と自動化の分離**: 役割分担（4AI）と自動化の有無（対話 / CI/CD）は独立した軸。
   本ハーネスは対話運用がベースで、CI/CD自動レーンは「承認の第2の源泉（状態機械）」として追加できる
4. **実績ベースの昇格**: ルール・基準・ループの自律度は、実績（参照回数・×検出・完走実績）でのみ昇格し、インシデントで即降格する

## Skillティア・責務境界・発動優先順位

Skill本数は固定しない。**実在Skill**は `.agents/skills/*/SKILL.md` を正とする。
以下の表は人間向け索引であり、**導入予定Skillは未導入**である（ディレクトリが存在しない）。
lab 規則の規範的正本は [AGENTS.md](AGENTS.md)「Skills」節。

### 現存Skill（`.agents/skills/` に実在）

| Skill（ディレクトリ名） | ティア | 主責務 | 発動 |
|---|---|---|---|
| `design-check` | core | 実装前の設計チェック（5行） | description トリガー |
| `handoff-report` | core | セッション引き継ぎ資料 | description トリガー |
| `knowledge-reflux` | core | 知見の正本還流 | description トリガー |
| `loop-design` | core | 品質ループ設計 | description トリガー |
| `pm-review` | core | Issue/依頼のPM評価・ルーティング | description トリガー |
| `recursive-review` | core | 基準照合レビュー | description トリガー |
| `recursive-writing` | core | 基準照合執筆 | description トリガー |

### 導入予定・候補Skill（未導入。Issue 完了後に `.agents/skills/` へ追加）

| Skill（ディレクトリ名） | 状態 | ティア（予定） | 主責務 | 発動（予定） | 導入Issue |
|---|---|---|---|---|---|
| `reframe-question` | 未導入 | core候補 | 依頼の問いの再定義 | PR #20 merge 後に判断 | #36 |
| `orchestrate` | 未導入 | core候補 | 指揮・下位モデル委譲 | 同上 | #36 |
| `assessment-first` | 未導入 | core候補 | 指摘への実行前評価報告 | 同上 | #36 |
| `lateral-sweep` | 未導入 | core候補 | 失敗クラス横断走査 | 同上 | #36 |
| `mino-socratic-requirements` | 未導入 | lab | 要求定義（ソクラテス問答） | **明示指定時のみ** | #37 |
| `mino-context-discovery` | 未導入 | lab | 境界・言語ゲーム発見 | **明示指定時のみ** | #37 |
| `mino-event-storming` | 未導入 | lab | イベントストーミング | **明示指定時のみ** | #37 |
| `mino-model-deepening` | 未導入 | lab | モデル深化 | **明示指定時のみ** | #38 |
| `mino-contract-driven-coding` | 未導入 | lab | 契約駆動実装 | **明示指定時のみ** | #38 |
| `mino-changeability-review` | 未導入 | lab | 変更容易性レビュー | **明示指定時のみ** | #38 |
| ChatGPTアダプタ6本 | 未導入 | 常設移送外 | ChatGPT Projects 向け写し | 手動貼付のみ | 常設移送対象外 |

**発動優先順位**（重複・曖昧時）:

1. 人間またはIssueの明示指定（Skill名・工程名）
2. core Skill の description 一致
3. lab Skill は 1 がない限り発動しない
4. 複数 core が候補のときは [AGENTS.md](AGENTS.md) の標準フロー（仕様化→PM→実装→レビュー）に沿い、最上流の工程Skillを優先する

**責務境界（重複時の原則）**:

- 仕様化・Issue起票: ChatGPT（ロール）＋ `pm-review`（Skill）。`mino-socratic-requirements` は lab 明示指定時のみ（#37 導入後）
- 実装前設計: `design-check`（core）。lab の分析系Skillは明示指定時のみ
- コードレビュー: `recursive-review`（core）。`mino-changeability-review` は lab 明示指定時のみ（#38 導入後）
- 横断走査・還流: `lateral-sweep`（core候補・#36）と `knowledge-reflux`（core）— #36 merge 後に境界を確定

mino 共通原則の規範的正本は [docs/mino-skills/core/mino-core-principles.md](docs/mino-skills/core/mino-core-principles.md) の1ファイルのみ。各 mino Skill は参照し、全文複製しない（#37/#38 導入時に各 `SKILL.md` から参照する）。

## 既知の負債

- **貼付2件は手動同期**: ChatGPT / Codex はリポジトリのファイルを自動で読めないため、
  [docs/harness/roles/chatgpt.md](docs/harness/roles/chatgpt.md) と [docs/harness/roles/codex.md](docs/harness/roles/codex.md)
  の内容を各ツールの設定へ人間が貼り付ける。**貼付元（`docs/harness/roles/`）が正本**であり、ツール側はその写し。
- **Skill一覧の同期**: README の表は計画・境界の人間向け索引（現存と導入予定を分離）。実在Skillは `.agents/skills/` を正とし、追加・削除後は表と setup の実在確認手順で整合を取る。
