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

---

# Decision: harness-syncのownership_violation対象を分類し最小安全同期セットを決める

Date: 2026-07-09
Status: Proposed
Related Issues: #14, #16
Related PRs: #17（正本） / kikujizo/ai-dev-workflow#38（パイロット） / #15（前提: public化）

## 決定事項

Issue #14 の dry-run で検出された `.gitignore`, `README.md`, `docs/decisions.md`, `docs/risk-dial.md` はすべて **repo-owned** として保護を継続する。

所有権停止は precommit hook から post-sync 検証（`harness-sync-verify-boundaries.sh`）へ移し、
`.templatesyncignore` + Action の `handle_templatesyncignore` を主防御とする。

Step 3 / dispatch / fan-out / schedule / 自動merge は扱わない。

## 背景・課題

`ai-harness` public 化後、`ai-dev-workflow` の `harness-sync` dry-run は source SHA 解決まで到達したが、
precommit hook が repo-owned 相当4ファイルを `ownership_violation` で停止した。

調査の結果、4ファイルは `.templatesyncignore` に既に載っており、Action は squash merge 後に
`handle_templatesyncignore` で除外する設計だった。precommit はその **前** に実行されるため false positive だった。

## 採用する方針

- 4ファイルは repo-owned のまま `.templatesyncignore` で保護
- precommit hook は所有権停止を行わない（タイミング問題の解消）
- workflow に post-sync 境界検証ステップを追加
- 分類表と保護レイヤ責務を `docs/harness/sync-ownership.md` に追記

## 採用しない方針 / 却下した代替案

- `docs/risk-dial.md` を harness-owned に変更: 適用先の記入済み運用値が上書きされるため却下
- `.templatesyncignore` を `:!` pathspec 形式へ全面書き換え: 現行の個別パス列挙は `git reset` pathspec と整合しており不要
- precommit で repo-owned 検出を維持: false positive の原因であり、post-sync 検証で代替

## 判断理由

- 4ファイルはいずれも「適用先で独自に育つ」性質があり、repo-owned が正しい
- Action ignore は機能している。不足していたのは hook 実行順序に対する理解と検証位置
- 二重防御（ignore + post-sync 検証）で、すり抜けと誤停止の両方を抑える

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ①: なし
- カテゴリ②: なし
- カテゴリ③: 該当。GitHub Actions、precommit hook、所有権表に触れる
- カテゴリ④: なし

## 影響範囲

- `kikujizo/ai-harness` — `docs/harness/sync-ownership.md`, 本 Decision Log
- `kikujizo/ai-dev-workflow` — `harness-sync.yml`, `harness-sync-precommit.sh`, `harness-sync-verify-boundaries.sh`, `docs/harness-sync-pilot.md`

## 取り消し手順

- post-sync 検証ステップと verify スクリプトを削除し、precommit に所有権停止を戻す（非推奨）
- `.templatesyncignore` / 所有権表を merge 前の状態へ revert
- dry-run で `ownership_violation` または `ownership_violations=0` のどちらかを再確認

## 見直す条件

- post-sync 検証後も repo-owned が同期コミットに残る場合（ignore 挙動の再調査）
- harness-owned へ分類変更が必要になった場合（人間承認に戻す）
- Step 3 へ進む判断を行う場合

## 次アクション

- [ ] ChatGPT 要件レビュー・Codex 技術レビューを受ける
- [ ] 人間が #17 / #38 の merge を判断する
- [ ] merge 後 `harness-sync` dry-run を再実行し `ownership_violations=0` を確認
- [ ] 結果を Issue #16 に記録する

承認: 人間（2026-07-09、Issue #16）— カテゴリ③ high risk、実装者 Cursor、Step 3以降 / credential / visibility 変更は実装しない

---

# Decision: 高リスク時の verdict 表記を gate=human_approval に整理

Date: 2026-07-10
Status: Accepted
Related Issues: #21
Related PRs: #23

## 決定事項

高リスク時の人間対応を「人間への作業依頼」ではなく「人間の事前承認ゲート」として表現する。
今後の推奨表記は `PM_VERDICT: approve risk=high gate=human_approval` とする。
既存の `route=human` は deprecated / 互換表記として残し、意味は人間承認ゲートと読む。

