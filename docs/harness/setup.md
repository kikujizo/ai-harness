# セットアップ（新規リポジトリへの導入）

このハーネスを任意のGitHubリポジトリに入れる手順。コピー作業は10〜15分で終わる。
基準とリスクダイヤルはここで作り込まず、初回運用で育てる。
各ステップの末尾に「なぜ」を1行添えた。パスは導入先リポジトリのルートを基準とする。

## 前提

- 4AI体制（ChatGPT=仕様化 / Codex=PM / Cursor=実装 / Claude Code=レビュー・技術スーパーバイザ）
- ChatGPTだけはリポジトリ外で動く（後述）。他の3AIはリポジトリ内のファイルを読む
- このキット（配布フォルダ）をローカルに展開済みで、導入先リポジトリのルートで作業する

## 1. キットを丸ごと `docs/harness/` へコピー

このキット全体を導入先の `docs/harness/` にミラーする。以降の実効ファイルはこのミラーから配置する。

```bash
# macOS / Linux
mkdir -p docs/harness && cp -R /path/to/kit/. docs/harness/
```

```powershell
# Windows
robocopy "C:\path\to\kit" ".\docs\harness" /E
```

> なぜ: 実効ファイル内が参照する `docs/harness/loops/`・`docs/harness/knowledge/`・`docs/harness/ops/` を
> 導入先に必ず実在させ、静的リファレンスの導入・更新を1コマンドで済ませるため。

## 2. 実効ファイルを配置

`docs/harness/` から、各AIが実際に読む位置へコピーする（コピー元 → コピー先）:

- `docs/harness/core/AGENTS.md` → ルート `AGENTS.md`
- `docs/harness/roles/claude-code.md` 本文 → ルート `CLAUDE.md`
- `docs/harness/roles/claude-code.md` 内の settings 例 → `.claude/settings.json`
- `docs/harness/roles/cursor.md` 内の `.mdc` ルール → `.cursor/rules/ai-workflow.mdc`
- `docs/harness/skills/` の7本 → `.claude/skills/<name>/SKILL.md`
  （pm-review, recursive-review, design-check, handoff-report, recursive-writing, loop-design, knowledge-reflux）
- `docs/harness/skills/pm-review/SKILL.md` → `.agents/skills/pm-review/SKILL.md`（Codex用。PM評価手順をCodexから読ませる）
- `docs/harness/roles/codex.md` 本体 → Codexのプロジェクト設定・カスタム指示に貼付
- `docs/harness/roles/chatgpt.md` → ChatGPTの Project instructions（カスタム指示）に貼付

> なぜ: 各AIは規定の位置しか自動で読まない。AGENTS.mdは全AIの起点、CLAUDE.md/settings.jsonはClaude Code、
> `.cursor/rules/` はCursor、`.claude/skills/` はClaude Codeのskill、`.agents/skills/` はCodexのskill。
> ChatGPTはリポジトリを読めないためツール側設定に持たせる。

## 3. 運用正本を初期化

日々更新する「育てる正本」を導入先に置く:

- `docs/harness/core/templates.md` → `docs/templates.md`
- `docs/criteria/` に **空の `README.md` だけ** を置く（基準は先回りで書かず、初回運用の×から起こす＝実績主義）
- `docs/harness/ops/risk-dial.md` → `docs/risk-dial.md` にコピーし、記入欄を埋める
- `docs/harness/loops/ledger-template.md` → `docs/loop-ledger.md`

> なぜ: テンプレ・基準・リスクダイヤル・ループ台帳は導入先で育つ運用正本。`docs/harness/` のミラーは
> 静的リファレンスとして触らず、更新はこちらで行う。

## 4. 導入後チェック

- ルートに `AGENTS.md` / `CLAUDE.md` がある
- `.claude/settings.json` と `.claude/skills/*/SKILL.md`（7つ）がある
- `.cursor/rules/ai-workflow.mdc` と `.agents/skills/pm-review/SKILL.md` がある
- `docs/harness/` にキット全体がミラーされている
- `docs/templates.md`・`docs/risk-dial.md`・`docs/loop-ledger.md` がある
- `docs/criteria/` に `README.md` がある（基準は初回運用で追加していく）
- ChatGPT の Project instructions に仕様化ルールが入っている

### シナリオ試験（3件）

- 曖昧仕様の差し戻し: 受け入れ条件のないIssueを渡し、実装せずChatGPT（仕様化）へ差し戻すことを確認する
- 高リスク検知: 不可逆4カテゴリに触るダミータスク（例: `.env`読み取り、CI/CD定義変更）を渡し、
  人間承認を求めて停止することを確認する
- レビュー独立: 実装した本人にレビューを依頼し、担当交代を提案してくることを確認する
