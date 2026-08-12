# Cursor ロール定義の解説（メイン実装担当）

Cursorの実効ルールはリポジトリに実在する。このファイルは**解説**であり、実物（`.mdc`）を複製しない
（SSOT: 実物が正本、ここは解説）。

## 実効ファイルの場所

- 実効ルール → `.cursor/rules/ai-workflow.mdc`（`alwaysApply: true` でCursorが常時読む）
- 全AI共通の正本 → ルートの `AGENTS.md`（実効ルール。`CLAUDE.md` と整合させる）

## 標準フローでの位置づけ

Cursorはメイン実装担当。実装後の既定レビューは ChatGPT（要件）＋ Codex（技術）。
Claude Codeは通常フローの既定レビュアーではない（例外委譲時のみ関与）。

## 設計解説

- `.mdc` にはCursor固有の差分だけを置く。安全・独立・出力契約の正本はAGENTS.mdにあり、複製しない
  （重複すると毎ターン多重に読み込みトークンを浪費する）。
- 実装前にタスクを1文で言い直し、変更ファイルと触らない範囲を宣言させるのは、差分を小さく保つための型。
- 「2敗で自走を止めhandoff-reportで上位へ引き継ぐ」はリトライ浪費を止めるエスカレーション規律の実装。
- 文書生成タスクではrecursive-writingを使う。`.env`・secretの秘匿とmain直push禁止は、
  指示だけでなくブランチ保護を最終防衛に置く。
- 一時ファイルはOS identity由来のtrusted home配下のrun固有scratch（
  `CACHE_ROOT=<TRUSTED_HOME>/.cache`、`SCRATCH_BASE=<CACHE_ROOT>/ai-harness-scratch`、
  `RUN_ROOT=<SCRATCH_BASE>/<repo_slug>/<run_id>/`）に限定する。
  `LOCK_ROOT`（`<SCRATCH_BASE>/.locks/<repo_slug>/`）と `RUN_ROOT` は兄弟系統であり、
  `COMMON_PREFIX`（`TRUSTED_HOME→CACHE_ROOT→SCRATCH_BASE`）、
  `LOCK_CHAIN`（`TRUSTED_HOME→CACHE_ROOT→SCRATCH_BASE→LOCK_BASE→LOCK_ROOT→RUN_LOCK`）と
  `RUN_CHAIN`（`TRUSTED_HOME→CACHE_ROOT→SCRATCH_BASE→RUN_BASE→RUN_ROOT`）を別々に検証する
  （単一 `PATH_CHAIN` ではない）。
  writerは lock 系 directory（`CACHE_ROOT`/`SCRATCH_BASE`/`LOCK_BASE`/`LOCK_ROOT`）だけを限定 bootstrap し、
  `RUN_LOCK` 取得後にのみ `RUN_BASE`/`RUN_ROOT`/payload を作成する。既存 safe `RUN_ROOT` は
  `run_root_collision` で blocked（再利用・resume 禁止）。
  writerとcleanupは同一 `RUN_LOCK` を non-blocking exclusive で必ず取得する
  （Linux: flock / Windows writer: `OpenOrCreate`+`FileShare=None`、
  Windows cleanup: 既存 lock file のみ open・`OpenOrCreate` 禁止）。
  identity-rootは Windows nativeではcurrent SID→`Win32_UserProfile.LocalPath`、
  Linux/WSLでは `id -u`→`getent passwd`第6フィールド。`USERPROFILE` /
  `HOME` / `~` 等の環境由来homeは正本にせず、不一致・解決不能時はscratch作成も
  cleanup候補化もしない（`scratch_created=false`、run側 mkdir/writeより前に停止）。
  Linux/WSLのbind mount判定は device ID 照合だけに依存せず mount table/mountinfo を用い、
  評価不能は `path_safety_unknown` で blocked。
  scratch初回write前にOS別path safetyを検証する。provenanceの権威入力は
  exact GitHub completion record 1件（相対 `scratch_rel` のみ。absolute homeは記録しない）。
  cleanupは filesystem 上に新規 directory/file/lock を一切作成しない read-only 契約。
  cleanup inventory は `run-inventory/v1` canonical snapshot（`inventory_version`/`inventory_digest`/
  `entry_count` の3点exact比較。full entry list は GitHub へ書かない）。
  cleanup は `RUN_ROOT` と全 descendant へ recursive path safety を適用する（nested mount/bind mount/
  reparse 拒否。詳細は正本参照）。
  通常作業中はcleanupせず、cleanupはexact `RUN_ROOT` に対するread-only技術ゲート全成立後に
  のみ closed questionへ進む。将来の実cleanupは別 `execution` scopeの人間approveが必要。
  人間approveは技術ゲートを代替しない。approve後は既存 `RUN_LOCK` を non-blocking exclusive で
  再取得し、recursive path safety と inventory をゼロから再検証し、削除完了確認までlockを保持する。
  カテゴリ③（`.mdc` merge）とカテゴリ④（実cleanup）は別発効点。
  詳細・制御順序・否定例の正本は `.cursor/rules/ai-workflow.mdc` と `docs/harness/setup.md`
  （本ファイルは複製しない）。

## GitHub書き込み

CursorがPR本文または実装結果コメントを生成するとき、冒頭に次を置く:

```md
> **記録者**: Cursor
```

共通ルール・代理時・転記時の扱いは、ルートの `AGENTS.md`「GitHubドリヴン記録」を参照する。
