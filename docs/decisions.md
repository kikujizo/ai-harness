# Decision Log

抜本変更・高リスク変更・方針転換の記録。形式は `docs/templates.md` の「Decision Log」に従う。

---

# Decision: カテゴリ③の実装主体の再定義

Date: 2026-07-07
Status: Accepted
Related Issues: #1
Related PRs: #2

## 決定事項

高リスクカテゴリ③（権限・パイプライン・正本・AI設定の変更）を「実装も人間が行う」から
「**人間の事前承認の下でAIが実装できる**」に再定義する。ただし多層防御を必須とする:

1. 人間の事前承認（バッチ可）
2. 実装AIと独立したレビュー（可能なら別系統のモデル）
3. mergeは常に人間
4. Decision Logに記録
5. `.claude/settings.json` のdeny（機械壁）は常設のまま—③実装は人間が承認した専用ブランチ・環境で行う

## 背景・課題

ChatGPT 2次レビュー（PR #2）が、旧定義「カテゴリ③は実装も人間」と本PR（AI実装によるハーネス自己変更）の
矛盾を指摘した（`REVIEW_VERDICT: request-changes risk=high`）。maintainerは非エンジニアであり、
「人間実装」の原則は構造的に成立しない。

## 採用する方針

- 上記5層防御を条件とした「承認付きAI実装」（ChatGPT提示の選択肢③・設計方針の変更）

## 採用しない方針 / 却下した代替案

- 人間実装原則の維持: 非エンジニアmaintainerには実行不能で、ルールが最初から形骸化する
- 例外の黙認（ルール据え置きでAI実装を続ける）: 正本と運用の乖離がSSOT Rotを生む

## 判断理由

- 「人間が実装する」ことの安全価値は、実際には (a)承認 (b)独立検証 (c)merge権限 (d)記録 (e)revert可能性に分解できる。
  この5層を明示的に義務化すれば、実装の手を動かす主体がAIでも防御水準を保てる
- denyの機械壁を常設のまま残すため、AIが通常フローで③のパスに触れることは引き続き不可能

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（本決定自体が正本 `AGENTS.md` のルール変更）。人間の承認: 2026-07-07 取得済み

## 影響範囲

- `AGENTS.md`（リスク分類③・承認節・verdict節）
- `CLAUDE.md`（絶対ルール）
- `docs/harness/ops/routing.md`（自動レーン除外・対話レーン表）
- `docs/harness/roles/claude-code.md`（deny解説）・`docs/harness/roles/codex.md`（ルーティング判断表）
- `.agents/skills/pm-review/SKILL.md`（ルーティング手順）

## 取り消し手順

本決定に伴う各ファイルの変更節をrevertし、「カテゴリ③は実装も人間が行う」の原則に戻す。
`git revert` で完全に戻せる（可逆）。

## 見直す条件

独立レビューをすり抜ける事故（意図しない③変更がmergeされる）が1回でも起きたら、即時に人間実装原則へ回帰する。

## 次アクション

- [x] PR #2 に本決定を反映（**本PR #2自体がこの新ルールの初適用例である**—ブートストラップの記録）

承認: 人間（2026-07-07）

---

# Decision: 標準フロー・役割分担の実運用整合（Claude Code例外化）

Date: 2026-07-08
Status: Accepted
Related Issues: #6
Related PRs: （本PR）

## 決定事項

ハーネス正本の標準フローを、実運用に合わせて **ChatGPT / Codex / Cursor 中心** に再定義する。
Claude Codeは「常駐スーパーバイザ」「Cursor実装の既定レビュアー」から外し、
**例外委譲・フェールセーフ要員**（全役割の代理が可能）として位置づける。

標準フロー:

```
ChatGPT起票 → Codex PM評価 → Cursor実装 → ChatGPTレビュー（要件）→ Codexレビュー（技術）
→ Codex PM判断 → 人間merge
```

## 背景・課題

旧正本は「Claude Code=常駐スーパーバイザでCursorの既定レビュアー」としていたが、
実運用は ChatGPT/Codex による二段レビュー中心である。正本と運用の乖離が SSOT Rot を生んでいた。
先行反映: ai-dev-workflow Issue #33 / PR #34。本決定は ai-harness 正本側への同期。

## 採用する方針

- 標準フローを `AGENTS.md` に明記し、役割分担表・レビュー独立表・エスカレーション基準を整合
- Claude Code参加条件を3パターンに限定（行動不能 / 停滞時のPM例外委譲 / 原因不明・緊急復旧の明示起動）
- `route=claude-code` は例外委譲ルートである旨を verdict 節に注記（機械契約自体は不変）
- 実効ルール（`AGENTS.md`/`CLAUDE.md`）と解説（`docs/harness/roles/`）の区分を明記

## 採用しない方針 / 却下した代替案

- Claude Code常駐の維持: 実運用と乖離し、レビュー担当の二重定義が残る
- Claude Codeの役割完全廃止: 高難易度・行動不能時のフェールセーフが失われる

## 判断理由

