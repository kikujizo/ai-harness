# Harness dispatch pilot（Issue #18）

`ai-harness` 側から、適用先 1 repo の `harness-sync` workflow を **人間の手動実行・承認つき**で dispatch する最小経路の検証記録。

関連: Issue #10（target 側手動 dry-run） / Issue #14（source 読み取り public 化） / Issue #16（ownership_violation 解消） / Issue #18（本 Checkpoint）

## 目的

Issue #16 までで `kikujizo/ai-dev-workflow` 側の手動 `harness-sync` dry-run は成功している。
次の最小単位は「正本側（`kikujizo/ai-harness`）から 1 repo へ dry-run を呼び出せること」の確認である。

本パイロットでは次のみを対象とする。

- 対象 repo: `kikujizo/ai-dev-workflow` のみ
- mode: `dry-run` のみ
- 起動: `workflow_dispatch` の手動実行のみ

**スコープ外**: 複数 repo fan-out / schedule / 自動 merge / `mode=create-pr` 自動起動 / `repository_dispatch`

## 承認ゲート（2段階）

| 段階 | 内容 | 状態 |
|---|---|---|
| 1. 実装承認 | `.github/workflows/harness-dispatch.yml` 等の追加・変更 | 2026-07-10 取得済み（Cursor 実装担当） |
| 2. 初回 live dispatch 承認 | merge 後、実際に cross-repo dispatch を実行してよいか | **未実施（人間承認待ち）** |

初回 live dispatch は、PR merge と secret 登録のあと、人間が明示承認してから実行する。

## 実行手順

### 前提

- `kikujizo/ai-harness` に `.github/workflows/harness-dispatch.yml` が merge 済みであること
- 人間が初回 live dispatch を承認していること
- repository secret `HARNESS_DISPATCH_TOKEN` が登録済みであること（下記参照）

### 手順

1. GitHub で `kikujizo/ai-harness` を開く
2. **Actions** → **Harness dispatch pilot** を選択
3. **Run workflow** をクリック
4. 入力はデフォルトのまま実行する
   - `target_repo`: `kikujizo/ai-dev-workflow`
   - `mode`: `dry-run`
   - `source_ref`: `main`
5. 本 repo（`ai-harness`）の run ログで `HARNESS_DISPATCH_RESULT` を確認する
6. `kikujizo/ai-dev-workflow` 側で `harness-sync` run が開始されたことを確認する（下記「target run URL 確認」参照）

## 必要な secret（実値は扱わない）

| 項目 | 内容 |
|---|---|
| Secret 名 | `HARNESS_DISPATCH_TOKEN` |
| 登録場所 | `kikujizo/ai-harness` → Settings → Secrets and variables → Actions |
| 種別 | fine-grained PAT（推奨）または classic PAT |
| 対象 repo | `kikujizo/ai-dev-workflow` のみ |
| 必要権限 | Actions: Read and write |
| 登録者 | **人間のみ**（AI は発行・貼付・commit しない） |

### 人間による GitHub UI 登録手順

1. GitHub → Settings → Developer settings → Personal access tokens から PAT を作成する
2. fine-grained の場合: Repository access を `kikujizo/ai-dev-workflow` のみに限定し、Permissions で Actions を Read and write にする
3. `kikujizo/ai-harness` → Settings → Secrets and variables → Actions → **New repository secret**
4. Name に `HARNESS_DISPATCH_TOKEN`、Value に PAT を貼り付けて保存する
5. secret 値を Issue / PR / ログ / チャットに貼らない

### secret 値を扱わない方針

- workflow・ドキュメント・ログでは secret **名**と必要権限のみ記載する
- 未設定時は `HARNESS_DISPATCH_STOP stop_reason=credential_missing` で停止する
- 権限不足時は `HARNESS_DISPATCH_STOP stop_reason=dispatch_unauthorized` で停止する

## 成功時ログ

### dispatch 側（`ai-harness`）

```text
HARNESS_DISPATCH_RESULT
source_repo=kikujizo/ai-harness
source_ref=main
source_sha=<resolved_sha>
target_repo=kikujizo/ai-dev-workflow
target_workflow=harness-sync
mode=dry-run
dispatch_status=accepted
target_run_url=<取得できた場合のみ>
step3_plus=manual_dispatch_only
fanout_schedule_automerge=not_implemented
```

### 適用先側（`ai-dev-workflow`）の期待ログ

```text
HARNESS_SYNC_DIAG
source_repo=kikujizo/ai-harness
source_ref=main
source_sha=<resolved_sha>
mode=dry-run
ownership_violations=0
stop_reason=none
```

## 安全停止理由

| stop_reason | 意味 |
|---|---|
| `credential_missing` | `HARNESS_DISPATCH_TOKEN` が未設定 |
| `dispatch_unauthorized` | credential の権限不足（HTTP 401/403 等） |
| `target_not_allowed` | allowlist 外の target repo |
| `mode_not_allowed` | `dry-run` 以外の mode |
| `target_workflow_not_found` | target 側に `harness-sync` workflow が見つからない |
| `dispatch_failed` | dispatch API 失敗（HTTP status 等の非秘匿情報のみ記録） |

いずれの場合も secret 値は出力しない。

## target run URL が即時取得できない場合

dispatch API は 204 を返し、run ID を即時返さないことがある。
その場合は次で確認する。

1. `kikujizo/ai-dev-workflow` → **Actions** → **harness-sync**
2. 最新の workflow run を開く（dispatch 実行直後に作成された run）
3. run URL を本ファイルの「live 検証記録」表に追記する

`HARNESS_DISPATCH_RESULT` に `target_run_url` が無くても、`dispatch_status=accepted` まで到達していれば dispatch 自体は受理されている。

## live 検証記録（merge 後・初回 dispatch 承認後に記入）

| 項目 | 値 |
|---|---|
| 実行日時 | （未記入） |
| 実行者 | （未記入） |
| ai-harness run URL | （未記入） |
| target run URL | （未記入） |
| source_sha | （未記入） |
| target 側 stop_reason | （未記入） |
| ownership_violations | （未記入） |
| 初回 live dispatch 承認者 | （未記入） |

## 取り消し手順

1. `kikujizo/ai-harness` の **Harness dispatch pilot** workflow を無効化または削除する
2. repository secret `HARNESS_DISPATCH_TOKEN` を人間が GitHub UI で削除する
3. 開いている dispatch 関連 PR があれば close する
4. `docs/decisions.md` の Issue #18 Decision を Superseded にし、理由を追記する
5. 適用先側の `harness-sync` 手動実行運用へ戻す

## 見直す条件

- dispatch が権限不足で安定しない場合
- credential 権限が過大になる場合
- target 側 run URL を追跡できず人間が確認不能になる場合
- 1 repo dry-run で想定外の同期差分が出た場合
