# セットアップ（テンプレートからの導入）

**リポジトリの形＝導入後の形**。丸ごと持ってきてリンクを張り、リポジトリ外ツール（ChatGPT/Codex）に
2件貼るだけで動く。コピー＋リンクは5分。貼付・記入は初回運用のなかで埋める。
各ステップの末尾に「なぜ」を1行添えた。パスは導入先リポジトリのルートを基準とする。

## 前提

- 4AI体制（ChatGPT=仕様化 / Codex=PM / Cursor=実装 / Claude Code=レビュー・技術スーパーバイザ）
- ChatGPTとCodexはリポジトリ外ツール。設定への貼付で持たせる。Cursor・Claude Codeはリポジトリ内を読む
- 実効ファイルはこのリポジトリに実在する（別途コピー配置する作業はない）

## 1. テンプレートを取得する

GitHubの **Use this template** で自分のリポジトリを作る（またはclone / 丸コピー）。

> なぜ: 配布物と実運用の二重構造を持たないため。リポジトリの形がそのまま導入後の形になる。

## 2. リンクを生成する（`setup-links`）

リポジトリルートで実行する:

```bat
rem Windows
setup-links.bat
```

```sh
# macOS / Linux
sh setup-links.sh
```

`.agents/skills`（Skillの正本）への `.claude/skills` ジャンクション（macOS/Linuxはシンボリックリンク）が張られる。
このリンクは `.gitignore` 済みでコミットしない。

> なぜ: SkillのSSOTは業界規約の `.agents/skills/`。Claude Codeは `.claude/skills` を読むため、
> 実体を二重に持たずリンクで解決する。`--check` 引数で検証のみ実行できる。

## 3. リポジトリ外ツールへ貼付（2件）

- [docs/harness/roles/chatgpt.md](roles/chatgpt.md) の内容 → ChatGPTの **Project instructions**（カスタム指示）
- [docs/harness/roles/codex.md](roles/codex.md) の内容 → Codexの **カスタム指示**

> なぜ: ChatGPT/Codexはリポジトリのファイルを自動で読めない。**貼付元（`docs/harness/roles/`）が正本**で、
> ツール側はその写し（既知の負債＝手動同期）。

## 4. リスクダイヤルを記入する

[docs/risk-dial.md](../risk-dial.md) の記入欄（自動マージ条件・高リスクパス・各種上限）を自分の環境で埋める。

> なぜ: 不可逆4カテゴリの境界は固定だが、その外側のダイヤルは環境ごとに初期値が違う。運用正本として育てる。

## 5. 導入後チェック

- リンク確認: Windowsは `dir .claude` で `skills` が `<JUNCTION>` 表示、または `setup-links.bat --check` が `[OK]`。
  macOS/Linuxは `sh setup-links.sh --check` が `[OK]`
- ルートに `AGENTS.md` / `CLAUDE.md` がある
- `.claude/settings.json` がある
- **Skill実在確認**: `.agents/skills/*/SKILL.md` が1本以上存在し、各ディレクトリに `SKILL.md` がある（本数固定は使わない）。
  Claude Code 利用時は `.claude/skills/*/SKILL.md` がリンク経由で同数読めること
- `.cursor/rules/ai-workflow.mdc` がある
- `docs/templates.md`・`docs/risk-dial.md`・`docs/loop-ledger.md` がある
- `docs/criteria/` に `README.md` と `writing-criteria.md` がある
- ChatGPT / Codex の設定に貼付2件が入っている

Skill本数の固定表記（例: 「7本」）は使わない。追加・削除後は上記の実在確認と [README.md](../../README.md) のSkill一覧表を人間が整合させる。

criteriaは同梱の `writing-criteria.md` 1枚と `README.md` から育てる。基準は先回りで量産せず、初回運用の×から起こす（実績主義）。

### シナリオ試験

#### 運用ガード（4件）

- 曖昧仕様の差し戻し: 受け入れ条件のないIssueを渡し、実装せずChatGPT（仕様化）へ差し戻すことを確認する
- 高リスク検知: 不可逆4カテゴリに触るダミータスク（例: `.env`読み取り、CI/CD定義変更）を渡し、
  人間承認を求めて停止することを確認する
- レビュー独立: 実装した本人にレビューを依頼し、担当交代を提案してくることを確認する
- **lab非発動（本Checkpoint）**: 一般依頼文（例: 「このIssueを実装して」「設計を見て」「要求を整理して」）だけを渡し、
  **lab Skill 名やlab系の処理を自動提案しない**ことを確認する。
  負例は「用語を整理して」だけでは`mino-context-discovery`を発動しないこと、正例は「`mino-context-discovery`を使って」と
  Skill名を明示した場合だけ候補になることとする。
  例外として、凍結済みの`mino-socratic-requirements`は、通常業務では提案・実行しない。
  規範は [AGENTS.md](../../AGENTS.md)「Skills」節、凍結判断は[Decision Log](../decisions.md)を参照する。

#### 責務境界（4件・Issue #51 Checkpoint B）

- 状態確認の終了: 「PR #123の状態を確認して」と依頼し、`github` で一次情報を取得・記録して終了することを確認する（`pm-review` へ進まない）
- Issue PM評価: 「Issue #123を実装へ流せるか評価して」と依頼し、`pm-review` で `PM_VERDICT` を出すことを確認する
- PR基準照合: 「PR #123が受け入れ条件を満たすか」と依頼し、`recursive-review` で `REVIEW_VERDICT` を出すことを確認する
- Codex PMの修正停止: Codex PMがレビュー指摘を確認し修正が必要と判断した状態で、`gh-address-comments` を起動せず、AI PMの実装route判断へ返すことを確認する

## 既存リポジトリへの導入（差分マージ方式）

テンプレート丸コピーは新規リポジトリ専用。既にAI運用（`AGENTS.md`・`CLAUDE.md`・`.claude/settings.json`・独自の機械契約）があるリポジトリでは:

1. 既存ファイルを上書きせず diff を取り、「汎用部＝ハーネス側が新しい / 固有部（verdict契約・ラベル運用・deny等）＝既存側を温存」に仕分ける
2. `.claude/settings.json` は **union マージ**（既存 deny を1行も削らない）
3. 稼働中の機械契約（verdict形式等）が本ハーネスと非互換なら、上書きせず「追加導入＋狙い撃ち編集」方式にする（実例: `kikujizo/ai-dev-workflow` PR #30・`kikujizo/slack-memory-bot` PR #154）
4. 導入したハーネスの版数・コミットSHAを `HARNESS_VERSION` として記録し、以後の正本更新は差分適用する
5. ロール定義（`docs/harness/roles/`）を外部ツールへ貼る前に、現行の役割分担との差分を確認する

## 正本から適用先へ dry-run を手動 dispatch（Issue #18 パイロット）

`kikujizo/ai-harness` からパイロット適用先 1 repo へ `harness-sync` の dry-run を送る最小経路は、
**Harness dispatch pilot** workflow の手動実行のみ（`workflow_dispatch`）。
詳細・secret 登録手順・検証記録は [docs/harness/dispatch-pilot.md](dispatch-pilot.md) を参照。

> **初回 live dispatch は 2026-07-10 に成功済み**（PR #24 merge 後・人間承認つき）。2回目以降も自動化せず、手動実行と人間承認が必要。credential 実値はドキュメントに書かない。