## 背景・課題

`route=human` は「人間に作業を依頼する」と誤読されやすかった。
`AGENTS.md` では `route` を実装担当と説明しつつ、高リスクでは `route=human` を承認ゲートと
説明しており、概念が混在していた。Issue #18 等の過去コメントでも同様の誤読リスクがあった。

## 採用する方針

- `route`（担当先）と `gate`（停止条件）を分離する
- `gate=human_approval` を高リスク停止の推奨表記とする
- 人間の役割は承認判断者に限定し、承認後の仕様化・実装・レビュー担当は別途指定する
- 承認前は `gate` のみ、承認後は `route` を付与する運用を明文化する

## 採用しない方針 / 却下した代替案

- `route=human` の即時完全削除: 既存Issue・過去コメント・parser互換のため却下
- parser / CI / GitHub Actions の変更による機械判定追加: Issue #21 スコープ外として却下
- 高リスク分類そのものの再設計: スコープ外として却下

## 判断理由

- `route` と `gate` の分離により、AIモデルが高リスクIssueを「人間に作業させるもの」と誤解しにくくなる
- 人間の役割（承認・merge・最終意思決定）とAIの役割（仕様化・実装・レビュー）の分担が明確になる
- 文書修正のみで `git revert` により完全に戻せる（可逆）
- 人間承認（2026-07-10、Issue #21）を前提に実装する

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`AGENTS.md` / `CLAUDE.md` の verdict 契約変更）。人間の承認: 2026-07-10 取得済み

## 影響範囲

- `AGENTS.md`（verdict 契約・標準フロー節）
- `CLAUDE.md`（絶対ルール）
- `docs/templates.md`（verdict 補足）
- `docs/harness/roles/codex.md`（ルーティング判断表）
- 本 Decision Log
- 後続Checkpoint: parser 対応、`.agents/skills/pm-review/SKILL.md` 例示追加、既存 Issue への読み替えコメント

## 取り消し手順

本決定に伴う各ファイルの変更節を revert し、`route=human` を推奨表記とする旧定義に戻す。
`git revert` で完全に戻せる（可逆）。過去の `risk=high route=human` コメントはそのまま残し、
読み替え方針のみ撤回する。

## 見直す条件

- `gate=human_approval` 導入後も「人間作業依頼」と誤読される運用が定着した場合
- parser / 自動判定処理を更新する後続Checkpointが完了した時点で、互換表記の廃止時期を再検討する

## 次アクション

- [ ] PR を作成し ChatGPT 要件レビュー・Codex 技術レビューを受ける
- [ ] 人間が merge 判断
- [ ] 後続Checkpointで parser 対応・既存 Issue 読み替えコメントを検討

承認: 人間（2026-07-10、Issue #21）

---

# Decision: ai-harnessから1 repoへ手動承認つきでharness-syncをdispatchする

Date: 2026-07-10
Status: Accepted
Related Issues: #10, #14, #16, #18, #26
Related PRs: #24

## 決定事項

`ai-harness` 側から `kikujizo/ai-dev-workflow` の `harness-sync` workflow を、人間の手動実行・承認つきで dispatch する最小経路を採用する。
本段階では `mode=dry-run` のみを対象とし、fan-out / schedule / 自動mergeは採用しない。

高リスク時の表記は `risk=high gate=human_approval` とする（旧 `route=human` は人間の事前承認ゲートの互換読み替え）。

## 背景・課題

Issue #16 で適用先側の dry-run は `ownership_violations=0` / `stop_reason=none` まで成功したが、まだ人間が適用先 repo で直接 `harness-sync` を起動している。
正本更新を各 repo へ配布する構想へ進むには、まず正本側から 1 repo へ安全に呼び出す入口を検証する必要がある。

## 採用する方針

- 1 repo 限定（`kikujizo/ai-dev-workflow` のみ）
- `mode=dry-run` 限定
- `ai-harness` 側の `workflow_dispatch` workflow（`Harness dispatch pilot`）から手動 dispatch
- GitHub REST API / `gh workflow run` 相当で既存 `harness-sync` を起動（`repository_dispatch` は使わない）
- credential は repository secret 名 `HARNESS_DISPATCH_TOKEN` のみ参照。実値は人間が GitHub UI で登録
- merge は人間。初回 live dispatch は実装承認とは別の人間承認を要する

