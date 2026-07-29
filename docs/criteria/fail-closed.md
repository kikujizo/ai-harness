# 基準: fail-closed機構の新設・変更（fail-closed-criteria）

> **これは何か**: 新設または変更する fail-closed 機構について、実装前と独立レビュー時に既知の迂回パターンを推測で `pass` にせず照合するための基準。
> **到達状態**: 下位処理の失敗取りこぼし・identity 差し替え・path chain 迂回・永続 claim 無効化・検証前の状態消費・provenance 捏造・並行残留・test hook 漏洩のいずれかを、根拠付きで検出できる。
> **較正状態**: 初回作成（Issue #116）。最初の2〜3回は人間が AI の判定を確認して較正する。

**本基準は「全項目を常に実装する」命令ではない。** 対象外は理由付き `not_applicable` とできるが、**未確認を対象外扱いしてはならない。**

## 適用タイミング

- fail-closed 機構の**新設**または**安全契約の変更**の実装着手前
- 上記を含む PR の**独立レビュー時**（`recursive-review` 手順1で本ファイルを選択）

実効ルールからの参照: `AGENTS.md`「実装ルール」節、`CLAUDE.md`、`.cursor/rules/ai-workflow.mdc`。

## 入力（照合前に揃えること）

対象機構について、少なくとも次を明示する。

```text
保護対象 / gateの正本 / path・identityの解決方法 / 状態変更順序 / 成功条件 / override・test hook / 並行・中断時挙動 / provenance
```

## 出力（各基準の判定形式）

```text
criterion=<id>
result=pass|fail|not_applicable
basis=<確認したテスト・仕様・差分・観測不能の理由>
next_action=continue|return_to_pm|blocked
```

- `not_applicable` には**対象外理由を必須**とする
- 根拠不足・未確認は `result=fail` / `basis=evidence_unavailable` / `next_action=blocked`
- Issue外の設計変更が必要な場合は `result=fail` / `next_action=return_to_pm` とし、`AGENTS.md`「Issue外の設計変更」の**提案5点**を記録して Codex PM へ返す（推測で `pass` しない）

## 基準（8項目）

### 1. `success-propagation` — 成功伝播

**判定質問**: 下位処理の非0終了・`false`・未確認結果が、呼び出し元や全体の成功判定へ取りこぼされないか。

**passに必要な観測可能な証拠**: 下位の終了コード・ブール・エラー伝播経路がテストまたは仕様で追跡でき、失敗時に上位が成功扱いにならないことを確認した記録（テスト名・assert・ログ契約のいずれか）。

**失敗時の停止挙動**: 該当経路の実装・merge を止め、`next_action=blocked`。修正後に再照合。

**attribution**: `source-derived`

