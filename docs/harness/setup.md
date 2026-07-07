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

- [roles/chatgpt.md](roles/chatgpt.md) の内容 → ChatGPTの **Project instructions**（カスタム指示）
- [roles/codex.md](roles/codex.md) の内容 → Codexの **カスタム指示**

> なぜ: ChatGPT/Codexはリポジトリのファイルを自動で読めない。**貼付元（`docs/harness/roles/`）が正本**で、
> ツール側はその写し（既知の負債＝手動同期）。

## 4. リスクダイヤルを記入する

[docs/risk-dial.md](../risk-dial.md) の記入欄（自動マージ条件・高リスクパス・各種上限）を自分の環境で埋める。

> なぜ: 不可逆4カテゴリの境界は固定だが、その外側のダイヤルは環境ごとに初期値が違う。運用正本として育てる。

## 5. 導入後チェック

- リンク確認: Windowsは `dir .claude` で `skills` が `<JUNCTION>` 表示、または `setup-links.bat --check` が `[OK]`。
  macOS/Linuxは `setup-links.sh --check` が `[OK]`
- ルートに `AGENTS.md` / `CLAUDE.md` がある
- `.claude/settings.json` があり、`.claude/skills/*/SKILL.md`（7つ）がリンク経由で読める
- `.cursor/rules/ai-workflow.mdc` と `.agents/skills/`（7本）がある
- `docs/templates.md`・`docs/risk-dial.md`・`docs/loop-ledger.md` がある
- `docs/criteria/` に `README.md` と `writing-criteria.md` がある
- ChatGPT / Codex の設定に貼付2件が入っている

criteriaは同梱の `writing-criteria.md` 1枚と `README.md` から育てる。基準は先回りで量産せず、初回運用の×から起こす（実績主義）。

### シナリオ試験（3件）

- 曖昧仕様の差し戻し: 受け入れ条件のないIssueを渡し、実装せずChatGPT（仕様化）へ差し戻すことを確認する
- 高リスク検知: 不可逆4カテゴリに触るダミータスク（例: `.env`読み取り、CI/CD定義変更）を渡し、
  人間承認を求めて停止することを確認する
- レビュー独立: 実装した本人にレビューを依頼し、担当交代を提案してくることを確認する
