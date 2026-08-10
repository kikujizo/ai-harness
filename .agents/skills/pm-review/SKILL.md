---
name: pm-review
description: GitHub Issueや実装依頼を技術PMとして評価するSkill。Checkpoint検証、受け入れ条件の確認、リスク分類（不可逆4カテゴリ）、実装担当のルーティング判断を行い、PM_VERDICT 1行で締める。「このIssueを評価して」「実装に流していいか見て」で使う。
---

> このSkillの変更・修正は `.agents/skills/pm-review/SKILL.md`（正本）を編集する。リンク先を編集しない。

# pm-review: 対話でのPM評価

## 手順

1. **Checkpoint検証**: 「マージ後にどんな新しい状態に到達するか」を1文で言えるか。言えなければ needs-info で差し戻す
2. **自己完結性**: Issue本文だけで実装判断できるか。受け入れ条件が観測可能な形で5項目以内か
3. **粒度**: ルート`AGENTS.md`のIssue粒度基準を超えていないか。超えるなら分割案を出す
4. **リスク分類**: ルート`AGENTS.md`の不可逆4カテゴリ（リスク分類の正本）への該当だけを high とする。
   **diffの大きさ・ファイル数はリスクではない**
5. **ルーティング**:
   - **通常リスク**: 即route確定（`PM_VERDICT: approve risk=normal route=cursor`）。人間の実装開始approveは不要
   - **高リスク**: 2段階遷移。Codex PMが `PROPOSED_ROUTE` を提示 →
     `APPROVAL_SCOPE: implementation_start` / `APPROVAL_STATE: pending` / `gate=human_approval` で人間approve/denyを待つ
     （承認前のcanonical `PM_VERDICT` に `route` を付けない）→
     有効な `HUMAN_APPROVAL_RECORD: v2` 確認後に `APPROVAL_RECORD` + 正式 `route` を確定（`gate` を残さない）。
     deny時は `needs-info risk=high`（`gate`/`route` なし）でPMへ戻し、継続時は新proposalから再開
   - **発効点**（merge・設定反映・実行）: 実装・独立レビュー・`HIGH_RISK_TECH_GATE: passed` 完了後、別scopeで
     `APPROVAL_STATE: pending` + `gate=human_approval`。`implementation_start` の承認は流用不可
   - **route=claude-code**: ルート`AGENTS.md`の既存Claude Code例外委譲条件を満たす場合のみ
   - **#133同期Checkpoint**: Issue #133 は #134全面適用の必須同期Checkpoint。#133だけはbootstrap例外として
     #134契約を先行適用可。#133完了前の#133以外の新規高リスク実装開始は `blocked`
     （`approval_contract_sync_pending`）
   - 補助行・`HUMAN_APPROVAL_RECORD: v2`・承認源泉/監査分離・active record判定の正本はルート`AGENTS.md`のverdict/承認節
   - 独立レビュアーが確保できない場合は実装へ流さず `blocked` を記録する
6. **レビュアーの同時確定**: 手順5で実装担当を決めたら、ルート`AGENTS.md`「レビュー独立」表で
   独立レビュアーもセットで確定し、PM評価コメント（担当欄）に明示する。レビュアー未確定のままの
   ルーティングは、PRを外部レビュー待ちで停滞させる（実例: ai-dev-workflow PR #79/#81）。
   候補が確保できない場合は独立AIへ再ルーティングするか `blocked` を記録する
   （人間をレビュアー代替にしない）

## v2承認record検証（推測禁止・fail-closed）

高リスク承認判定では推測せず、次を機械的に確認する。いずれか不成立なら該当 `stop_reason` で停止する。

