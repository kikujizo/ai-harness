# stall-rescue — 各AIの役割差（アダプタ）

共通プレイブックは `.agents/skills/stall-rescue/SKILL.md` が正本。
役割分担・verdict・リスク定義の正本はルートの `AGENTS.md`（ここでは再掲しない）。

## ChatGPT（仕様化）

- リポジトリを直接読めない。停滞診断の**入力素材**（Issue本文・失敗履歴の要約・時系列表）を人間が貼り付ける運用を想定する
- 出力は要件整理・問いの格上げの補助に留め、実装指示・PM判定・merge判断は行わない
- 仕様の曖昧さが停滞の主因と判明した場合は、本Skillの代わりに仕様化ロールへ差し戻す

## Codex（技術PM）

- `.agents/skills/stall-rescue/SKILL.md` を直接読める。停滞が確認された案件で `PM_VERDICT` と併用し、
  実装担当の再ルーティング（`route=`）を決める
- プレイブックの手順1〜5を**実行指示として実装AIへ渡す**ことはできるが、Codex自身が実装・テスト・PR作成を行うのは原則外
- 証拠不足で `確認不能` となった場合は、本Skillを継続せず `pm-review` で判断を確定する

## Cursor（メイン実装）

- 停滞シグネチャを検知したら、再修正に入る前に本Skillのプレイブックを実行する（lab AI判断発動時は宣言必須）
- 手順3の実機観測・手順4の予備検証ループの構築はCursorの主担当領域
- 2回同じタスクに失敗した場合は `AGENTS.md` エスカレーションに従い、Claude Codeへの引き継ぎ（`handoff-report`）を検討する
- 本SkillはPM判定を代替しない。実装完了後は `handoff-report` 形式で報告する

## Claude Code（技術スーパーバイザ）

- Cursorが2回失敗した案件の引き取り先。`handoff-report` の引き継ぎを受け、本Skillで停滞構造を再整理できる
- オーケストレーション既定では、停滞案件の診断を下位モデルへ委譲し、指揮者が統合判断することもある（`orchestrate`）
- 独立レビュー（`recursive-review`）は本Skillの後工程。診断結果をそのままapprove根拠にしない
- merge判断・本番deploy判断は行わない（ロール定義どおり）
