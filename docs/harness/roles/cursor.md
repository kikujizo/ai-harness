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
  `RUN_ROOT=<SCRATCH_BASE>/<repo_slug>/<run_id>/`、
  `RUN_INSTANCE_MARKER=<RUN_ROOT>/.ai-harness-run-instance`）に限定する。
  **`repo_slug` / `run_id` は path/lock 識別子のみ。それ単独を provenance 証明に使わない。**
  **local `scratch-instance/v1` marker の nonce から再計算した commitment と
  `scratch-completion/v2` の `instance_commitment` exact 一致が cleanup provenance の必須条件。**
  `instance_nonce` は local-only（GitHub・ログへ出さない）。commitment のみ公開記録可。
  `LOCK_ROOT`（`<SCRATCH_BASE>/.locks/<repo_slug>/`）と `RUN_ROOT` は兄弟系統であり、
  `COMMON_PREFIX`（`TRUSTED_HOME→CACHE_ROOT→SCRATCH_BASE`）、
  `LOCK_CHAIN`（`TRUSTED_HOME→CACHE_ROOT→SCRATCH_BASE→LOCK_BASE→LOCK_ROOT→RUN_LOCK`）と
  `RUN_CHAIN`（`TRUSTED_HOME→CACHE_ROOT→SCRATCH_BASE→RUN_BASE→RUN_ROOT`）を別々に検証する
  （単一 `PATH_CHAIN` ではない）。
  writerは lock 系 directory（`CACHE_ROOT`/`SCRATCH_BASE`/`LOCK_BASE`/`LOCK_ROOT`）だけを限定 bootstrap し、
  `RUN_LOCK` 取得後に `RUN_BASE`/`RUN_ROOT` を作成し、**payload 前に fresh 256-bit `instance_nonce` と
  `RUN_INSTANCE_MARKER`（create-new/read-back）を作成**する。既存 safe `RUN_ROOT` は
  `run_root_collision` で blocked（再利用・resume 禁止）。completion は `scratch-completion/v2`
  （`instance_commitment` のみ。v1 非受理。**`run_state=completed` / `residue=present` only**——
  `residue=none` は writer 正常フローでは受理しない。到達状態と否定例の正本は `.cursor/rules/ai-workflow.mdc` A9）。
  **新規 directory は umask/既定 ACL に頼らず、Linux/WSL は requested/observed mode `0700` 固定、
  Windows は作成時点から safe owner/DACL を要求し、作成直後に同一 OS の path safety を再検証する
  （`RUN_LOCK`・`RUN_INSTANCE_MARKER` も同じ規則で Linux/WSL は `0600` 固定）。payload descendantも
  cleanup互換の安全属性で作成し、completion record作成前に全descendantを再走査する。
  unsafe/判定不能なdescendantが1件でもあればcompletion recordを作らない（詳細は
  `.cursor/rules/ai-workflow.mdc` A7/A8）。**
  writerとcleanupは同一 `RUN_LOCK` を non-blocking exclusive で必ず取得する。
  **`RUN_LOCK` の取得は曖昧な `OpenOrCreate` 一発ではなく create-new と open-existing を区別し
  （Linux: `flock` / Windows writer: reparse非followのcreate-new・open-existing + `FileShare=None`、
  Windows cleanup: 既存 lock file のみ open・`OpenOrCreate` 禁止）、取得直後に opened handle と
  現在の `RUN_LOCK` path entry の file identity（Linux: device+inode／Windows: `FILE_ID_INFO` 相当）を
  exact 比較する。writer は completion record 作成直前、cleanup は pre-approval 取得直後と
  post-approval 再取得直後・最初の削除 mutation 直前にも同じ比較を行い、不一致・判定不能なら
  mutation へ進まない（詳細は `.cursor/rules/ai-workflow.mdc` A5/B5/B8）。**
  identity-rootは Windows nativeではcurrent SID→`Win32_UserProfile.LocalPath`、
  Linux/WSLでは `id -u`→`getent passwd`第6フィールドを、**`PATH`検索に依存しない
  syscall/NSS APIまたは実体検証済みのOS標準commandで解決**する（差し替え可能な`PATH`上の
  `id`/`getent`は正本にしない。詳細は`.cursor/rules/ai-workflow.mdc` A0）。`USERPROFILE` /
  `HOME` / `~` 等の環境由来homeは正本にせず、不一致・解決不能時はscratch作成も
  cleanup候補化もしない（`scratch_created=false`、run側 mkdir/writeより前に停止）。
  Linux/WSLのbind mount判定は device ID 照合だけに依存せず mount table/mountinfo を用い、
  評価不能は `path_safety_unknown` で blocked。
  scratch初回write前にOS別path safetyを検証する。provenanceの権威入力は
  exact GitHub **`scratch-completion/v2`** 1件と local marker からの commitment 再計算の exact 一致
  （相対 `scratch_rel` のみ。absolute homeは記録しない。`run_id` 単独・v1・path名推測は不可）。
  cleanupは filesystem 上に新規 directory/file/lock を一切作成しない read-only 契約。
  cleanup inventory は `run-inventory/v1` canonical snapshot（`RUN_INSTANCE_MARKER` を含む。
  pre/post で `inventory_version`/`inventory_digest`/`entry_count` の3点exact比較。不一致は `inventory_changed`）。
  cleanup は `RUN_ROOT` と全 descendant へ recursive path safety を適用する（nested mount/bind mount/
  reparse 拒否。詳細は正本参照）。
  通常作業中はcleanupせず、cleanupはexact `RUN_ROOT` に対するread-only技術ゲート全成立後に
  のみ closed questionへ進む。将来の実cleanupは別 `execution` scopeの人間approveが必要。
  人間approveは技術ゲートを代替しない。approve後は既存 `RUN_LOCK` を non-blocking exclusive で
  再取得し、recursive path safety と inventory をゼロから再検証し、削除完了確認までlockを保持する。
  **`RUN_LOCK` のhandle/path identity再確認だけでは各childの実体束縛にならない。削除実行時は、
  approve後に取得したinventoryの各child entryについてもno-followで実体identityを再取得し、
  記録時点との一致をchild単位でmutation直前に確認する。追加・置換・差し替えを検出した場合は
  削除しない（詳細は`.cursor/rules/ai-workflow.mdc` B8(9)）。**
  カテゴリ③（`.mdc` merge）とカテゴリ④（実cleanup）は別発効点。
  詳細・制御順序・否定例の正本は `.cursor/rules/ai-workflow.mdc` と `docs/harness/setup.md`
  （本ファイルは複製しない）。

## GitHub書き込み

CursorがPR本文または実装結果コメントを生成するとき、冒頭に次を置く:

```md
> **記録者**: Cursor
```

共通ルール・代理時・転記時の扱いは、ルートの `AGENTS.md`「GitHubドリヴン記録」を参照する。