## 採用しない方針 / 却下した代替案

- 複数 repo fan-out: 失敗範囲が広がるため後続 Issue へ分離
- schedule: 意図しない起動を避けるため後続 Issue へ分離
- 自動 merge: 不可逆影響が大きいため後続 Issue へ分離
- `repository_dispatch`: target 側に追加受け口が必要で、既存 `harness-sync` 活用の最小経路から外れる
- GitHub App 化: 恒久運用設計に膨らむため本 Checkpoint では却下
- `GITHUB_TOKEN` のみ: cross-repo workflow dispatch には不足
- environment approval の必須化: 本最小検証では過剰。fan-out / schedule 化前の別 Issue で検討
- credential 実値の Issue / PR / ログ記載: 秘匿情報漏洩につながるため禁止

## 判断理由

- Issue #16 で target 側の dry-run 成功条件は満たされている
- 次に検証すべき最小単位は「正本側から 1 repo へ呼べること」である
- 1 repo / dry-run / 手動承認に制限すれば、失敗時の影響を限定できる
- secret 名・権限・停止理由を文書化すれば、カテゴリ①を管理可能な範囲に抑えられる

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ①: 該当。credential が必要。secret 値は人間のみが扱い、AI は発行・登録・出力しない
- カテゴリ②: なし。追加課金なし
- カテゴリ③: 該当。GitHub Actions / cross-repo dispatch / 同期経路に触れる
- カテゴリ④: なし。dry-run 限定

## 影響範囲

- `kikujizo/ai-harness` — `.github/workflows/harness-dispatch.yml`, `docs/harness/dispatch-pilot.md`
- `kikujizo/ai-dev-workflow` — 既存 `harness-sync` を dispatch 先として利用（改修なし）
- repository secret `HARNESS_DISPATCH_TOKEN`（人間登録）

## 取り消し手順

- 追加した dispatch workflow を無効化または削除する
- dispatch 用 secret `HARNESS_DISPATCH_TOKEN` を人間が GitHub UI で削除する
- 開いている dispatch 関連 PR があれば close する
- 本 Decision の Status を Superseded にし、理由を追記する
- 適用先側の `harness-sync` 手動実行運用へ戻す

## 見直す条件

- dispatch が権限不足で安定しない場合
- credential 権限が過大になる場合
- target 側 run URL を追跡できず人間が確認不能になる場合
- 1 repo dry-run で想定外の同期差分が出た場合

## merge 後の確認結果（初回 live dispatch — 2026-07-10 実施済み）

- [x] `HARNESS_DISPATCH_TOKEN` を人間が GitHub UI で登録した
- [x] `Harness dispatch pilot` を手動実行し `HARNESS_DISPATCH_RESULT` を確認した
- [x] `kikujizo/ai-dev-workflow` 側 `harness-sync` dry-run が開始された
- [x] target 側で `ownership_violations=0` / `stop_reason=none` を確認した
- [x] 結果を `docs/harness/dispatch-pilot.md` の live 検証記録表に追記した（Issue #26）

### 初回 live dispatch 実績（2026-07-10）

| 項目 | 値 |
|---|---|
| merge commit SHA | `a8e099ffe5a15fb6b3f547611a4d442b4fb4d8bd`（PR #24） |
| dispatch_status | `accepted` |
| target run URL | https://github.com/kikujizo/ai-dev-workflow/actions/runs/29071837799 |
| source_sha | `a8e099ffe5a15fb6b3f547611a4d442b4fb4d8bd` |
| ownership_violations | `0` |
| stop_reason | `none` |
| changed_files（target 側 dry-run） | `15` |

既知の後続対応（run は成功）: roles 再貼付警告、Node.js 20 deprecation 警告 — 別 Issue で対応。

## 次アクション

- [x] PR #24 を作成し ChatGPT 要件レビュー・Codex 技術レビューを受ける
- [x] 人間が merge 判断（merge commit: `a8e099f`）
- [x] 初回 live dispatch の人間承認を取得する
- [x] live dispatch を実行し、上記確認結果を記入する（Issue #26 で正本記録へ反映）