- 実運用フローを正本に反映することで、後続AIが `AGENTS.md` だけ読んで正しい役割分担を得られる
- Claude Codeは「失う」のではなく「標準フローの既定担当から外れる」だけ。例外時の代理能力は維持
- verdict契約（`PM_VERDICT`/`REVIEW_VERDICT`）は無傷で流用可能

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`AGENTS.md` / `CLAUDE.md` / roles 正本更新）。人間の承認: 2026-07-08 取得済み（Issue #6 コメント）

## 影響範囲

- `AGENTS.md`（標準フロー・役割分担・レビュー独立・エスカレーション・verdict注記・正本区分）
- `CLAUDE.md`（フェールセーフ化）
- `docs/harness/roles/chatgpt.md`（要件レビュー追加）
- `docs/harness/roles/codex.md`（技術レビュー・ルーティング表）
- `docs/harness/roles/cursor.md`（レビュー担当の注記）
- `docs/harness/roles/claude-code.md`（例外委譲条件）

## 取り消し手順

1. 本Decision Logエントリを `docs/decisions.md` から削除（または Status を Superseded に変更）
2. 上記影響範囲のファイルを、変更前（Claude Code常駐・Cursorレビュアー=Claude Code）の内容に `git revert` で戻す
3. `git revert` で完全に戻せる（可逆）

## 見直す条件

例外委譲なしで Claude Code を常駐レビュアーに戻す必要が生じた場合、または
ChatGPT/Codex 二段レビューが運用上破綻した場合に再検討する。

## 次アクション

- [ ] PR merge（人間判断）
- [x] Claude Codeによる独立レビューは今回に限り人間承認により免除（PR #7 ChatGPTコメント、2026-07-08。ChatGPT要件レビュー＋Codex技術レビューの完了をもってmerge判断へ進む）

承認: 人間（2026-07-08、Issue #6 PMルーティングコメント `route=cursor`）

---

# Decision: Cursor対話レーンへの委譲ラダー薄載荷

Date: 2026-07-09
Status: Accepted
Related Issues: なし（対話レーンの運用改善）
Related PRs: なし（未作成）

## 決定事項

同一ホスト内の委譲ラダー（`docs/harness/ops/orchestration.md`）を Cursor 対話レーンにも適用する。
載荷は最小に留め、次のみを行う:

1. `orchestration.md` に §7（Cursor 相対マッピング）を追加し、表題をホスト共通に広げる
2. `.cursor/rules/orchestration.mdc` を新設（正本参照＋判定基準のみ。全文複製しない）
3. Skill・切替強制Hook・自動委譲ループ・model固定サブエージェントは作らない
4. 同バッチで `.cursor/rules/multi-repo-shell.mdc` を追加（複数repoの Shell 誤操作防止）

## 背景・課題

Grok を Cursor の既定指揮者候補にするにあたり、composer 等の非最上位セッションでの昇格提案と、
最上位セッションでの委譲設計が文書化されていなかった。Claude Code 向け正本は既にあり、
複製や厚化粧の Skill/Hook は再生産になる。また、複数repoを1会話で扱うとき cwd 引き継ぎにより
誤リポジトリへ push/PR した事例があり、薄い安全規則が必要だった。

## 採用する方針

- 正本1節＋薄い Rule。モデル固有名は書かない（相対階層のみ）
- 非最上位は切替を1行提案するだけ（製品に自動切替APIはない）
- ワーカーが上位を advisor 召喚しない（差配は親＝指揮者）
- 複数repoの状態変更は絶対パス必須・直列・push/PR前の remote 照合

## 採用しない方針 / 却下した代替案

- 切替提案専用 Skill、`beforeSubmitPrompt` ブロック Hook
- オーケストレーション全文の Skill 複製、stop 連鎖の自動委譲ループ
- 実績前の `.cursor/agents/` model固定ワーカー量産

## 判断理由

- 足りないのは機能ではなく tier マッピングの薄い載荷
- Fable5 の価値は既に委譲ラダー＋検証規律に吸収済み。新規 Fable Skill は不要
- Shell 誤操作は Rule 数行で再発防止でき、共通スクリプト化は過剰

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`.cursor/rules/`＝AIエージェント設定）。人間承認: 2026-07-09
  （対話「推奨でやってみて」「いっしょにプルリク作って」を本バッチの事前承認とする）

## 影響範囲

- `docs/harness/ops/orchestration.md`
- `docs/harness/ops/routing.md`（参照文言）
- `docs/harness/roles/cursor.md`
- `.cursor/rules/orchestration.mdc`（新規）
- `.cursor/rules/multi-repo-shell.mdc`（新規）

## 取り消し手順

- `orchestration.mdc` / `multi-repo-shell.mdc` を削除し、§7 と関連解説・routing 文言を revert する

## 見直す条件

- 昇格提案がノイズになる／無視される
- 指揮者セッションで委譲が自発されない（§5どおり明示強化が必要）
- 週次で並列物量が常態化し、model固定サブエージェント1個の追加が妥当になったとき
- multi-repo-shell が単一repo作業で過剰拘束になる場合

## 次アクション

- [ ] 独立レビュー（実装AI以外）
- [ ] 人間が merge 判断

承認: 人間（2026-07-09）— カテゴリ③、Skill/Hook量産はしない
