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
  `RUN_ROOT=<TRUSTED_HOME>/.cache/ai-harness-scratch/<repo_slug>/<run_id>/`）に限定する。
  writerとcleanupは同一 `RUN_LOCK`（`<SCRATCH_BASE>/.locks/<repo_slug>/<run_id>.lock`）を
  non-blocking exclusive で必ず取得する（Linux: flock / Windows: FileShare=None）。
  identity-rootは Windows nativeではcurrent SID→`Win32_UserProfile.LocalPath`、
  Linux/WSLでは `id -u`→`getent passwd`第6フィールド（#139再利用）。`USERPROFILE` /
  `HOME` / `~` 等の環境由来homeは正本にせず、不一致・解決不能時はscratch作成も
  cleanup候補化もしない（`scratch_created=false`、mkdir/writeより前に停止）。
  scratch初回write前にOS別path-chain safetyを検証する。provenanceの権威入力は
  exact GitHub completion record 1件（相対 `scratch_rel` のみ。absolute homeは記録しない）。
  通常作業中はcleanupせず、cleanupはexact `RUN_ROOT` に対するread-only技術ゲート全成立後に
  のみ closed questionへ進む。人間approveは技術ゲートを代替しない。approve後はlock再取得と
  全ゲート再検証を行い、削除完了確認までlockを保持する。状態変化時は再承認が必要。
  カテゴリ③（`.mdc` merge）とカテゴリ④（実cleanup）は別発効点。
  詳細・制御順序・否定例の正本は `.cursor/rules/ai-workflow.mdc` と `docs/harness/setup.md`
  （本ファイルは複製しない）。

## GitHub書き込み

CursorがPR本文または実装結果コメントを生成するとき、冒頭に次を置く:

```md
> **記録者**: Cursor
```

共通ルール・代理時・転記時の扱いは、ルートの `AGENTS.md`「GitHubドリヴン記録」を参照する。
