# ハーネス同期の所有権区分

`ai-harness` から適用先リポジトリへ同期するときの所有権ルール。
同期処理は独自エンジンではなく、既存 Action（`actions-template-sync`）と
`.templatesyncignore` に寄せる。本ファイルは所有権の正本。

関連: Issue #8（方針検討） / Issue #10（手動 dry-run・同期PRの実証）

## 3区分

| 区分 | 意味 | 同期時の扱い |
|---|---|---|
| `harness-owned` | ハーネス正本。適用先は原則上書きで追従する | 同期対象 |
| `repo-owned` | 適用先が育てる運用・固有設定 | `.templatesyncignore` で保護（上書きしない） |
| `init-only` | 初回導入時だけ配布し、以後は適用先所有 | `.templatesyncignore` で保護（上書きしない） |

迷ったら「適用先で独自に育つか？」で判定する。育つなら `repo-owned`。

## harness-owned（同期対象）

- `AGENTS.md`
- `CLAUDE.md`
- `.agents/skills/`
- `.cursor/rules/ai-workflow.mdc`
- `.claude/settings.json`（共有の deny / allow 床。個人上書きは `settings.local.json`）
- `docs/harness/`（本ファイルを含む）
- `docs/templates.md`
- `docs/criteria/`
- `setup-links.bat` / `setup-links.sh`

リポジトリ固有の追記が必要な場合は、正本を直接いじらず
`docs/agents-local.md` 等の `repo-owned` 拡張ファイルへ書き、正本から参照する。

## repo-owned（同期しない）

- `.github/`（適用先の CI/CD・Issue/PR テンプレ）
- `.codex/`
- `.claude/settings.local.json`（個人・端末ローカル。gitignore 対象）
- `.templatesyncignore`
- `.gitignore`
- `HARNESS_VERSION`
- `README.md`
- `docs/decisions.md` / `docs/loop-ledger.md` / `docs/risk-dial.md`
- `docs/labels.md` / `docs/setup.md` など適用先固有ドキュメント
- `docs/harness-sync-pilot.md`（パイロット検証記録）
- `prompts/` / `scripts/` / アプリ本体・依存定義

## init-only（初回のみ・以後同期しない）

現状のパイロットでは、初回配布後に適用先で分岐しやすい次を `init-only` 相当として保護する。

- 適用先が既にカスタムした Issue/PR テンプレ（`.github/` 配下に含む）
- 適用先固有のロール追記用ファイル（未作成なら作らない。必要になったら `repo-owned` として追加）

`init-only` を増やすときは、本表と適用先の `.templatesyncignore` を同時に更新する。

## Claude 設定の責務分離

| ファイル | 所有 | コミット | 役割 |
|---|---|---|---|
| `.claude/settings.json` | harness-owned | する | チーム共有の権限床（deny を含む） |
| `.claude/settings.local.json` | repo-owned（個人） | しない | 個人許可・実験。gitignore |

公式ドキュメント上、権限配列はスコープ間で連結・重複排除され、
評価順は deny → ask → allow。いずれかのスコープの deny が勝つ。
したがって共有 deny を `settings.json` に置き、個人の追加 allow を
`settings.local.json` に置いても、共有 deny は緩められない。

## 同期時の警告（必須）

差分に次が含まれる場合、PR 本文または workflow ログに警告を出す。

- `setup-links.*` 変更 → merge 後に `setup-links` を再実行する
- `docs/harness/roles/` 変更 → ChatGPT / Codex へ再貼付する

## 停止理由（stop_reason）

| 値 | 意味 |
|---|---|
| `none` | 続行可 |
| `source_ref_unresolved` | source ref / SHA を解決できない（private 読み取り不可を含む） |
| `ignore_missing` | `.templatesyncignore` が無い |
| `ownership_violation` | repo-owned / init-only が上書き候補に入った |
| `needs_human_review` | 大量削除・意図不明な上書きなど、PR 作成前に人間判断が必要 |

## 適用先での使い方（Step 1〜2）

1. 本表に従い `.templatesyncignore` を置く
2. `workflow_dispatch` のみの `harness-sync` workflow を置く
3. Action は commit SHA 固定。`dry-run` で診断し、問題なければ `create-pr`
4. merge は常に人間。自動 merge / schedule / fan-out / dispatch は後続 Issue

## 撤退手順

- 適用先の `harness-sync` workflow を無効化または削除する
- `.templatesyncignore` による同期運用を止める
- 開いている同期 PR を close する
- 必要なら手動 diff 適用へ戻す（別 Issue で再承認）
