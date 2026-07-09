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
Related PRs: #7

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

# Decision: ハーネス同期方式を独自同期エンジンから所有権区分 + 既存Action + 手動起動へ切り替える

Date: 2026-07-09
Status: Accepted
Related Issues: #8, #10
Related PRs: #11（正本） / kikujizo/ai-dev-workflow#36（パイロット）

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

---

# Decision: ai-harnessをpublic化してharness-syncのsource読み取りをtoken不要にする

Date: 2026-07-09
Status: Proposed
Related Issues: #14
Related PRs: なし（本PR）

## 決定事項

Issue #14 について、`READ_STRATEGY=public` を採用する。
`ai-harness` を public repo に変更し、`ai-dev-workflow` の `harness-sync` dry-run が token / credential を追加せずに `source_sha=<resolved_sha>` まで到達できるようにする。

本Decisionは、public化前の確認結果と、public化に伴うリスク・取り消し手順を記録する。Step 3 / dispatch / fan-out / schedule / 自動merge は本Decisionの対象外である。

## 背景・課題

Issue #10 では、`ai-dev-workflow` の `harness-sync` を `mode=dry-run`, `source_ref=main` で実行し、`stop_reason=source_ref_unresolved` で安全停止することを確認した。
これは、`GITHUB_TOKEN` だけでは private source repo である `kikujizo/ai-harness` を読めない場合に、PAT / Secrets を追加せず停止できることの実証だった。

Issue #14 では次段階として、source SHA 解決まで到達するための読み取り方針を決める。人間は `READ_STRATEGY=public` を選択し、カテゴリ③ high risk として public化を承認した。

## 採用する方針

- `ai-harness` を public repo にする
- `ai-dev-workflow` の `harness-sync` は token / credential を追加せず、public repo として `ai-harness` を読む
- public化前に、tracked files に secret / token / `.env` / credential / 秘密鍵 / 実在個人情報 / 秘匿情報の実値が含まれないことを機械確認する
- public化後に、`ai-dev-workflow` の `harness-sync` を `mode=dry-run`, `source_ref=main` で再実行し、`source_sha=<resolved_sha>` まで到達するか確認する
- Step 3 / dispatch / fan-out / schedule / 自動merge は後続Issueで扱う

## 採用しない方針 / 却下した代替案

- private維持 + read-only PAT: secret / token / credential の扱い変更としてカテゴリ①に該当し、保管・revoke・漏洩時対応が必要になるため、現段階では採用しない
- private維持 + GitHub App: 権限設計と運用が重く、Issue #14 の「1 repoでsource SHA解決を確認する」粒度を超えるため採用しない
- private維持 + deploy key: key管理が必要でカテゴリ①に該当するため、現段階では採用しない

## 判断理由

- `ai-harness` はハーネス正本であり、複数repoから参照される前提の運用基盤である
- public化により、適用先repo側で読み取りtokenを保管せずに済む
- token / credential を導入しないため、Issue #14 の範囲ではカテゴリ①のcredential運用を避けられる
- public化はリポジトリ設定変更としてカテゴリ③ high risk だが、人間が明示承認済みである

## 公開前確認結果

2026-07-09 に tracked files を対象に公開前チェックを行った。

実行内容:

- tracked file名に `.env` / credential / secret / token / 秘密鍵ファイル名が含まれないか確認
- tracked text に代表的なGitHub token / OpenAI key / AWS key / private key / Slack token / Google API key / email 形式の実値らしき文字列がないか確認
- `API_KEY` / `SECRET` / `TOKEN` / `PASSWORD` / `PRIVATE_KEY` / `CREDENTIAL` / `.env` などのリテラルを確認

結果:

- secret / token / PII / 秘匿情報の実値らしきものは検出されなかった
- 検出された tracked file名は `docs/harness/ops/token-discipline.md` のみで、token運用ルール文書であり実値ではない
- リテラル検出は `.claude/settings.json` の `.env` 読み取りdeny、`AGENTS.md` / `CLAUDE.md` / docs の安全ルールなどであり、実値ではない

注意:

- 機械確認は完全性を保証しない
- public化後に外部へコピーされた情報を完全に取り消すことはできない
- public化後に問題が見つかった場合は、privateへ戻すだけでなく、漏洩した内容の無効化・削除・ローテーションを別途判断する

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ①: 現時点の確認では secret / token / PII / 秘匿情報の実値は検出されていないため非該当。将来検出された場合は該当
- カテゴリ②: なし。追加課金なし
- カテゴリ③: 該当。リポジトリvisibility変更はリポジトリ設定変更であり high risk
- カテゴリ④: 原則直接該当ではない。ただし public化後に外部コピーを完全に取り消せない不可逆性があるため、本Decisionで明記し人間承認を必須とする

## 影響範囲

- `kikujizo/ai-harness` の repository visibility
- `kikujizo/ai-dev-workflow` の `harness-sync` dry-run
- 今後の harness sync 設計
- Issue #14 の source SHA 解決確認

## 取り消し手順

1. GitHub上で `kikujizo/ai-harness` を private に戻す
2. `ai-dev-workflow` の `harness-sync` を再実行し、private化により `stop_reason=source_ref_unresolved` へ戻ることを確認する
3. 本DecisionのStatusを Superseded に変更し、取り消し理由を追記する
4. 必要なら private維持 + 読み取りcredential の別Issueを起票する
5. public化中に秘匿情報が見つかった場合は、該当credentialのrevoke / rotate / 削除を別Issueで扱う

ただし、一度public化された情報が外部にコピーされていない保証はできないため、その点は不可逆として扱う。

## 見直す条件

- public化後の dry-run が `source_sha=<resolved_sha>` まで到達しない場合
- secret / token / PII / 秘匿情報の可能性が後から見つかった場合
- public repo として運用することに支障が出た場合
- private維持 + credential方式へ切り替える必要が出た場合
- Step 3 の main merge dispatch へ進む判断を行う場合

## 次アクション

- [ ] 本Decision Log PRをレビューする
- [ ] 人間がmerge判断する
- [ ] `ai-harness` を public 化する
- [ ] `ai-dev-workflow` の `harness-sync` を `mode=dry-run`, `source_ref=main` で再実行する
- [ ] `source_sha=<resolved_sha>` 到達可否を Issue #14 に記録する

承認: 人間（2026-07-09、Issue #14）— `READ_STRATEGY=public`、カテゴリ③ high risk、公開前確認とDecision Log記録を条件に承認。Step 3 / dispatch / fan-out / schedule / 自動merge は実装しない。
