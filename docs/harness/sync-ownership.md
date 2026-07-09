# ハーネス同期の所有権区分

`ai-harness` から適用先リポジトリへ同期するときの所有権ルール。
同期処理は独自エンジンではなく、既存 Action（`actions-template-sync`）と
`.templatesyncignore` に寄せる。本ファイルは所有権の正本。

関連: Issue #8（方針検討） / Issue #10（手動 dry-run・同期PRの実証） / Issue #16（ownership_violation 分類）

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
| `ownership_violation` | repo-owned / init-only が **最終同期コミット** に残った（post-sync 検証で検出） |
| `needs_human_review` | 大量削除・意図不明な上書きなど、PR 作成前に人間判断が必要 |

## 保護レイヤの責務分離（Issue #16）

| レイヤ | 場所 | 役割 |
|---|---|---|
| 1. 所有権表 | 本ファイル（`docs/harness/sync-ownership.md`） | 期待分類の正本 |
| 2. Action ignore | 適用先 `.templatesyncignore` | `actions-template-sync` の `handle_templatesyncignore` が `git reset` で除外 |
| 3. precommit hook | `scripts/harness-sync-precommit.sh` | **所有権停止は行わない**（hook 実行タイミングが ignore より前のため false positive になる） |
| 4. post-sync 検証 | `scripts/harness-sync-verify-boundaries.sh` + workflow ステップ | ignore 適用後の最終コミットに repo-owned が残っていないか確認 |

`actions-template-sync` は `git pull --squash` で source を取り込んだ後、`precommit` → `git add .` →
`handle_templatesyncignore` の順で処理する。`.templatesyncignore` に載っていても、precommit 時点では
repo-owned ファイルが一時的に staged に載る。Issue #14 の dry-run で見えた `ownership_violation` は
このタイミング差による **誤検知** であり、保護そのものは `.templatesyncignore` + post-sync 検証が担う。

## Issue #16: ownership_violation 対象4ファイルの分類

Issue #14 dry-run（`source_sha=97a2e24314f37a1565115ea0092bb481a937ac19`）で precommit が検出した4ファイル。

| Path | 差分候補になった理由 | 期待分類 | 保護場所 | 判断理由 | 対応 |
|---|---|---|---|---|---|
| `.gitignore` | source と target で内容が異なり squash merge が Auto-merging | `repo-owned` | `.templatesyncignore` + post-sync 検証 | 適用先固有の ignore（`settings.local.json` 等）が育つ | 保護継続。ignore 修正不要 |
| `README.md` | テンプレ正本 README と適用先プロジェクト README が別物 | `repo-owned` | `.templatesyncignore` + post-sync 検証 | 適用先説明・現在地が育つ（init-only ではない） | 保護継続 |
| `docs/decisions.md` | 各 repo の Decision Log が独立に蓄積 | `repo-owned` | `.templatesyncignore` + post-sync 検証 | 適用先 Decision Log が育つ | 保護継続 |
| `docs/risk-dial.md` | テンプレは記入欄プレースホルダ、適用先は運用値を記入済み | `repo-owned` | `.templatesyncignore` + post-sync 検証 | 正本は配布テンプレだが、記入後は適用先運用データ。上書きするとダイヤル初期値が消える | 保護継続（harness-owned に変更しない） |

`.templatesyncignore` の記述形式（`.gitignore` 風パス）は `handle_templatesyncignore` の `git reset -- <pathspec>` と整合する。
Action README の `:!` pathspec は「全同期からの例外指定」用途であり、本パイロットの個別ファイル列挙とは別用途。

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