承認: 人間（2026-07-10、Issue #18）— `risk=high gate=human_approval`、実装者 Cursor、fan-out / schedule / 自動merge / `mode=create-pr` 自動起動は実装しない。初回 live dispatch は merge 後に別承認。

---

# Decision: AIのGitHub書き込みに記録者のサービス名を明記する

Date: 2026-07-10
Status: Accepted
Related Issues: #25
Related PRs: #28

## 決定事項

全AIが生成してGitHubへ書き込む人間向けテキストの冒頭に、共通テンプレート
`> **記録者**: {AIサービス名}` を必須とする。必須項目はAIサービス名のみとし、
ChatGPT / Codex / Cursor / Claude Code は各自のサービス名のみを記録者とする。
共通原則の正本は `AGENTS.md` とし、各AI固有ルールには具体表記と参照のみを置く。

## 背景・課題

GitHubアカウントがAIサービスごとに分離されていない経路では、author表示だけでは
実際の生成主体を判別できない。Issue #18 dispatch pilot 等で、複数AIが同一アカウント経由で
記録した際の追跡性不足が顕在化した。

## 採用する方針

- 共通テンプレート `> **記録者**: {AIサービス名}` を全AIのGitHub書き込みに適用する
- GitHub authorで判別できる経路も例外にせず、本文に共通テンプレートを置く
- 役割名・モデル名・バージョンは任意補足とする
- 代行・代理時は生成主体を記録者とし、代理役割は記録者行の括弧補足とする
- 人間転記時は生成主体（記録者）と投稿経路（転記者）を別行で明記する
- 本Checkpointでは5ファイル（`AGENTS.md` / `.cursor/rules/ai-workflow.mdc` / `CLAUDE.md` /
  `docs/harness/roles/chatgpt.md` / 本Decision Log）に限定し、
  `docs/harness/roles/codex.md`・`cursor.md`・`claude-code.md` の解説同期は後続Checkpointへ分離する
  （Codexは `AGENTS.md` を直接参照可能なため本Checkpointでは省略）

## 採用しない方針 / 却下した代替案

- Cursor限定ルール: 全AI共通の出力契約として `AGENTS.md` に置く方針へ改訂済みのため却下
- author判別可能経路の例外化: 読む側の一貫性と運用漏れ防止のため却下
- CI/workflowによる自動付与: スコープ外（Issue #25）
- モデル名・バージョンの必須化: 変更され得るため却下

## 判断理由

- 本文だけで生成主体を追跡できれば、GitHubアカウント分離なしでも監査・レビューが可能
- 正本1箇所（`AGENTS.md`）＋各AI固有の具体表記のみ、という既存SSOT設計と整合する
- `git revert` で完全に戻せる（可逆）

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`AGENTS.md` / `CLAUDE.md` / AIエージェント設定配下の変更）。
  人間の承認: 2026-07-10 取得済み（Issue #25）

## 影響範囲

- `AGENTS.md`（記録者明記ルール・テンプレート・サービス名対応表）
- `.cursor/rules/ai-workflow.mdc`（Cursor具体表記）
- `CLAUDE.md`（Claude Code具体表記）
- `docs/harness/roles/chatgpt.md`（ChatGPT貼付用具体表記）
- 本 Decision Log
- 後続Checkpoint: `docs/harness/roles/codex.md`・`cursor.md`・`claude-code.md` の解説同期

## 取り消し手順

1. 本Decision Logエントリを Superseded に変更する
2. 上記影響範囲のファイルから記録者明記関連の追記を revert する
3. `git revert` で完全に戻せる（可逆）

## 見直す条件

- 記録者表記の運用漏れが定着しない場合
- GitHubアカウント分離やbot経路の整備により、本文表記が冗長になった場合

## 次アクション

- [ ] ChatGPT要件レビュー
- [ ] Codex技術レビュー
- [ ] Codex PM判断
- [ ] 人間merge
- [ ] 後続Checkpointで roles 解説3ファイルを同期する

承認: 人間（2026-07-10、Issue #25）— カテゴリ③ high-risk、実装者 Cursor

---

# Decision: コードレビューを2層基準（実測バイナリ＋集合知レンズ）とディスポジション契約で運用する

