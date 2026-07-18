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
5. **ルーティング**: 通常→Cursor。横断的設計判断・デバッグ主体・Cursor失敗歴→Claude Code。
   カテゴリ③→PMが実装AIと独立レビュアーを同時確定し、可逆工程（実装・テスト・レビュー・PR作成）は
   AIレーンで進める。発効点（merge・設定反映）のみ人間approve/deny（`gate=human_approval`、
   approve後のmerge実行はAI）＋Decision Log記録を必須とする（実装開始の事前承認・人間による実装者指名は不要）。
   独立レビュアーが確保できない場合は実装へ流さず `blocked` を記録する

## 出力

PM評価コメント（Checkpoint / 実装方針2〜4行 / 受け入れ条件の確認 / リスク / 担当）に続けて、
最終行に必ず `PM_VERDICT:` 1行を置く。必要時は PM_VERDICT 直前に補助行（SUBJECT_VERDICT / ARTIFACT_READINESS）を置ける。
**形式・値の正本はルートの `AGENTS.md` のverdict節**
（このSkillでは再掲しない。形式をここへ写すと、正本の変更時にドリフトする）。

## 制約

- 読むのはIssue本文（または依頼文）とAGENTS.mdだけ。リポジトリ全体をスキャンしない（枠の節約）
- 実装はしない。GitHubへの書き込みもしない（対話モードでは人間が転記する）
- 日本語で出力（コード・識別子は原語）