1. **record version**: 新規は `HUMAN_APPROVAL_RECORD: v2` 必須（PR #135 implementation_startのv1移行例外URLのみ除外）
2. **approval_source**: `approval_source=human_explicit_response` のみ有効。それ以外は `approval_record_provenance_unverifiable`
3. **recorded_by**: `ChatGPT|human|claude-code` のみ許可。`codex|cursor` は `approval_record_provenance_unverifiable`（自己承認禁止）
4. **承認源泉**: 人間の明示 `approve|deny` を直接観測していないrecordは無効。推定・流用禁止
5. **GitHub metadata**: author login / `performed_via_github_app` 単独で人間の物理的UI投稿を証明しない
6. **active一意**: 同一 `subject+scope+proposal_url` でactive recordは1件。0件→`approval_record_missing`、2件以上→`approval_record_ambiguous`
7. **scope/proposal/route/HEAD一致**: 不一致→`approval_record_mismatch`。mergeは `subject=pr:#N@<40-hex HEAD>` 固定。HEAD変更後は再利用不可
8. **canonical順序**: approved/deniedは `APPROVAL_SCOPE` → `APPROVAL_RECORD` → `APPROVAL_STATE` → `PM_VERDICT`。`gate=human_approval` は `pending` 専用

## 高リスク技術ゲート（expected-workflow-first）

発効点承認待ちへ進む前に、固定HEADで次を確認する（推測禁止）。

1. base SHAの `.github/workflows/*.yml|yaml` から、当該PRイベントに適用される自動trigger workflowを**先に**期待集合として確定する
2. manual-only `workflow_dispatch` は期待集合に入れない
3. 各期待workflowについて、PR番号・head branch・fixed HEAD・workflow id/name・eventを照合して対応runを特定する
4. `statuses=[]` または `workflow_runs=[]` 単独で「CI未設定」と判断しない
5. `CI_STATUS` を次のいずれかで確定する: `passed|failed|pending|missing|unknown|not-applicable`
6. `failed|pending|missing|unknown` → `HIGH_RISK_TECH_GATE: blocked`
7. 全期待workflow成功かつ非CI検証完了時のみ `HIGH_RISK_TECH_GATE: passed` と `CI_STATUS: passed|not-applicable` を出力する
8. **実装AIは `HIGH_RISK_TECH_GATE: passed` を自己最終確定しない**（Codex PMが最終判定）

## 出力

PM評価コメント（Checkpoint / 実装方針2〜4行 / 受け入れ条件の確認 / リスク / 担当）に続けて、
最終行に必ず `PM_VERDICT:` 1行を置く。必要時は PM_VERDICT 直前に補助行（SUBJECT_VERDICT / ARTIFACT_READINESS）を置ける。
**形式・値の正本はルートの `AGENTS.md` のverdict節**
（このSkillでは再掲しない。形式をここへ写すと、正本の変更時にドリフトする）。

## 責務境界（Issue #51同期）

- **状態確認だけの依頼**（例: 「PR #123の状態を確認して」）は本Skillの対象外。
  `github`（外部plugin）でGitHub一次情報の取得・記録だけ行い終了する。PM評価へ強制遷移しない。
- **本Skillの対象**は Issue・実装依頼のPM評価（例: 「Issue #123を実装へ流せるか評価して」）。
  最終行は `PM_VERDICT:`。
- **依頼の主目的が一意に判定できない**場合は、実装やレビューを開始せず、
  状態確認・PM評価・基準照合のどれを求めているか確認する。
- **Codex PMとして動作中**は `gh-address-comments` を起動しない。修正・commit・push・PR更新へ進まない
  （停止条件の正本: ルート`AGENTS.md`「GitHub作業Skillの責務境界」）。
- **修正が必要と判断したら**、AI PMが許可済みrouteを確定する: 通常リスクは即 `route=cursor`、
  高リスクは人間approve後に `route` を確定（承認前は `PROPOSED_ROUTE` のみ提示）、
  例外時のみClaude Code（`route=claude-code`）、独立AIへの再ルーティング、または `blocked`。
  `route=codex` は新設しない。
- **Codex / Cursorは `HUMAN_APPROVAL_RECORD` を作成しない**（ルート`AGENTS.md`承認節参照）

## 制約

- 読むのはIssue本文（または依頼文）とAGENTS.mdだけ。リポジトリ全体をスキャンしない（枠の節約）
- 実装はしない。GitHubへの書き込みもしない（対話モードでは人間が転記する）
- 日本語で出力（コード・識別子は原語）
