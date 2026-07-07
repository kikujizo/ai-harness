# AI協働ハーネス v3.0（汎用版）

> このリポジトリ（`kikujizo/ai-harness`）が本ハーネスの正本。ローカル・Vault内のコピーは作業用であり、矛盾時はこのリポジトリが勝つ。
> （SSOT原則）

4AI協働体制（ChatGPT=仕様化 / Codex=技術PM / Cursor=実装 / Claude Code=レビュー・技術スーパーバイザ）を、
**どのGitHubリポジトリにも置ける形にした汎用ルール＋Skill集**。
特定のリポジトリ・Obsidian環境・CI/CDパイプライン実装には依存しない。

導入先リポジトリは3層になる: **実効ファイル**（ルート `AGENTS.md`・`CLAUDE.md`・`.claude/`・`.cursor/`・
`.agents/`）＋ **`docs/harness/`**（このキット丸ごとのミラー＝静的リファレンス）＋ **`docs/` 運用正本**
（`templates.md`・`criteria/`・`risk-dial.md`・`loop-ledger.md` を記入して育てる）。

## 30秒ガイド

- **導入する** → [core/setup.md](core/setup.md)（新規リポジトリへコピー10〜15分で導入する手順）
- **ルールの正本** → [core/AGENTS.md](core/AGENTS.md)（役割分担・リスク分類・出力契約はここが唯一の正本）
- **AI別の設定** → [roles/](roles/)（chatgpt / codex / cursor / claude-code の各アダプタ）
- **ループを作る・直す** → [loops/principles.md](loops/principles.md)＋[skills/loop-design/](skills/loop-design/SKILL.md)
- **知見をルールに育てる** → [knowledge/reflux.md](knowledge/reflux.md)＋[skills/knowledge-reflux/](skills/knowledge-reflux/SKILL.md)

## 構成

| フォルダ | 内容 | 正本を持つもの |
|---|---|---|
| `core/` | AGENTS.md・共通テンプレート・導入手順 | リスク分類（不可逆4カテゴリ）、出力契約 |
| `roles/` | 4AI各ツール向けアダプタ（配置先と固有差分） | — |
| `skills/` | Skill 7本（pm-review / recursive-review / design-check / handoff-report / recursive-writing / loop-design / knowledge-reflux） | — |
| `loops/` | ループエンジニアリング：原則・失敗様式マップ・台帳テンプレ | 4ハードガード（無進展検出を含む） |
| `knowledge/` | 知識還流ループ：昇格パイプライン・正本マップ（SSOT）・基準ファイル | 昇格ゲートの数値、経緯レス正本ルール |
| `ops/` | 運用：オーケストレーション・ルーティング・トークン規律・リスクダイヤル・トレンド監視・OSS選定 | — |

## 設計原則（このハーネス自体が従うルール）

1. **正本1箇所**: 同じ定義を複数ファイルに書かない。他ファイルは正本への相対リンクで参照する
2. **経緯レス正本**: 旧版・移行済み・制作経緯を正本に置かない。経緯は Decision Log が担う（[knowledge/ssot.md](knowledge/ssot.md)）
3. **役割と自動化の分離**: 役割分担（4AI）と自動化の有無（対話 / CI/CD）は独立した軸。
   本ハーネスは対話運用がベースで、CI/CD自動レーンは「承認の第2の源泉（状態機械）」として追加できる
4. **実績ベースの昇格**: ルール・基準・ループの自律度は、実績（参照回数・×検出・完走実績）でのみ昇格し、インシデントで即降格する

## 使い方の注意

- **パス表記規約**: 実効化ファイル内のコードスパンのパスは**導入先リポジトリ基準**（例: `docs/harness/loops/`）。
  この配布フォルダ内で読むときは `docs/harness/` をこのフォルダ自身に読み替える
- Skill本文は自己完結だが、相対リンク先（`loops/` `knowledge/` など）も併せてリポジトリに置くと参照が生きる。
  配置の対応関係は [core/setup.md](core/setup.md) を正とする
- `ops/` の表（レーン表・リスクダイヤル初期値・OSS例）は**自分の環境に合わせて書き換える前提**の記入式
- GitHub Actionsによる全自動パイプライン（Workflow群・ラベル状態機械）の実装例はこのハーネスには含めない。
  必要なら本ハーネスの承認原則（状態機械＝第2の源泉）に沿って各リポジトリで設計する
- `knowledge/criteria/` と `core/templates.md` は**配布元（本家）**。導入先リポジトリでは
  `docs/criteria/`・`docs/templates.md` が**運用正本**になり、日々の更新は導入先で行う。
  導入先で育った基準は knowledge-reflux で本家へ還流する
