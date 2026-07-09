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

# Decision: ハーネス同期方式を独自同期エンジンから所有権区分 + 既存Action + 手動起動へ切り替える

Date: 2026-07-09
Status: Accepted
Related Issues: #8, #10
Related PRs: なし（実装PR追記予定）

## 決定事項

Issue #8 の当初案である独自 `sync-harness.sh` / manifest / push fan-out を採用せず、所有権区分 + 既存Action + 手動起動の方針へ切り替える。
最初の Checkpoint（Issue #10）では、パイロット適用先 `kikujizo/ai-dev-workflow` で手動 dry-run と手動同期PR作成だけを検証する。

## 背景・課題

`ai-harness` は複数repoへ適用される正本であり、手動diff適用では反映漏れやドリフトが発生しやすい。
当初は独自同期ツールを構想したが、レビューにより、独自manifest、union merge、3-way conflict、push fan-out、横断token管理が過剰に複雑化する懸念が示された。

## 採用する方針

- ファイル所有権を `harness-owned` / `repo-owned` / `init-only` に分ける（正本: `docs/harness/sync-ownership.md`）
- repo-owned / init-only は `.templatesyncignore` で同期対象外にする
- 同期処理は `actions-template-sync` に寄せ、commit SHA 固定で利用する
- 初期段階は `workflow_dispatch` の手動 dry-run / 手動同期PR作成のみ
- merge は人間が行う
- main merge 連動、fan-out、schedule、自動mergeは後続Issueに分ける

## 採用しない方針 / 却下した代替案

- 独自 `sync-harness.sh`: 柔軟だが保守コストが高く、非エンジニア運用で故障時の理解が難しいため却下
- 独自 manifest / `HARNESS_VERSION` による精密同期: 所有権区分と既存Actionで代替可能なため初期段階では却下
- 初手から source main merge fan-out: 最終形としては維持するが、PAT / repository_dispatch / 複数repo波及を伴うため初回Checkpointからは除外
- 初手から schedule / 自動merge: PR滞留、認知負荷、未レビューmergeの危険があるため却下

## 判断理由

- 所有権区分により、マージ仕様そのものを減らせる
- 既存Actionを使うことで独自同期エンジンを保守しなくてよい
- 手動起動にすることで、勝手にPRが溜まる心理的負荷を避けられる
- dry-runにより、安全な現状診断価値を維持できる
- Step 3以降を後続Issueにすることで、高リスク権限変更を段階的に扱える

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ①: 本Checkpointでは扱わない。PAT / Secrets を扱う段階では該当
- カテゴリ②: なし
- カテゴリ③: 該当。CI/CD、AI設定、ハーネス正本同期に触れる。人間承認: 2026-07-09 取得済み（実装者: Cursor）
- カテゴリ④: 本Checkpointではなし。public化は不可逆性があるため別判断として扱う

## 影響範囲

- `ai-harness` の同期方針（`docs/harness/sync-ownership.md`）
- 適用先repoのGitHub Actions（パイロット: `kikujizo/ai-dev-workflow`）
- `.templatesyncignore`
- `.claude/settings.json` / `.claude/settings.local.json` の責務分離
- `docs/harness/roles/` 更新時のChatGPT / Codex再貼付運用

## 取り消し手順

- パイロットrepoの `harness-sync` workflow を無効化または削除する
- `.templatesyncignore` の同期運用を停止する
- 開いている同期PRをcloseする
- 本DecisionのStatusを Superseded にし、取り消し理由を追記する
- Issue #8 当初案または手動diff適用へ戻す場合は、別Issueで再承認する

## 見直す条件

- dry-runで大量削除や所有権違反が出た場合
- `.claude/settings.local.json` の挙動が想定と異なる場合
- actions-template-sync のhookやPR本文出力で必要な警告を出せない場合
- 手動運用でもPR滞留や認知負荷が高い場合
- Step 3 の main merge 連動へ進む判断を行う場合

## 次アクション

- [ ] Issue #10 の範囲で Cursor が実装する
- [ ] ChatGPTが要件レビューする
- [ ] Codexが技術レビューする
- [ ] 人間がmerge判断する

承認: 人間（2026-07-09）— カテゴリ③、実装者 Cursor、Step 3以降 / PAT / Secrets / dispatch / fan-out / schedule / 自動merge は実装しない