Date: 2026-07-12
Status: Accepted
Related Issues: #31
Related PRs: #32

## 決定事項

コード変更（diff/PR）の再帰照合を、専用基準2ファイル（第1層 `docs/criteria/code-review-criteria.md` = 実測ミス由来のバイナリゲート／第2層 `docs/criteria/quality-lens.md` = 集合知由来の非ブロック走査レンズ）で運用する。
あわせて `recursive-review` にディスポジション契約を導入する: 全指摘に「今回修正／wontfix（理由記録）／後回し（追跡Issue URL必須）」の三択を強制し、未割り当ての指摘が残る限り approve を禁止する。

## 背景・課題

- `recursive-review` はコード用基準の不在により毎回「暫定基準の自作」で照合しており品質が不安定だった
- kikujizo配下4リポジトリの直近PR実測調査（2026-07-11）で、CI未検証・merge未反映・フォーマット不遵守・重複実装・受け入れ条件の狭い解釈という5パターンの反復ミスを確認した
- 旧手順4の三分類「今回修正/後回し/wontfix候補」は「後回し」に追跡義務がなく、後回しにされた指摘が消滅していた（人間PMの指摘で顕在化）

## 採用する方針

- 第1層: 実測ミスから起こしたバイナリ基準（10項目・観測手順つき・由来URL明記・ブロック権限あり）
- 第2層: 集合知（Google eng-practices・AI生成コード実測研究・OWASP）の蒸留レンズ（非バイナリ・原則非ブロック・発火2回で第1層へ人間承認つき昇格）
- ディスポジション契約（後回しはIssue URL必須・未割り当てapprove禁止）

## 採用しない方針 / 却下した代替案

- OSSチェックリストの丸ごとバイナリ化: 網羅的だが儀式化して使われない（criteria-design-guide「借り物の基準」アンチパターン）ため却下。第2層の「走査レンズ＋発火実績による昇格」で代替
- 実測ミスのみの単層基準: 未知の失敗と品質問題（設計不適切・肥大化・防御の削除）に盲目になるため、単独採用は却下（第1層として採用）
- 全指摘の即時修正の強制: 設計判断を要する・保護領域に触れる・並行作業と衝突する修正の強行はスコープ逸脱と新リスクを生むため却下（「後回し=Issue URL必須」で追跡可能な繰り延べを許可）

## 判断理由

- 基準の質が再帰照合ループの収束品質の天井であり、コードは最頻のレビュー対象なのに専用基準がなかった
- AI実装者の軽微修正コストは人間より大幅に低く、「今回修正を既定・後回しは追跡必須」の経済合理性が成立する
- 実測研究（AI生成PRは欠陥1.7倍・もっともらしいほどレビューが甘くなる）が、既知パターンの機械照合＋未知への走査という2層設計を裏付ける

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`.agents/skills/` 正本および `docs/criteria/` 運用正本の変更）。人間の承認: 2026-07-12 取得済み（Issue #31）
- カテゴリ①②④: なし

## 影響範囲

- `docs/criteria/`（2ファイル追加・README）
- `.agents/skills/recursive-review/SKILL.md`（手順1・手順4）
- `docs/templates.md`（レビュー結果表の対応列）
- 導入先リポジトリ・Vault側の作業版（merge後に正本参照へ置換）

## 取り消し手順

本PR（#32）を `git revert` し、本エントリの Status を Superseded に変更する。完全に戻せる（可逆）。

## 見直す条件

- 較正期間（最初の2〜3回）で人間とAIの判定が繰り返し割れる項目が出た場合（基準の書き直し）
- ディスポジション契約により後回しIssueが濫造されて判断キューが詰まる場合（軽微の既定を見直す）
- 第1層[暫定]項目が6ヶ月×ゼロの場合（剪定判断。実測ミス再発ゼロの確認を条件とする）

## 次アクション

- [ ] ChatGPT要件レビュー・Codex技術レビューを受ける（実装者Claude Codeと独立）
- [ ] 人間がmerge判断
- [ ] merge後、Vault76_Cloud側の作業版を正本参照に置換し、初回較正運用を開始する

承認: 人間（2026-07-12、Issue #31）— カテゴリ③ high-risk、実装者 Claude Code（例外委譲: 起草・成果物保有のため）

