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
     有効な `HUMAN_APPROVAL_RECORD` 確認後に `APPROVAL_RECORD` + 正式 `route` を確定（`gate` を残さない）。
     deny時は `needs-info risk=high`（`gate`/`route` なし）でPMへ戻し、継続時は新proposalから再開
   - **発効点**（merge・設定反映・実行）: 実装・独立レビュー・技術ゲート完了後、別scopeで
     `APPROVAL_STATE: pending` + `gate=human_approval`。`implementation_start` の承認は流用不可
   - **route=claude-code**: ルート`AGENTS.md`の既存Claude Code例外委譲条件を満たす場合のみ
   - **#133同期Checkpoint**: Issue #133 は #134全面適用の必須同期Checkpoint。#133だけはbootstrap例外として
     #134契約を先行適用可。#133完了前の#133以外の新規高リスク実装開始は `blocked`
     （`approval_contract_sync_pending`）
   - 補助行・`HUMAN_APPROVAL_RECORD: v1`・active record判定の正本はルート`AGENTS.md`のverdict/承認節（本Skillでは再掲しない）
   - 独立レビュアーが確保できない場合は実装へ流さず `blocked` を記録する
6. **レビュアーの同時確定**: 手順5で実装担当を決めたら、ルート`AGENTS.md`「レビュー独立」表で
   独立レビュアーもセットで確定し、PM評価コメント（担当欄）に明示する。レビュアー未確定のままの
   ルーティングは、PRを外部レビュー待ちで停滞させる（実例: ai-dev-workflow PR #79/#81）。
   候補が確保できない場合は独立AIへ再ルーティングするか `blocked` を記録する
   （人間をレビュアー代替にしない）

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

## 制約

- 読むのはIssue本文（または依頼文）とAGENTS.mdだけ。リポジトリ全体をスキャンしない（枠の節約）
- 実装はしない。GitHubへの書き込みもしない（対話モードでは人間が転記する）
- 日本語で出力（コード・識別子は原語）