**source**: [ai-dev-workflow Issue #123](https://github.com/kikujizo/ai-dev-workflow/issues/123)（非0終了の伝播、cleanup 対象の安全確認）

---

### 2. `identity-root` — identity / root の正本

**判定質問**: `$HOME` 等の可変入力だけで、gate・ledger・ownership 判定の正本が別物へ差し替えられないか。

**passに必要な観測可能な証拠**: 実ホーム・実 identity の解決方法が Issue/仕様で固定され、環境変数偽装だけでは production 正本へ到達できないことを示すテストまたは否定例がある。

**失敗時の停止挙動**: identity 解決まわりの実装を止め、`next_action=blocked`。解決不能時は未接触停止の契約を先に確定する。

**attribution**: `source-derived`

**source**: [ai-dev-workflow Issue #139](https://github.com/kikujizo/ai-dev-workflow/issues/139)（`$HOME` 偽装による production ledger 迂回、解決不能時の未接触停止）

---

### 3. `path-chain-safety` — path chain 安全性

**判定質問**: symlink、mountpoint、所有者不一致、危険 mode、special entry を path 構成要素ごとに検証しているか。

**passに必要な観測可能な証拠**: 各構成要素の検証手順が仕様またはテストで列挙され、危険な中間要素を拒否または fail-closed する観測記録がある。

**失敗時の停止挙動**: path 解決・検証ロジックの実装を止め、`next_action=blocked`。

**attribution**: `source-derived`

**source**: [ai-dev-workflow Issue #123](https://github.com/kikujizo/ai-dev-workflow/issues/123)（path・排他・残留検出の安全確認）

---

### 4. `persistent-claim-bypass` — 永続 claim の迂回不能性

**判定質問**: 別 root・新規 claim・state 初期化だけで、一度限りの gate を無効化できないか。

**passに必要な観測可能な証拠**: claim の有効範囲・無効化条件が仕様化され、迂回経路（別 root、再初期化、claim 上書き）に対する否定テストまたは不変条件の記述がある。

**失敗時の停止挙動**: claim / gate 永続化の実装を止め、`next_action=blocked`。

**attribution**: `operationalization`

**source**: ai-dev-workflow fail-closed PoC 全体（Issue #123 / #128 / #139 の gate 迂回観測を集約）

---

### 5. `verify-before-mutate` — 検証と状態変更の順序

**判定質問**: 独立検証完了前に backup、claim、manifest、復旧可能性を消費・削除していないか。

**passに必要な観測可能な証拠**: 状態変更の順序が仕様またはテストで固定され、「検証成功後にのみ消費」が観測できる。復元成功を独立 manifest 一致前に宣言しない契約がある。

**失敗時の停止挙動**: 状態変更順序に関わる実装を止め、`next_action=blocked`。

**attribution**: `source-derived`

**source**: [ai-dev-workflow Issue #128](https://github.com/kikujizo/ai-dev-workflow/issues/128)（復元成功の早期宣言、検証前 backup 消費）

---

### 6. `provenance-no-fabrication` — provenance 非捏造

**判定質問**: 帰属を直接証明できない状態を、推測や捏造で確定していないか。

**passに必要な観測可能な証拠**: 証明不能時は `unknown` として扱い、owner-only で保全する契約とテスト（または否定例）がある。捏造された provenance フィールドが成功条件に使われない。

**失敗時の停止挙動**: provenance 記録・判定ロジックの実装を止め、`next_action=blocked`。

**attribution**: `source-derived`

**source**: [ai-dev-workflow Issue #147](https://github.com/kikujizo/ai-dev-workflow/issues/147)（provenance を捏造せず unknown として owner-only 保全）

---

### 7. `concurrency-interrupt-residue` — 並行・中断・残留

**判定質問**: 排他、run 固有領域、捕捉可能な終了処理、次回起動時の残留検出が定義されているか。

**passに必要な観測可能な証拠**: 並行実行・中断・クラッシュ後の挙動が仕様またはテストで列挙され、残留 state の検出と fail-closed（または安全な回復）が観測できる。

**失敗時の停止挙動**: 並行・cleanup・残留検出の実装を止め、`next_action=blocked`。

**attribution**: `source-derived`

**source**: [ai-dev-workflow Issue #123](https://github.com/kikujizo/ai-dev-workflow/issues/123)（排他、test hook 隔離、残留検出）

---

### 8. `override-test-hook-isolation` — override / test hook 隔離

**判定質問**: test 専用入口・短命 token 等が通常経路から利用できず、不正指定は fail-closed になるか。

**passに必要な観測可能な証拠**: override / test hook の有効条件が限定され、本番経路からの到達がテストまたは仕様で拒否される。不正指定時の fail-closed が記録されている。

**失敗時の停止挙動**: override / hook 実装を止め、`next_action=blocked`。

**attribution**: `source-derived`

**source**: [ai-dev-workflow Issue #123](https://github.com/kikujizo/ai-dev-workflow/issues/123)（test hook の隔離）

## 判定規則

- 各項目は `pass` / `fail` / `not_applicable` の3値。推測による `pass` は禁止
- 根拠不足・未確認は常に `fail`（`basis=evidence_unavailable`, `next_action=blocked`）
- `not_applicable` は対象機構が当該リスクを持たない**理由**を `basis` に書く（「確認していない」は不可）
- Issue外の設計変更が必要なら `next_action=return_to_pm` と提案5点（`AGENTS.md` 参照）
- 本基準の照合は逐次人間承認や全作業停止を新設しない

## 照合例（静的確認用）

### 例1: `$HOME` 偽装（`identity-root`）

**入力要約**: gate は production ledger を参照。実ホーム解決は `$HOME` 環境変数のみ。

```text
criterion=identity-root
result=fail
basis=HOME偽装でledger正本が差し替わる否定テストなし。evidence_unavailable
next_action=blocked
```

期待: `fail` / `blocked`（実ホーム解決を `$HOME` だけに依存しているため）

---

### 例2: symlink / mountpoint（`path-chain-safety`）

**入力要約**: 保護対象パスは symlink 経由で到達可能。構成要素ごとの検証は未定義。

```text
criterion=path-chain-safety
result=fail
basis=symlink中間要素の拒否手順が仕様・テストにない
next_action=blocked
```

期待: `fail` / `blocked`

---

### 例3: 独立 manifest 前の backup 消費（`verify-before-mutate`）

**入力要約**: 復元処理が独立 manifest 照合前に backup ファイルを削除する。

```text
criterion=verify-before-mutate
result=fail
basis=manifest一致前にbackupを消費する順序がコード上確認された
next_action=blocked
```

期待: `fail` / `blocked`

---

### 例4: provenance 不明（`provenance-no-fabrication`）

**入力要約**: 作成者を直接証明できないレコードに、推測で `user=admin` を付与している。

```text
criterion=provenance-no-fabrication
result=fail
basis=証明不能なのにunknownではなく確定値を書き込んでいる
next_action=blocked
```

期待: `fail` / `blocked`

---

### 例5（`not_applicable` の正当例）: 純メモリ内の一回限り gate

**入力要約**: プロセス内メモリのみの一回限りフラグ。永続 claim・ledger・path 解決なし。

```text
criterion=persistent-claim-bypass
result=not_applicable
basis=永続claimを持たない。別root・state初期化の対象外
next_action=continue
```

期待: 理由付き `not_applicable` / `continue`（未確認を理由にしないこと）
