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
  **A4 では各 missing component について verified 親へ create 前 **PreDirCreateParentBind** を証明してから
  1 段作成→直後再検証する（parent_binding 証明不能は directory create 前 `path_safety_unknown`
  `create_dir_attempted=false`）。`RUN_LOCK` 取得後に `RUN_BASE`/`RUN_ROOT` を作成する（A6 も同様の
  create 前 binding 原則。`RUN_LOCK` 順序は A4 より前倒ししない）**、**payload 前に fresh 256-bit `instance_nonce` と
  `RUN_INSTANCE_MARKER`（create-new/read-back）を作成**する。既存 safe `RUN_ROOT` は
  `run_root_collision` で blocked（再利用・resume 禁止）。completion は `scratch-completion/v2`
  （`instance_commitment` のみ。v1 非受理。**`run_state=completed` / `residue=present` only**——
  `residue=none` は writer 正常フローでは受理しない。到達状態と否定例の正本は `.cursor/rules/ai-workflow.mdc` A9）。
  **新規 directory は umask/既定 ACL に頼らず、Linux/WSL は requested/observed mode `0700` 固定、
  Windows は作成時点から safe owner/DACL を要求する。各 missing directory は verified 親へ create 前
  **PreDirCreateParentBind** を証明してから bound parent から 1 段作成し、作成直後に同一 OS の path safety を
  再検証する（pathname 事前 check + create + post-check だけでは不足。証明不能は create 前
  `path_safety_unknown` `create_dir_attempted=false`）。
  （`RUN_LOCK`・`RUN_INSTANCE_MARKER` も同じ規則で Linux/WSL は `0600` 固定）。payload descendantも
  cleanup互換の安全属性で作成し、completion record作成前に全descendantを再走査する。
  unsafe/判定不能なdescendantが1件でもあればcompletion recordを作らない（詳細は
  `.cursor/rules/ai-workflow.mdc` A7/A8）。**
  **`RUN_INSTANCE_MARKER` と payload regular file は、expected leaf pathname に対する create-new および
  初回 content write の両方より前に、leaf から `RUN_ROOT` までの各 ancestor directory（`RUN_ROOT`
  含む）を pre-write binding する（leaf create-new 成功・`RUN_LOCK` 保持だけでは ancestor-bound と
  みなさない。証明不能は create-new 前に blocked：`path_safety_unknown`）。create-new は bound
  ancestor directory handle 経由（例: `openat`/`CreateFile` 相当）または同等 OS/API 保証がある
  場合のみ実行する。**
  **leaf binding**: atomic create-new / no-overwrite で得た同一 handle/descriptor へ束縛する。
  create-new 後の pathname 再 open による初回 write / truncate は禁止。expected pathname への既存
  entry（外部 file への hard link 先置き含む）は open/truncate しない。leaf pre-write binding を
  証明不能・不一致なら当該 write 前に blocked（`path_safety_failed` / `path_safety_unknown`）。
  A7 失敗時は A8 未進入（詳細は正本 A7/A8）。**
  **payload directory**: 各 one-level create 前に `PreDirCreateAncestorBind`（`parent(D)`..`RUN_ROOT`
  inclusive）と bound-parent one-level create-new。証明不能は create 前 `path_safety_unknown`
  （詳細は正本 A8）。**
  **leaf containment（`LeafContainmentCapabilityGate`）**: `RUN_INSTANCE_MARKER` と payload regular file は
  create-new 成功〜初回 content write 完了までの leaf containment を OS/API で証明できる場合のみ write。
  writer の fresh 成功経路は **`platform=windows_native`、または `leaf_containment_capability=demonstrated`
  を実証できる環境に限定**する。Linux/WSL の現行契約プリミティブだけでは `demonstrated` にならず、
  証明不能は content write 前 `path_safety_unknown`（pathname 単発照合・短時間窓・post-write scan 等は
  安全代替にしない。詳細は正本 A7/A8）。**
  **A8: payload entry へ 1回でも write mutation 成功後の short write / flush / close 失敗は
  `payload_written=true` で fail-closed 残留を肯定し completion 未作成・`auto_*`=false とする
  （詳細は正本 A8）。**
  **A7のmarker content write後にread-back/decode/schema検証が失敗した場合、
  `run_root_created=true` `instance_marker_created=true` と肯定記録し、marker/residueを
  未作成扱いで隠さない。`auto_cleanup`/`auto_repair`/`auto_resume`へ進まない（詳細は正本 A7）。**
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
  再取得し、recursive path safety と inventory をゼロから再検証する。delete mutationへ進むのは
  Windowsでverified handle bindingが成立した場合のみで、その場合は削除完了確認までlockを保持する
  （Linux/WSLはbinding不能のためmutationに進まない）。
  **`RUN_LOCK` のhandle/path identity再確認だけでは`RUN_ROOT`自身・各childの実体束縛に
  ならない。削除実行時は、`RUN_ROOT`自身のidentityをmutation candidateごとにbaselineとexact
  比較するroot binding確認を先に行い、approve後に取得した公開`run-inventory/v1`とは別の
  process-local child identity baseline（B8(6)）を比較元に、各child entryの実体identity・type・
  path safetyをchild単位で読み取り専用再確認する。regular fileはidentity一致だけでは同一inode上の
  in-place writeを検出できないため、size/SHA-256もinventoryとexact再照合する。directoryは配下
  削除後・自身の削除直前にchild集合を再列挙しinventoryと照合する（bottom-up削除によるchild集合の
  正常な減少はdriftとしない）。追加・置換・差し替え・content不一致を検出した場合は削除しない。**
  **上記の再確認は読み取り専用であり、実際のdelete mutationはOS境界でのみ許可する。
  Windowsは、削除直前に取得した**verified handle**（同一handle上でidentity/type/content再確認
  済み、write/delete sharingを排除するか同等の安全性を証明できる条件で取得）へdeleteを束縛できる
  場合だけ削除可能とし、pathname-onlyの`DeleteFile`/`RemoveDirectory`を
  binding根拠にしない。Linux/WSLは、同一UIDの非協調processによるrename/replaceを現在許可された
  APIでは原子的に排除できないため、read-only再確認が全てpassしても同一実体へのbindingを保証
  できず、delete mutation前に`path_safety_unknown`で停止する（`unlink`等のpathname delete APIを
  使わない。詳細は`.cursor/rules/ai-workflow.mdc` B8(9)）。**
  **Windows cleanup では各 child candidate open 前に B8(6) baseline 一致の verified `RUN_ROOT`
  directory handle を取得し、child open〜handle-based disposition 完了まで保持する。rename/delete
  sharing 排除または同等保証を証明不能なら最初の該当 delete mutation 前に `path_safety_unknown`
  で blocked（pathname 単発比較・`RUN_LOCK` 保持のみ・child handle のみを安全根拠にしない）。**
  **marker create-new 成功後の content write / short write / 後続 write / flush / close /
  durability 結果確認失敗は、mutation 成立または不明なら `instance_marker_created=true`
  `payload_written=false` `completion_record_created=false` `result=blocked` を肯定伝播し、
  cached read-back 成功だけで durability 失敗を無視して A8 / completion / auto_* へ進まない
  （詳細は正本 A7）。**
  **A8のpayload write後recursive safety再走査失敗、またはA9でのlock identity driftにより
  blockedとなった場合、A8で作成済みのpayloadを「未作成」と
  誤報しない。payloadは残留し得る状態として保持し、completion未作成・blockedのまま自動delete/
  repair/resumeへ進まない（詳細は`.cursor/rules/ai-workflow.mdc` A8/A9）。**
  カテゴリ③（`.mdc` merge）とカテゴリ④（実cleanup）は別発効点。
  詳細・制御順序・否定例の正本は `.cursor/rules/ai-workflow.mdc` と `docs/harness/setup.md`
  （本ファイルは複製しない）。

## GitHub書き込み

CursorがPR本文または実装結果コメントを生成するとき、冒頭に次を置く:

```md
> **記録者**: Cursor
```

共通ルール・代理時・転記時の扱いは、ルートの `AGENTS.md`「GitHubドリヴン記録」を参照する。
