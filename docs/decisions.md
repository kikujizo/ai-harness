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

---

# Decision: Skill追加前のlab運用・一覧同期・minoコア原則SSOTを確定する

Date: 2026-07-13
Status: Accepted
Related Issues: #34, #35
Related PRs: （本PR）

## 決定事項

Skill追加（PR #20 / mino-* / 後続）に先立ち、次を確定する:

1. **lab ティア**: 明示指定時のみ発動。昇格（実案件2回以上・重大事故0件）・停止（重大事故1件）・
   サンセット（8週間使用0回）の共通規則を `AGENTS.md` に置く
2. **Skill一覧**: 固定本数表記を廃止し、`.agents/skills/*/SKILL.md` の実在確認を正とする。
   人間向け境界表は `README.md`、導入確認は `docs/harness/setup.md`
3. **mino コア原則**: `docs/mino-skills/core/mino-core-principles.md` を唯一の規範的正本とし、
   各 mino Skill は参照のみ（全文複製禁止）
4. **ChatGPTアダプタ6本**: リポジトリ常設・自動同期の移送対象外。必要時は都度手動コピー
5. **後続順**: `#35 → #36 → #37 → #38`。`#39` は #35 完了後に #37 / #38 と並行可能

## 背景・課題

Issue #34 で PR #33（mino-* 6本一括）と PR #20（4 Skill）の統合方針を決める必要があった。
README / setup の「7本」固定表記は Skill 追加のたびに不整合を生む。lab 規則の正本、mino コア原則の配置、
ChatGPTアダプタの扱いも未確定だった。

## 採用する方針

- lab 規則の規範的正本を `AGENTS.md`、人間向け境界表を `README.md`、導入確認を `setup.md` に分離
- Skill 本数は固定せず実在ディレクトリを正とする
- mino コア原則は1ファイルSSOT＋各Skill参照（PR #33 案の「各Skillへ複製」は採用しない）
- ChatGPTアダプタは常設移送しない（手動貼付の都度利用）
- 段階導入順を Decision Log と Issue 系列で固定

## 採用しない方針 / 却下した代替案

- **6本一括採用（PR #33そのまま）**: 既存Skillとの発動境界が不明確になり、撤回コストが高いため却下
- **各 mino Skill へのコア原則全文複製**: SSOT Rot と同期漏れを生むため却下。参照のみに統一
- **ChatGPTアダプタ6本の常設移送**: 二重保守・同期漏れ・カテゴリ③の範囲膨張のため却下
- **README に lab 規則の規範を置く**: 実効ルール正本は `AGENTS.md` の原則に反するため却下
- **Skill 本数の固定表記維持**: 追加のたびに陳腐化するため却下

## 判断理由

- 基盤（lab / 一覧 / SSOT / 導入確認）を先に固定すれば、後続 #36〜#38 の Skill 追加が既存ハーネスと矛盾しない
- 参照のみの mino コア原則は、ハーネスの「正本1箇所」設計原則と整合する
- 却下案（一括導入・複製・固定本数）はいずれも SSOT Rot または運用形骸化リスクが高い

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`AGENTS.md` と Skill 運用規則の変更）

## 人間承認（カテゴリ③）

| 項目 | 内容 |
|---|---|
| 承認対象 | Issue #35（本Checkpoint）。統合設計は #34 / 後続 #36〜#39 |
| 承認根拠 | [Issue #34 統合確認 approve](https://github.com/kikujizo/ai-harness/issues/34#issuecomment-4952536622)（全AIレビュー完了後の `INTEGRATION_VERDICT: approve`） |
| 実装指示 | [Issue #35 実装指示書](https://github.com/kikujizo/ai-harness/issues/35#issuecomment-4952560298)（人間の実装依頼後に Codex PM が発行） |
| 実装担当 | Cursor |
| 独立レビュー | ChatGPT（要件）＋ Codex（技術） |
| merge | 人間 |
| 後続順 | `#35 → #36 → #37 → #38`（`#39` は #35 完了後に #37 / #38 と並行可能） |
| Decision Log | 本エントリ（`docs/decisions.md`） |

承認: 人間（2026-07-12〜13、Issue #34 / #35）— カテゴリ③ high-risk、実装者 Cursor

## 影響範囲

- `AGENTS.md`（lab 共通規則）
- `README.md`（Skill ティア・境界・発動優先順位表）
- `docs/harness/setup.md`（実在確認・lab 非発動試験）
- `docs/mino-skills/core/mino-core-principles.md`（新規・SSOT）
- 本 Decision Log
- 後続: Issue #36（PR #20）, #37/#38（mino Skill 本体）, #39（文書・検証・出典）

## 取り消し手順

1. 本 Decision Log エントリの Status を Superseded に変更する
2. 上記影響範囲の変更を `git revert` で戻す
3. README / setup の固定本数表記へ戻す場合は、別Issueで人間承認を取る
4. 既に merge 済みの mino Skill がある場合は、個別に停止・削除判断する（ファイル revert だけでは運用ドリフトが残る）

`git revert` で文書変更は完全に戻せる（可逆）。後続Issueで追加された Skill 本体は別 revert が必要。

## 見直す条件

- lab Skill が一般依頼で誤発動した場合（lab 規則の強化または該当 Skill 停止）
- mino コア原則の参照方式が Skill 単体実行で機能しない場合（#39 で再検討）
- #36 merge 後に core 候補4 Skill と既存7 Skill の境界表を更新する

## 次アクション

- [ ] ChatGPT 要件レビュー
- [ ] Codex 技術レビュー
- [ ] 人間 merge 判断
- [ ] Issue #36（PR #20 / core 候補4 Skill）へ進む

---

# Decision: PR #20の4行動Skillを採用する（merge時ティア確定）

Date: 2026-07-13
Status: Accepted
Related Issues: #36
Related PRs: #20

## 決定事項

PR #20 の4 Skill を `.agents/skills/` に追加する。**merge 時の実効ティアは core / lab の二択のみ**
（`AGENTS.md` 準拠。「core候補」は README 索引用語であり merge 後の発動規則ではない）。

| Skill | 実績・根拠の人間確認 | merge時の実効ティア | 確認済み根拠 / 未確認理由 | 発動範囲 | 停止条件 |
|---|---|---|---|---|---|
| `orchestrate` | **済** | **core** | オーナー申告: Vault で約2ヶ月の実使用（[PR #20 comment](https://github.com/kikujizo/ai-harness/pull/20#issuecomment-4952193038)）。指揮・委譲の型は `docs/harness/ops/orchestration.md` / `token-discipline.md` 参照のみ | 大量・並列・機械走査を含むタスク開始時。委譲機能なし環境では設計案のみ | 委譲未実行を実行済みと報告した場合は即停止 |
| `reframe-question` | **未済** | **lab** | Fable セッション由来の Skill 化のみ。GitHub 上でオーナーが実績・core 直行根拠を確認した記録なし | Skill名または上位ワークフローによる**明示指定時のみ**。指定時は依頼の問い再定義の入口 | 重大事故1件（未承認仕様追加・担当外実装・誤ルーティング）で停止 |
| `assessment-first` | **未済** | **lab** | SKILL 内に 2026-07-08 承認の記述あるが、GitHub 上の確認済み URL を特定できず | Skill名または上位ワークフローによる**明示指定時のみ**。指定時はレビュー指摘・他AI提案への実行前評価報告 | 評価なし修正・無条件横展開走査で停止 |
| `lateral-sweep` | **未済** | **lab** | Fable セッション由来の Skill 化のみ。GitHub 上でオーナーが実績・core 直行根拠を確認した記録なし | Skill名または上位ワークフローによる**明示指定時のみ**。指定時は読み取り・分類・後続 Issue 提案まで | 無承認修正・PR 作成で停止 |

### lab Skill 共通（3 Skill）

`reframe-question` / `assessment-first` / `lateral-sweep` は [AGENTS.md](AGENTS.md)「lab 共通規則」に従う。

1. **発動**: Skill名または上位ワークフローによる明示指定時のみ（description トリガー一致だけでは発動しない）
2. **昇格**: 実案件で2回以上使用し、重大事故0件なら core 昇格候補（Decision Log 記録）
3. **停止**: 重大事故1件で停止し人間判断へ
4. **サンセット**: 8週間0回使用で見送り判断

### core Skill（1 Skill）

`orchestrate` は core として merge 後即時、各 `SKILL.md` の description トリガーに従って発動する。
core 停止後の lab 降格は Decision Log に追記する。

## 背景・課題

Issue #35 完了後、PR #20 の4 Skill を既存ハーネスの承認フロー・正本参照・mino 入口境界と
矛盾なく導入する必要があった。初回 Decision Log は「core候補」「正式 core 昇格保留」「lab ではない」
を併記しており、merge 後の発動規則（core 自動 / lab 明示指定）が確定していなかった
（ChatGPT 要件レビュー・Codex 技術レビュー指摘）。

## 採用する方針

- Skill ごとに実績・根拠の人間確認（済/未済）と merge 時ティア（core/lab）を一意に確定
- `orchestrate` のみ core（GitHub 上のオーナー申告実績あり）
- 根拠未確認の3 Skill は lab（明示指定限定）
- Issue #36 越権防止修正は各 SKILL.md に反映済み（変更なし）

## 採用しない方針 / 却下した代替案

- **4 Skill 一括 core**: 3 Skill は GitHub 上の確認済み根拠なしのため却下
- **4 Skill 一括 lab**: `orchestrate` は Vault 実使用のオーナー申告（GitHub 記録あり）のため core 採用
- **「core候補」のまま merge**: `AGENTS.md` に存在しない中間ティアのため却下
- **`reframe-question` から未導入 mino Skill へ無条件移行**: 未導入 Skill のパス前提を禁止（維持）
- **`lateral-sweep` 内での即時修正 PR**: 無承認修正リスクのため却下（維持）

## 判断理由

- Codex / ChatGPT レビュー: AC#1・#5 未充足の原因は実効ティアの混在。Skill ごとの一意化で解消
- Issue #36 本文「根拠を確認できない Skill は lab へ変更」に従い、確認済み根拠のない Skill を lab に確定
- `orchestrate` のみ [PR #20 comment](https://github.com/kikujizo/ai-harness/pull/20#issuecomment-4952193038) でオーナーが実使用を申告

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`.agents/skills/` 追加）

## 人間承認（カテゴリ③）

| 項目 | 内容 |
|---|---|
| 承認対象 | Issue #36 / PR #20 |
| 実施開始 | [Issue #36 実施開始](https://github.com/kikujizo/ai-harness/issues/36#issuecomment-4952835791) |
| 実装指示 | [Issue #36 実装指示書](https://github.com/kikujizo/ai-harness/issues/36#issuecomment-4952847010) |
| レビュー指摘 | [ChatGPT 要件](https://github.com/kikujizo/ai-harness/pull/20#issuecomment-4952886361) / [Codex 技術](https://github.com/kikujizo/ai-harness/pull/20#issuecomment-4952944704) |
| 実装担当 | Cursor |
| merge | 人間 |

承認: 人間（2026-07-13、Issue #36）— カテゴリ③ high-risk

## 影響範囲

- `.agents/skills/reframe-question/SKILL.md`（lab 明記）
- `.agents/skills/orchestrate/SKILL.md`（core）
- `.agents/skills/assessment-first/SKILL.md`（lab 明記）
- `.agents/skills/lateral-sweep/SKILL.md`（lab 明記）
- 本 Decision Log
- merge 後: `README.md` の導入予定表を人間が更新（本 Issue スコープ外）

## 取り消し手順

1. PR #20 を revert または該当 Skill ディレクトリを削除
2. 本 Decision Log エントリの Status を Superseded に変更
3. lab → core に昇格済みの Skill がある場合は、降格を Decision Log に追記
4. `git revert` でファイル変更は完全に戻せる（可逆）

## 見直す条件

- lab Skill（3件）が実案件2回以上・事故0件で core 昇格候補になった場合（Decision Log 追記）
- いずれかの Skill で重大事故1件（停止・lab 降格判断）
- merge 後 README の表を現存 Skill / lab / core に同期

## 次アクション

- [ ] ChatGPT 要件再レビュー（AC#1・#5 のみ）
- [ ] Codex 技術再レビュー（AC#1・#5 のみ）
- [ ] 人間 merge 判断（PR #20）
- [x] Issue #44でREADME表をmainの実在状態へ同期

---

# Decision: 上流3つのmino Skillをlabとして分離導入する

Date: 2026-07-13
Status: Accepted
Related Issues: #37
Related PRs: #42
Supersedes: なし（PR #33 からの部分移送。PR #33 本体は merge しない）

## 決定事項

PR #33 から上流3 Skill のみを最新 main へ分離導入する。merge 時の実効ティアは **lab 3 Skill すべて**。

| Skill | ティア | 発動 | 主責務 |
|---|---|---|---|
| `mino-socratic-requirements` | **lab** | Skill名または上位ワークフローの明示指定時のみ | 複数ターン要求定義（ソクラテス問答） |
| `mino-context-discovery` | **lab** | 同上 | 用語・境界・ユビキタス言語の整理 |
| `mino-event-storming` | **lab** | 同上 | 業務時系列・イベント・集約候補の洗い出し |

lab 共通規則は [AGENTS.md](../AGENTS.md)「Skills」節（明示指定限定・実案件2回以上で core 昇格候補・重大事故1件で停止・8週間0回で見送り）。

## 背景・課題

Issue #35/#36 完了後、mino Skill 6本（PR #33）を一括導入すると下流Skill・文書資産・ChatGPTアダプタが混在し、入口Skill（`reframe-question` 等）との競合リスクが高い。PR #33 は main 未追従で non-mergeable のため、Issue #37 専用の分離PRで上流3 Skill のみ導入する。

## 採用する方針

- 3 Skill を lab・明示呼び出し限定として `.agents/skills/` に追加
- コア原則全文は [docs/mino-skills/core/mino-core-principles.md](../mino-skills/core/mino-core-principles.md) を参照（各 Skill へ複製しない）
- `reframe-question` との境界: 通常の問い直しは `reframe-question` 優先。複数ターン要求定義は本 Skill（明示指定時）
- `mino-context-discovery` / `mino-event-storming`: 固定順序なし。用語・境界衝突 vs 業務時系列で選択
- 素材不足時は架空の用語・イベント・境界を確定せず、確認事項・保留として分離
- `example-ec.md` は匿名化された参考例のみ（secret・個人情報・外部サービス実メッセージなし）

## 採用しない方針 / 却下した代替案

- **PR #33 をそのまま更新・merge**: main 未追従・6 Skill 混在のため却下
- **3 Skill を core 直行**: GitHub 上の実案件確認根拠なしのため却下（Issue #36 と同基準）
- **一般依頼での自動発動**: lab 規則違反のため却下
- **下流3 Skill・ChatGPTアダプタの同時導入**: Issue #38/#39 スコープのため却下

## 一般依頼での非発動シナリオ試験（3 Skill）

| Skill | 試験入力（明示指定なし） | 期待動作 |
|---|---|---|
| `mino-socratic-requirements` | 「要件を整理して」「この要望の背景を掘り下げて」 | mino Skill を発動しない。必要なら `reframe-question`（lab・明示指定）または通常応答 |
| `mino-context-discovery` | 「用語を整理して」「ドメインを分割して」 | mino Skill を発動しない |
| `mino-event-storming` | 「業務フローを整理して」「誰が何をしたら何が起きるか整理して」 | mino Skill を発動しない |

明示指定例（発動候補）: 「`mino-socratic-requirements` で掘り下げて」「`mino-context-discovery` を使って境界整理」「`mino-event-storming` して」

## 判断理由

- Issue #37 受け入れ条件5項目を満たす最小分割（上流3 Skill + Decision Log）
- Issue #35 の mino コア原則 SSOT と lab 規則に整合
- PR #33 からの部分移送で下流Skill混在を回避

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`.agents/skills/` 追加）

## 人間承認（カテゴリ③）

| 項目 | 内容 |
|---|---|
| 承認対象 | Issue #37 |
| 実装指示 | [Issue #37 実装指示書](https://github.com/kikujizo/ai-harness/issues/37#issuecomment-4953081302) |
| 移送元 | [PR #33](https://github.com/kikujizo/ai-harness/pull/33)（参照のみ・merge しない） |
| 実装担当 | Cursor |
| 独立レビュー | ChatGPT（要件）＋ Codex（技術） |
| merge | 人間 |

承認: 人間（2026-07-13、Issue #37）— `PM_VERDICT: approve risk=high route=cursor`

## 影響範囲

- `.agents/skills/mino-socratic-requirements/SKILL.md`
- `.agents/skills/mino-context-discovery/SKILL.md`
- `.agents/skills/mino-context-discovery/references/example-ec.md`
- `.agents/skills/mino-event-storming/SKILL.md`
- 本 Decision Log
- merge 後: `README.md` の導入予定表更新（本 Issue スコープ外）

## 取り消し手順

1. 本 PR を revert または3 Skill ディレクトリを削除
2. 本 Decision Log エントリの Status を Superseded に変更
3. `git revert` でファイル変更は完全に戻せる（可逆）

## 見直す条件

- 3 Skill が実案件2回以上・事故0件で core 昇格候補になった場合
- いずれかで重大事故1件（lab 規則どおり停止）
- Issue #38/#39 完了後の下流Skill・文書資産導入

## 次アクション

- [ ] ChatGPT 要件レビュー
- [ ] Codex 技術レビュー
- [ ] 人間 merge 判断
- [x] Issue #44でREADME表をmainの実在状態へ同期


---

# Decision: Skill索引とセットアップ案内をmainの実在・凍結状態へ同期する

Date: 2026-07-13
Status: Accepted
Related Issues: #39, #44, #46
Related PRs: #48
Supersedes: なし

## 決定事項

ルートREADME、セットアップ手順、mino Skill案内を、mainに実在するSkillと現在の運用判断へ同期する。実在確認の正本は`.agents/skills/*/SKILL.md`とし、READMEの表は人間向け索引として扱う。

Issue #36・#37・#38由来の10 Skillは現存表へ移す。10という数は今回確認した結果であり、固定本数を規範にしない。

`mino-socratic-requirements`はlabのまま凍結し、通常業務では提案・実行しない。その他のmino Skillはlab・明示指定時のみという既存運用を維持する。

## 同期する状態

| 対象 | 同期後の案内 |
|---|---|
| ルートREADME | 実在する10 Skillを現存表へ移し、未導入表から除外する |
| setup | 一般依頼ではlab非発動、明示指定時のみ候補、凍結済みsocraticは通常業務で非実行とする |
| mino README | socraticの出力・人間評価は観測済み、一般的優位性・再現性は未確認、運用は凍結とする |
| Decision Log | 実在、検証、凍結状態を同期した理由と取り消し手順を残す |

## 背景・課題

Issue #36・#37・#38のmerge後も、ルートREADMEには導入済み10 Skillが未導入として残り、setupには`mino-*`ディレクトリが存在しないという導入前の説明が残っていた。

PR #47でsocraticの1件の問答と人間評価を記録し、labのまま凍結したが、mino READMEは出力生成を未確認とし、6 Skillを同条件で試す旧案内のままだった。

## 採用する方針

- Skill名、ティア、主責務、発動条件は対応する`SKILL.md`と既存Decision Logへ合わせる
- `orchestrate`はcore、Issue #36由来の他3 Skillと6 mino Skillはlabとして表示する
- socraticだけはlab内の凍結例外として、通常業務で非提案・非実行と明示する
- 凍結していないlab Skillは、Skill名または上位ワークフローの明示指定時だけ候補とする
- 表の本数ではなく、`.agents/skills/*/SKILL.md`の実在を正本とする

## 採用しない方針 / 却下した代替案

- **10本を固定本数として規範化する**: Skill追加・削除で再び陳腐化するため却下
- **導入済みSkillを導入予定表へ残す**: mainの実在状態と矛盾するため却下
- **6 mino Skillを同じ条件で試す**: socraticはPR #47で凍結済みのため却下
- **凍結に合わせてSkill本体や発動規則を変更する**: Issue #44は案内同期だけを扱うため却下
- **Issue #40の未移送候補を同時整理する**: 別Checkpointのため却下

## 判断理由

- Issue #44の受け入れ条件5項目を4文書で確認できる
- 実在と人間向け索引を分けることで、将来のSkill追加時も固定本数に依存しない
- 凍結済みsocraticと他のlab Skillを分けることで、通常業務での誤実行を防げる
- すべて文書変更であり、revertにより完全に戻せる

## リスク（不可逆4カテゴリの該当有無）

該当なし。README、セットアップ、mino README、Decision Logの案内同期だけで、Skill本体、権限、課金、データ、パイプラインは変更しない。`risk=normal`。

## 実装・レビュー

| 項目 | 内容 |
|---|---|
| 実装 | Codex（Cursor / Claude Codeのレートリミット中、人間の特別委任による例外実装） |
| 要件レビュー | ChatGPT |
| 独立技術レビュー | 人間。Claude Codeの制限解除後はClaude Codeでも可 |
| merge | 人間 |

## 影響範囲

- `README.md`
- `docs/harness/setup.md`
- `docs/mino-skills/README.md`
- 本Decision Log

## 取り消し手順

本Issueで変更した4文書をrevertする。Skill本体、発動規則、ティアは変更しないため、追加の運用復旧は不要。

## 次アクション

- [ ] ChatGPT要件レビュー
- [ ] 独立技術レビュー
- [ ] 人間merge判断
- [ ] Issue #39の完了判定・close


---

# Decision: mino-socratic-requirementsをlabのまま凍結する

Date: 2026-07-13
Status: Accepted
Related Issues: #39, #46
Related PRs: #47
Supersedes: なし

## 決定事項

`mino-socratic-requirements`はlabのまま凍結し、通常業務では提案・実行しない。Issue #46の初回比較では、10問の問いがすべて最終成果物の要素へ使われ、人間が承認する具体的な問題文へ到達した。

一方、最大10問を1問ずつ、人間回答と確認往復で積み上げる現行方式は人間概算で約15分を要し、その負担は具体化効果に見合わないと人間が判断した。Skill固有の質問選択が通常の対話型仕様化より優れるかは**未確認**である。現行Skillの改修Issueや追加実験を能動的に作らず、類似ニーズが実案件で発生した時だけ軽量案を検討する。

## 観測結果

| 主張 | 区分 | 根拠 |
|---|---|---|
| Skillが10問の対話出力と要求定義書を生成した | **観測済み** | `issue-46-socratic.md` |
| この題材で人間承認済みの問題文へ到達した | **観測済み** | 問題選択・承認ゲート |
| 10問が成果物の要素へ使われた | **観測済み** | 問答と要求定義書の対応 |
| 一括baselineより人間の回答負担が大きい | **観測済み** | 1分20秒に対して人間概算約15分、追加回答0回に対して10問＋確認往復 |
| 通常の対話型仕様化より質問選択が優れる | **未確認** | 同じ質問予算の比較なし |
| 現行方式を実務で再利用したい | **観測済み** | 人間は「再利用したくない」と回答し、少数質問・AI推論・選択式なら再設計候補と補足した |
| 別案件でも効果を再現する | **未確認** | 単一事例のみ |

## 残す・修正する・追加検証する判断

### 残す

- 問題候補をAIが提示し、人間が選ぶ承認ゲート
- 反証によって成功基準や判断条件を補正する考え方
- 今回の実験記録

### 修正

- 今回はSkill本体を変更しない
- 実案件で類似の要求整理ニーズが発生した時だけ、ChatGPTがAI推論・少数質問・選択式の軽量案を提案する
- 人間が軽量案を採用した場合に限り、別Issueで再設計する

### 追加検証

- 能動的には行わない
- 人間が実案件で提示された軽量案を採用し、別Issueを起票した場合だけ検証を判断する

### 見送る

- core昇格
- 一般依頼からの自動発動
- 最大10問を1問ずつ、人間回答と確認往復で積み上げる現行方式の通常業務での提案・実行
- 能動的な改修Issue・追加実験の起票
- 1件だけを根拠にした一般的優位性の主張

## 比較上の限界

- baselineは追加質問なし、Skill条件は10問のため、追加情報量の効果を除去できない
- ソクラテス条件は人間概算で約15分だが開始時刻を記録しておらず、baselineの1分20秒との厳密な所要時間比較はできない
- 通常条件は隔離Codexによる一括仕様化で、Issue本文の「通常のChatGPT仕様化」とサービス表記が異なる
- baselineはGPT-5と記録したが、ソクラテス条件はCodexサービスまでしか記録しておらず、厳密なモデル一致は未確認
- 比較担当とSkill実行系が同一サービスで、同一評価者バイアスがある

## 人間負担・失敗記録

最初の問答は、背景と実験目的を人間へ説明せず質問を開始したため、意図が伝わらず中断した。人間の同意後に説明して質問数を0へ戻し、中断前の回答は正式な10問から除外した。

この事実は、対話開始前の目的共有がないと人間負担と混乱が増えるという運用上の観測として扱う。Skillの有用性を示す正の証拠にはしない。

## リスク（不可逆4カテゴリの該当有無）

該当なし。既存lab Skillを明示実行し、docs 5ファイルへ結果を記録する通常リスク変更である。Skill本体、発動規則、権限、課金、データは変更しない。

## 実装・レビュー

| 項目 | 内容 |
|---|---|
| 実験・文書実装 | Codex（Cursor / Claude Codeのレートリミット中、人間の特別委任による例外実装） |
| 要件レビュー | ChatGPT |
| 独立技術レビュー | 人間。Claude Codeの制限解除後はClaude Codeでも可 |
| merge | 人間 |

## 影響範囲

- `docs/mino-skills/experiments/issue-46-baseline.md`
- `docs/mino-skills/experiments/issue-46-socratic.md`
- `docs/mino-skills/experiments/issue-46-comparison.md`
- `docs/mino-skills/validation-summary.md`
- 本Decision Log

## 取り消し手順

本Issueの3実験文書を削除し、validation-summaryと本Decision Logエントリをrevertする。Skill本体と発動規則は変更していないため、運用復旧は不要。

## 次アクション

- [x] 人間が再利用意向を回答する（現行Skillはlabのまま凍結。類似ニーズ発生時だけ軽量案を提案）
- [ ] ChatGPT要件レビュー
- [ ] 独立技術レビュー
- [ ] 人間merge判断


---

# Decision: mino Skillの有用性を実例と証拠区分で評価する

Date: 2026-07-13
Status: Accepted
Related Issues: #39
Related PRs: #45
Supersedes: PR #33の文書資産にある「6 Skillすべて検証済み」という未移送の状態表記

## 決定事項

公開情報から推定再構築したmino Skillの価値を、出典管理ではなく具体的な試行結果から判断する。結論は**観測済み／仮説／未確認**に区分し、GitHub上の入力・出力・レビューへ遡れない成功主張は観測済みと扱わない。

6 Skillは現時点ですべてlab・明示呼び出し限定のまま維持する。実例を追加してから、Skillごとに残す・修正する・見送る・core昇格を判断する。

## 背景・課題

PR #33には6 Skillと思想文書が含まれていたが、検証結果の多くは移送対象外の記録に依存していた。そのため、文書の「検証済み」という状態だけを移送すると、GitHubから証拠を確認できない成功主張が正本化される。

Issue #37/#38でSkill本体は分離導入された。Issue #39では、元文書をそのまま複製せず、現在GitHubで確認できる証拠から有用性と限界を再判定する。

## 採用する方針

- `docs/mino-skills/README.md`を探索実験の入口とする
- `philosophy.md`で公開情報と再構築上の仮説を分離する
- `validation-summary.md`で試行、結果、失敗、限界を証拠区分付きで記録する
- 出力生成・追跡可能性と、正確性・有用性を別の主張として判定する
- 外部レビューが検出したSkill自身の欠陥を、有用性の証拠として加点しない
- 非公認・推定再構築の説明は誤認防止の短い注記に留める
- 1件の実例から6 Skill全体の有効性を断定しない
- 新しい検証は1 Skillまたは1連携ずつ行う

## 採用しない方針 / 却下した代替案

- **PR #33の文書をそのまま移送する**: 現在状態との矛盾と、GitHubから確認できない検証済み表記を持ち込むため却下
- **検証の生出力を移送する**: Issue #39の対象外であり、要約だけで判断可能にするため却下
- **6 Skillを固定順の標準パイプラインにする**: 単体・連携とも実行証拠が不足しているため却下
- **全Skillを有用または無用と一括判定する**: Skillごとの証拠量が異なるため却下
- **coreへ昇格する**: labの実案件2回以上という条件を満たしていないため却下

## 現時点の判断

| 対象 | 判断 | 出力生成・追跡 | 正確性・有用性 |
|---|---|---|---|
| `mino-context-discovery` | labで残し、有用性を検証する | **観測済み** | **未確認** |
| その他5 Skill | labで残し、単独検証する | **未確認** | **未確認** |

## 既知の欠陥

| 対象 | 欠陥 | 区分 | 有用性評価への扱い |
|---|---|---|---|
| PR #42の上流Skill | 未導入Skillへの幻参照を外部のChatGPT要件レビューが検出 | **観測済み** | 正の証拠にしない |
| PR #43の`mino-contract-driven-coding` | Issueにないエラー仕様を追加しうる欠陥を外部のChatGPT要件レビューが検出 | **観測済み** | 正の証拠にしない |

## リスク（不可逆4カテゴリの該当有無）

該当なし。公開情報とGitHub上の既存資産を使う4文書の変更であり、実効Skill、権限、課金、データは変更しない。

## 実装・レビュー

| 項目 | 内容 |
|---|---|
| 実装担当 | Codex（Cursor / Claude Codeのレートリミット中、人間の明示委任による例外実装） |
| 要件レビュー | ChatGPT |
| 独立レビュー | Claude Code（人間の指名による）または人間 |
| merge | 人間 |

## 影響範囲

- `docs/mino-skills/README.md`
- `docs/mino-skills/philosophy.md`
- `docs/mino-skills/validation-summary.md`
- 本Decision Log

`.agents/`、`AGENTS.md`、Skill本体、発動規則、PR #33は変更しない。

## 取り消し手順

1. 本PRをrevertする
2. 本Decision LogのStatusをSupersededへ変更する
3. Skill本体は変更していないため、運用停止や設定復旧は不要

## 見直す条件

- 各SkillでGitHubから追跡できる実案件が2件以上になった場合
- 通常プロンプトとの比較で有用性が確認できなかった場合
- 出力負担、誤指摘、仕様の過剰補完が実務上の不利益になった場合
- labの重大事故1件または8週間利用なしの条件に該当した場合

## 次アクション

- [x] ChatGPT要件レビュー
- [x] Claude Codeによる独立レビュー
- [ ] 人間merge判断
- [ ] 実例を追加し、有用性を判断できるまでIssue #39をopenで維持
- [ ] Issue #39完了後、PR #33をsuperseded closeするか人間が判断


---

# Decision: 下流3つのmino Skillをlabとして分離導入する

Date: 2026-07-12
Status: Accepted
Related Issues: #38
Related PRs: #43
Supersedes: なし（PR #33 からの部分移送。PR #33 本体は merge しない）

## 決定事項

PR #33 から下流3 Skill のみを最新 main へ分離導入する。merge 時の実効ティアは **lab 3 Skill すべて**。

| Skill | ティア | 発動 | 主責務 |
|---|---|---|---|
| `mino-model-deepening` | **lab** | Skill名または上位ワークフローの明示指定時のみ | 設計Checkpointで既存モデルを問い直す |
| `mino-contract-driven-coding` | **lab** | 同上 | 承認済みIssueから導出した契約でドメイン層実装を支援 |
| `mino-changeability-review` | **lab** | 同上 | 変更容易性の補助所見を生成し、標準レビュー契約へ渡す |

lab 共通規則は [AGENTS.md](../AGENTS.md)「Skills」節（明示指定限定・実案件2回以上で core 昇格候補・重大事故1件で停止・8週間0回で見送り）に従う。

## 背景・課題

Issue #35〜#37 完了後、mino Skill 6本（PR #33）のうち下流3 Skillだけを分離導入する。実装・レビューに近いSkillのため、既存ハーネスの役割分担、Issue正本、標準レビュー契約を上書きしないことを優先する。

## 採用する方針

- 3 Skill を lab・明示呼び出し限定として `.agents/skills/` に追加
- `mino-model-deepening` は設計Checkpoint専用とし、実装中の自動再設計を禁止する
- `mino-contract-driven-coding` の契約表は承認済みIssueから導出する実装契約であり、Issue正本を上書きしない
- `mino-contract-driven-coding` の完全実行は Cursor または人間/Codex PMが明示的に例外委譲した Claude Code に限定する
- ChatGPT / Codex は契約整理・評価までとし、実装コードを生成しない
- 数値化可能な条件だけ数値境界を要求し、根拠のない数値を作らない
- `mino-changeability-review` は補助所見までとし、単独でmerge可否や `REVIEW_VERDICT` を出さない
- 最終レビュー判定は既存 `recursive-review` 契約へ委ねる

## 採用しない方針 / 却下した代替案

- **PR #33 をそのまま更新・merge**: 6 Skill・文書資産・ChatGPTアダプタ混在のため却下
- **3 Skill を core 直行**: 実案件確認根拠が不足しており、lab規則に従うため却下
- **`recursive-review/SKILL.md` の変更**: 既存レビュー契約の正本を変更せず、`mino-changeability-review` 側が従属するため却下
- **契約表を仕様正本にする**: 承認済みIssueを上書きするため却下
- **ChatGPT / Codex に実装コード生成を許す**: 役割分担に反するため却下

## 一般依頼での非発動シナリオ試験（3 Skill）

| Skill | 試験入力（明示指定なし） | 期待動作 |
|---|---|---|
| `mino-model-deepening` | 「モデルを見直して」「設計を深掘りして」 | mino Skill を自動発動しない。必要なら通常の設計確認または明示指定を促す |
| `mino-contract-driven-coding` | 「このIssueを実装して」「契約を守るコードを書いて」 | mino Skill を自動発動しない。実装担当・Issue承認・明示指定がなければ通常実装フローへ従う |
| `mino-changeability-review` | 「レビューして」「変更容易性も見て」 | mino Skill を自動発動しない。明示指定がなければ通常の `recursive-review` を優先する |

明示指定例（発動候補）: 「`mino-model-deepening` を使って」「`mino-contract-driven-coding` で契約表を作って」「`mino-changeability-review` を補助レンズとして使って」。

## 判断理由

- Issue #38 受け入れ条件5項目を満たす最小分割（下流3 Skill + Decision Log）
- Issue #35 の mino コア原則SSOTと lab 規則に整合
- Issue #36 の役割分担と Issue #37 の上流Skill導入後の状態に整合
- 既存 `recursive-review` を変更せず、補助レンズ側の従属で済ませる

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`.agents/skills/` 追加）

## 人間承認（カテゴリ③）

| 項目 | 内容 |
|---|---|
| 承認対象 | Issue #38 |
| 実施開始 | [Issue #38 開始記録](https://github.com/kikujizo/ai-harness/issues/38#issuecomment-4953282246) |
| 移送元 | [PR #33](https://github.com/kikujizo/ai-harness/pull/33)（参照のみ・merge しない） |
| 実装担当 | Codex（人間の明示指示による例外実装。レビュー修正時も Cursor / Claude Code のレートリミットを理由に人間が特別許可） |
| 独立レビュー | ChatGPT（要件）＋ 人間（技術。Codex実装との独立性を確保） |
| merge | 人間 |

承認: 人間（2026-07-12、Issue #38）— カテゴリ③ high-risk、Codex例外実装

追加承認: 人間（2026-07-13、PR #43レビュー修正）— Cursor / Claude Code がレートリミットのため、Codex PMが実装を兼務することを特別許可。Codex自身は主技術レビューを担当しない。

## 影響範囲

- `.agents/skills/mino-model-deepening/SKILL.md`
- `.agents/skills/mino-contract-driven-coding/SKILL.md`
- `.agents/skills/mino-changeability-review/SKILL.md`
- 本 Decision Log
- merge 後: `README.md` の導入予定表更新（本 Issue スコープ外）

## 取り消し手順

1. 本 PR を revert または3 Skill ディレクトリを削除
2. 本 Decision Log エントリの Status を Superseded に変更
3. 既に参照開始した運用がある場合は、各 Skill の停止を Decision Log に追記
4. `git revert` でファイル変更は完全に戻せる（可逆）

## 見直す条件

- 3 Skill が実案件2回以上・事故0件で core 昇格候補になった場合
- いずれかで重大事故1件（lab 規則どおり停止）
- 契約表がIssueを上書きした、非実装担当がコードを書いた、補助レビューが単独判定した場合

## 次アクション

- [ ] ChatGPT 要件再レビュー
- [ ] 人間による独立技術レビュー（Codex実装のため）
- [ ] 人間 merge 判断
- [x] Issue #44でREADME表をmainの実在状態へ同期

---

# Decision: 計画可読性ゲート（plan-gate）をlab Skillとして導入する

Date: 2026-07-14
Status: Accepted
Related Issues: #52
Related PRs: #53

## 決定事項

計画可読性ゲート（最弱読者テスト）を `.agents/skills/plan-gate/SKILL.md` として追加する。
merge時の実効ティアは **lab**（明示指定時のみ。共通規則は `AGENTS.md`「Skills」節）。
`docs/harness/ops/orchestration.md` には判断基準の節のみを置き、手順の正本はSKILL.md（SSOT）。
ループとして `docs/loop-ledger.md` に登録し、4ハードガード（反復=1ラウンド＋条件付き追い復唱1回 /
時間=読者1呼び出し5分・全体15分 / 無進展=過半ズレ継続なら計画分割 / 予算=最下層モデル最大3呼び出し）と
自律度L1を定める。

## 背景・課題

上位モデルが立てた計画は、実行者（下位モデル・別セッション・別AIツール・人間）には曖昧なことがあり、
計画の可読性を実行前に検証するゲートが存在しなかった（Issue #52。研究裏付けはIssue本文に記載）。

## 採用する方針

- 判定でなく復唱: 言い直し＋各ステップ終了時の状態予測・最初の操作・不明語列挙のみを出力させる
- 読者2体並列。一致ズレも欠陥確定とせず、採用前に指揮者が意図と照合して裏取りする
  （`orchestration.md` §4 検証規律と整合）
- 総予算型の上限: 並列2呼び出し＋条件付き追い復唱1回・往復対話禁止
- lab開始（本Log「PR #20の4行動Skillを採用する」の先例: GitHub上の確認済み実績のないSkillはlab直行）。
  実案件2回以上・重大事故0件でcore昇格候補

## 採用しない方針 / 却下した代替案

- **「明確か?」の判定依頼**: 弱いモデルの同意バイアスで形骸化するため却下
- **2体一致＝欠陥確定**: 同一ティア・同一プロンプトの相関誤りを真実扱いするため却下（Codexレビュー指摘）
- **無制限の往復対話**: 指揮者（上位モデル）の文脈を燃やすため却下（総予算型で固定）
- **core直行**: GitHub上の実績がないため却下（PR #20先例に従う）
- **「3ステップ未満は対象外」例外**: Issue #52未承認の追加スコープのため削除（Codexレビュー指摘）

## 判断理由

- アンカーファイル（計画・指示書）の品質が自律ループの品質の天井になる（`docs/harness/loops/principles.md` §4）
- コスト構造上、高いのはラウンド数（上位モデルの文脈）であり、最下層モデルの呼び出しは桁で安い。
  並列読者数を増やしラウンド数を固定する設計が経済合理的

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`.agents/skills/` 追加）。カテゴリ①②④: なし

## 人間承認（カテゴリ③）

| 項目 | 内容 |
|---|---|
| 承認対象 | Issue #52 / PR #53 |
| 発案・実装承認 | 人間の直接指示（2026-07-14）。Claude Codeのレートリミット後、残存2点の修正実装をCodexへ明示委任 |
| 実装担当 | Claude Code（初期実装・前回修正）＋ Codex（残存2点の修正。人間の明示委任） |
| 独立レビュー | ChatGPT（要件）＋ 人間（技術。Codex修正との独立性を確保） |
| merge | 人間 |

承認: 人間（2026-07-14、カテゴリ③の導入方針を採用し、残存修正をCodexへ明示委任）。Statusはmerge前にAcceptedへ確定し、merge判断は別途人間が行う。

## 影響範囲

- `.agents/skills/plan-gate/SKILL.md`（新規・手順の正本）
- `docs/harness/ops/orchestration.md`（§3追加・以降の節番号繰り下げ・§7でlab Skillをグローバル既定から除外）
- `docs/loop-ledger.md`（初回の実登録エントリ。記入例のラベルをL-0に変更して実登録と区別）
- `README.md`（現存Skill表にlab行を追加）
- 本 Decision Log

## 取り消し手順

1. PR #53 を `git revert`（Skill・orchestration.md・台帳・README行・本エントリがすべて戻る）
2. 本エントリの Status を Superseded に変更
3. `git revert` で完全に戻せる（可逆）

## 見直す条件

- 実案件2回以上・重大事故0件 → core昇格候補（Decision Log追記）
- 復唱の形骸化（ズレ検出ゼロの連続）または誤修正の誘発1件 → 停止・見直し
- 8週間使用0回 → サンセット判断（lab共通規則）

## 次アクション

- [ ] ChatGPT 要件再レビュー
- [ ] 人間による独立技術レビュー（Codex修正との独立性を確保）
- [ ] 人間 merge 判断

---

# Decision: assessment-firstのSSOT参照化・語彙統一とlateral-sweepの記載矛盾解消

Date: 2026-07-14
Status: Accepted
Related Issues: #56
Related PRs: #57

## 決定事項

lab Skill 2本の重複・記載矛盾を、吸収・統合ではなく最小トリムで解消する:

1. `assessment-first`: 手順2の原理を `docs/harness/ops/orchestration.md` §4 への参照で扱い、
   対応の宣言語彙を `recursive-review` 手順4のディスポジション三択
   （今回修正 / wontfix（理由記録） / 後回し（追跡Issue URL必須）。正本: 本Log 2026-07-12エントリ）に統一する
2. `lateral-sweep`: descriptionの「正本まで還流する」を本文の実態（還流方針の提示まで）に合わせ、
   還流の実行を `knowledge-reflux`（core）へ引き渡すことを手順4に明記する

両Skillの責務・停止条件・ティア（lab）は変更しない。

## 背景・課題

lab Skillの発動導線・競合調査（2026-07-14、Issue #55コメント）で、`assessment-first` の原理が
正本2箇所（orchestration.md §4・recursive-reviewディスポジション契約）と概念重複し、指摘対応の語彙が
「出す側」と「受ける側」で分裂していること、`lateral-sweep` のdescriptionが本文の禁止事項
（修正・PR作成をしない）と矛盾して大きく謳っていることを検出した。

## 採用する方針

- SSOT設計原則1（同じ定義を複数ファイルに書かない・参照で扱う）による参照化
- ディスポジション語彙の一本化（機械照合可能性の向上）
- description と本文の実態一致（誤発動・誤期待の防止）

## 採用しない方針 / 却下した代替案

- **`assessment-first` の `recursive-review` への吸収**: 実績ゼロのlabをcore正本へ混ぜるのは
  実績ベース昇格の原則に反するため却下。吸収可否は昇格前パフォーマンスレビュー（Issue #55設計）で判断
- **`lateral-sweep` の還流機能の拡張（description側に本文を合わせる）**: knowledge-refluxとの
  責務重複を固定化するため却下
- **`mino-context-discovery` / `mino-event-storming` の統合**: 本Log 2026-07-13エントリで
  意図的に分離済み。Archive棚卸し時に再評価
- **Skillの削除**: オーナー方針（Archive制・削除しないエコシステム、Issue #55で規則化）により却下

## 判断理由

- 語彙の分裂は、指摘を出すAIと受けるAIの間で対応状況の突合を壊す（ディスポジション契約導入の趣旨に反する）
- descriptionは発動判断の一次情報であり、本文より大きく謳う記載は誤期待の温床になる

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`.agents/skills/` 変更）。カテゴリ①②④: なし

## 人間承認（カテゴリ③）

| 項目 | 内容 |
|---|---|
| 承認対象 | Issue #56 |
| 承認根拠 | 人間の直接指示（2026-07-14、Claude Codeセッション「再評価し、修正案で対応実行」） |
| 実装担当 | Claude Code（Skill初期実装）＋ Codex（main取り込み・Decision Log競合解消。人間の明示委任） |
| 独立レビュー | ChatGPT（要件）＋ 人間（技術。Codexの競合解消との独立性を確保） |
| merge | 人間 |

承認: 人間（2026-07-14、セッション指示。merge判断は本PRで別途）

追加承認: 人間（2026-07-14、Claude CodeレートリミットのためCodexを臨時実装担当に明示指定）

## 影響範囲

- `.agents/skills/assessment-first/SKILL.md`（手順2）
- `.agents/skills/lateral-sweep/SKILL.md`（description・手順4）
- 本 Decision Log

## 取り消し手順

1. 本PRを `git revert`
2. 本エントリの Status を Superseded に変更
3. `git revert` で完全に戻せる（可逆）

## 見直す条件

- `assessment-first` の昇格前パフォーマンスレビューで吸収可否を判断する
- ディスポジション三択が指摘受領側の実務に合わない事例が出た場合（語彙の再設計）

## 次アクション

- [x] ChatGPT 要件レビュー
- [x] 人間による独立技術レビュー（Codexの競合解消との独立性を確保）
- [x] 人間 merge 判断（merge時: 本エントリ Status を Accepted に更新）

---

# Decision: lab SkillのAI判断発動・実績評価・Archive制

Date: 2026-07-14
Status: Accepted
Related Issues: #55
Related PRs: #60

## 決定事項

lab Skill の共通規則を、明示指定限定から次の運用へ改める（規範の正本は `AGENTS.md`「Skills」節）:

1. **AI判断発動を許可**する（明示指定に加えて）。AI判断時は発動宣言1行を必須とする
2. **使用後の実績記録**を必須とする（Skill・対象・成果または「有効な追加発見なし」・誤発動/事故の有無）
3. 同一対象に core が使える場合、lab は **core の補助としてのみ** 重ねられ、単独置換を禁止する
4. **凍結**・**Archive** 済み Skill は発動優先順位の対象外とする
5. 実案件 **2回以上** 使用時点で、AI が昇格前パフォーマンスレビューを Issue コメントとして提案し、最終判断は人間が Decision Log に記録する
6. 8週間使用0回等の帰結は削除ではなく **Archive**（`.agents/skills-archive/<name>/`）とし、再稼働手順を定義する
7. 自動削除・自動昇格・自動Archiveは行わない

## 背景・課題

現行の明示指定限定では、人間が Skill 名を名指ししない限り lab が実績を作れず、昇格前にサンセット対象になる構造があった（Issue #55）。
入口を開きつつ、core 乗っ取り・トークン膨張・凍結 Skill の誤発動を防ぐ共通ガードが必要だった。

## 採用する方針

- 規範は `AGENTS.md` のみ。`README.md` はティア・優先順位・Archive の人間向け索引に留め、規範全文を重複定義しない
- 発動優先順位: 明示指定 → core description 一致 → lab の AI 判断
- 削除しないエコシステム（Archive / 再稼働）

## 採用しない方針 / 却下した代替案

- **明示指定限定の維持**: 実績ゼロのままサンセットする構造が残るため却下
- **AI判断の無制限発動**: core 乗っ取りとトークン膨張を防ぐため、宣言・補助限定・エラー時停止を必須とする
- **不要 Skill の削除**: オーナー方針（再稼働可能な Archive 制）により却下
- **自動昇格・自動Archive**: 人間判断と Decision Log を省略するため却下
- **個別 lab Skill 本文の一括改訂**: 本 Checkpoint のスコープ外（後続）

## 判断理由

- 実績ベース昇格と入口のない lab は両立しない。入口を開くなら宣言・記録・補助限定・凍結除外が最小の安全装置になる
- 規範と解説を分離し、SSOT Rot を防ぐ

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`AGENTS.md` という実効ルールの変更）。カテゴリ①②④: なし

## 人間承認（カテゴリ③）

| 項目 | 内容 |
|---|---|
| 承認対象 | Issue #55 |
| 承認根拠 | 人間のカテゴリ③事前承認（2026-07-14）。Codex PM が承認受領を記録 |
| 実装担当 | Cursor（PM判断で確定。`route=cursor`） |
| 独立レビュー | ChatGPT（要件）＋ Codex（技術） |
| merge | 人間 |

承認: 人間（2026-07-14、カテゴリ③事前承認）。Status は本修正段階では Proposed を維持する。
Accepted への更新と次アクション3チェックの完了は、merge 前の最終記録コミットで行う（手順は「次アクション」参照）。

## 影響範囲

- `AGENTS.md`（Skills 節・lab 共通規則）
- `README.md`（ティア表・優先順位・Archive 索引。規範の重複定義なし）
- 本 Decision Log

## 取り消し手順

1. 本PRを `git revert`
2. 本エントリの Status を Superseded に変更
3. lab 発動規則を明示指定限定へ戻す
4. `git revert` で完全に戻せる（可逆）

## 見直す条件

- AI判断発動による誤発動・トークン膨張が許容できない頻度で発生した場合
- Archive / 再稼働の運用コストが想定を超えた場合

## 次アクション

完了順序（merge 操作では文書を書き換えられないため、最終記録は merge 前コミットで確定する）:

1. [x] ChatGPT 要件レビュー
2. [x] Codex 技術レビュー
3. [x] 人間が merge 可否を明示承認
4. [ ] Cursor が最終記録コミットで本エントリ `Status: Accepted` と上記3チェックを更新
5. [ ] Codex が最終記録差分のみ再確認
6. [ ] 人間がその head を merge

---

# Decision: route-pm-modelをlab Skillとして導入する

Date: 2026-07-14
Status: Proposed
Related Issues: #62
Related PRs: #63

## 決定事項

`route-pm-model`をlab Skillとして追加し、Terra・Luna・Solの候補route、安全停止、実績記録を定義する。モデル切替、名前付きカスタムエージェント起動、`.codex/`設定はこのDecisionの対象外とする。

## 背景・課題

Issue #61で確定したモデルルーティング設計を、実装前の安全境界を保ったままlab Skillとして検証可能にする。

## 採用する方針

- 高リスク4カテゴリは`route_candidate=sol`と`gate=human_approval`を出し、不可逆な実行を停止する
- Luna未対応はTerra親へフォールバックし、Sol必須かつ未対応は`ROUTE_BLOCKED`で対象判断を停止する
- 候補route、実行route、親子有無、入出力量概算、成果、fallback、誤ルーティング、停止理由を記録する

## 採用しない方針 / 却下した代替案

- `.codex/`設定・実モデル切替の同時導入: 実行環境変更を含むため後続Checkpointへ分離
- Sol必須判断のTerra代替完了: 安全・品質境界を壊すため却下
- 自動昇格・自動設定変更: 人間判断を省略するため却下

## 判断理由

候補判定と実行機構を分離することで、未対応クライアントでの偽装や高リスク判断の低位経路への代替を防ぐ。

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（AIのルーティング規則として利用されるlab Skillの追加）。カテゴリ①②④はなし。

## 人間承認（カテゴリ③）

| 項目 | 内容 |
|---|---|
| 承認対象 | Issue #62 |
| 承認根拠 | 人間が本対話でCodexへ実装を明示指名し、カテゴリ③実装を承認 |
| 実装担当 | Codex（人間の明示指名による例外） |
| 独立レビュー | ChatGPT（要件）＋ Claude Codeまたは人間（技術） |
| merge | 人間 |

## 影響範囲

- `.agents/skills/route-pm-model/SKILL.md`
- `README.md`
- 本Decision Log

## 取り消し手順

1. 実装PRを`git revert`する
2. 本エントリのStatusを`Superseded`へ変更する
3. `git revert`で完全に戻せる（可逆）

## 見直す条件

- 実案件2回以上の記録が揃い、core昇格・lab継続・Archiveを人間が判断するとき
- 誤ルーティングまたは停止漏れが1件でも起きたとき

## 次アクション

- [ ] ChatGPT要件レビュー
- [ ] Claude Codeまたは人間による独立技術レビュー
- [ ] 人間merge判断

---

# Decision: 名前付きPMエージェントをrepo内設定として定義する

Date: 2026-07-15
Status: Proposed
Related Issues: #64
Related PRs: #65

## 決定事項

プロジェクト配下の`.codex/`に、Terra（`pm_router`）、Luna（`pm_fast_worker`）、Sol（`pm_arbiter`）の名前付きPMエージェントをread-onlyで定義する。設定は候補routeとの対応を記録するだけで、自動ルーティング・自動起動・実起動を有効化しない。

## 背景・課題

Issue #61とIssue #62で確定した候補route、安全停止、実績記録を、後続の手動検証で明示的に参照できるrepo内設定へ接続する。

## 採用する方針

- `.codex/config.toml`で`route_candidate`と3エージェントの対応をコメントとして記録し、子の深さと並行数を1に制限する
- Terra / Medium、Luna / Low、Sol / Highを現行Codexの名前付きエージェントとして定義する
- 全エージェントを`read-only`とし、LunaとSolは1体・1回、再委譲禁止、返却600 token以下とする
- Luna利用不能時はTerra親へフォールバックし、Sol必須時は`ROUTE_BLOCKED`、高リスク時は`gate=human_approval`を維持する

## 採用しない方針 / 却下した代替案

- グローバル`~/.codex/`への定義: repo限定の検証境界を越えるため却下
- 自動ルーティング・自動起動・自動再試行: 実行影響の検証を先取りするため却下
- Sol必須判断のTerra代替完了: 安全境界を壊すため却下

## 判断理由

設定の存在確認と静的検証を、実際の起動・実案件利用から分離することで、利用不能な経路を実行済みと誤認することを防ぐ。

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（AIエージェント設定ディレクトリの追加）。カテゴリ①②④はなし。

## 人間承認（カテゴリ③）

| 項目 | 内容 |
|---|---|
| 承認対象 | Issue #64 |
| 承認根拠 | 人間が本対話でCodexへ実装を明示指名し、カテゴリ③実装を承認 |
| 実装担当 | Codex（人間の明示指名による例外） |
| 独立レビュー | ChatGPT（要件）＋ Claude Codeまたは人間（技術） |
| merge | 人間 |

## 影響範囲

- `.codex/config.toml`
- `.codex/agents/pm_router.toml`
- `.codex/agents/pm_fast_worker.toml`
- `.codex/agents/pm_arbiter.toml`
- 本Decision Log

## 取り消し手順

1. 実装PRを`git revert`する
2. 本エントリのStatusを`Superseded`へ変更する
3. グローバル設定・実案件へ反映していないことを確認する

## 見直す条件

- 人間が別Checkpointとして名前付きエージェントの実起動検証を承認するとき
- 誤設定、実行偽装、または停止漏れが1件でも起きたとき

## 次アクション

- [ ] ChatGPT要件レビュー
- [ ] Claude Codeまたは人間による独立技術レビュー
- [ ] 人間merge判断

---

# Decision: AI→人間の問いかけをクローズド形式に統一する

Date: 2026-07-16
Status: Proposed
Related Issues: #76
Related PRs: #81

## 決定事項

AIから人間への問いかけを、提案・推奨・理由つきのクローズド形式に統一する。`AGENTS.md` に
「人間への問いかけ」節を追加し、オープンクエスチョンのみで終えないことを全エージェント共通の規範とする。

## 背景・課題

承認節には是正時に「問題を整理して選択肢と推奨を人間に提示する」とあるが、問いかけ全般の形式は
未定義だった。そのため「次はどうしますか？」のようなオープンクエスチョンが混在し、人間の判断負荷が
高まる。

## 採用する方針

- `AGENTS.md`「人間への問いかけ」節に5項目の規範と NG/OK 例を置く
- 単一案は承認・否認、複数案は選択肢明示＋1問いかけ1判断に限定する
- 既存承認節の「選択肢と推奨を提示する」と矛盾しない文言にする

## 採用しない方針 / 却下した代替案

- オープンクエスチョンのまま運用継続: 判断負荷が高く、推奨の根拠が伝わりにくいため却下
- 各AI roles への個別重複定義: 実効ルールの正本は `AGENTS.md` の原則に反するため却下（`codex.md` は既存文言と矛盾する場合のみ最小同期）

## 判断理由

- 承認節の「選択肢と推奨」は是正時に限定されており、通常の相談・確認にも同型の形式を広げることで
  人間の判断が速く・一貫して行える
- `git revert` で完全に戻せる（可逆）

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`AGENTS.md` の実効ルール変更）。人間事前承認: 2026-07-16（Issue #76 コメント）

## 影響範囲

- `AGENTS.md`（「人間への問いかけ」節の追加）
- 必要時 `docs/harness/roles/codex.md`（既存文言との矛盾がある場合のみ）
- 本 Decision Log

## 取り消し手順

1. 対象PRを `git revert` する
2. 本エントリの Status を `Superseded` へ変更する

## 見直す条件

- 運用でクローズド形式が過剰に長文化し、可読性を損ねる事例が複数出たとき
- 別の問いかけ規範（例: 緊急時の例外）が必要になったとき

## 次アクション

- [ ] ChatGPT要件レビュー
- [ ] Codex技術レビュー
- [ ] 人間merge判断

---

# Decision: 評価対象と成果物完成度の2軸補助行（SUBJECT_VERDICT / ARTIFACT_READINESS）

Date: 2026-07-16
Status: Accepted
Related Issues: #72, #67
Related PRs: なし（後続PR予定）

## 決定事項

`SUBJECT_VERDICT`（評価対象の状態）と `ARTIFACT_READINESS`（評価成果物の完成度）の2軸を、任意補助行として `AGENTS.md` verdict節に追加する。既存の `PM_VERDICT` / `REVIEW_VERDICT` は正本のまま維持し、補助行は既存verdictの直前に配置する。

## 背景・課題

これまで、評価対象そのものの状態（実装・仕様・設計等）と、その評価を記述した成果物（レビュー報告書・設計書等）の引き渡し可能さが区別されていなかった。このため、中間報告や不完全な成果物を受け渡す際の機械的な判別が困難だった。

## 採用する方針

- 補助行（`SUBJECT_VERDICT` / `ARTIFACT_READINESS`）を既存verdict直前に任意配置として追加する
- 補助行の未定義値は確定verdictとして扱わず修正を求める
- 補助行が既存verdictと矛盾する場合は、既存verdictを正本として停止する

## 採用しない方針 / 却下した代替案

- **PM_VERDICT/REVIEW_VERDICT の値を拡張する案**: 既存のparserや他AIの解釈を壊す（後方互換破壊）ため却下
- **ready を merge 代替（ゲート省略）とする案**: `ARTIFACT_READINESS: ready` は項目の不備がない宣言であり、内容の妥当性や安全性を保証するものではないため、既存ゲートの省略は許可しない

## 判断理由

- 既存のverdict形式を維持することで後方互換性を保てる
- 2軸の導入により、中間報告と確定報告を機械的に区別でき、ワークフローの柔軟性が向上する
- 成果物の「揃っているか（readiness）」と内容の「合格か（verdict）」を分離できる

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`AGENTS.md` の verdict 契約変更）。人間事前承認: 2026-07-16（Issue #72）

## 影響範囲

- `AGENTS.md`（verdict節、verdict補助行の定義追加）
- `docs/templates.md`（評価テンプレートの更新）
- `.agents/skills/pm-review/SKILL.md`（出力例の更新）
- `.agents/skills/recursive-review/SKILL.md`（出力例の更新）
- `docs/decisions.md`（本記録）

## 取り消し手順

本決定に伴う各ファイルの変更節を `git revert` で戻す。補助行は任意項目であるため、既存運用への破壊的影響は限定的であり、可逆である。

## 見直す条件

- 補助行の誤用（例: `ready` 宣言を根拠に人間の事前承認ゲートや独立レビューを省略する等）が発生した場合
- 補助行の導入によりAI間のコミュニケーションに混乱が生じた場合

## 次アクション

- [ ] ChatGPTによる要件レビューを受ける
- [ ] Codexによる技術レビューを受ける
- [ ] 人間による merge 判断

承認: 人間（2026-07-16、Issue #72）

---

# Decision: knowledge-reflux への3層帰属区分（出所管理）の導入

Date: 2026-07-16
Status: Accepted
Related Issues: #73
Related PRs: #84

## 決定事項

knowledge-reflux の昇格パイプラインに、新規昇格知見の出所と解釈層を追跡する **3層帰属区分**
（`source-derived` / `operationalization` / `repository-policy`）を導入する。
昇格提案と criteria 作成テンプレートに `attribution` と `source` の記入欄を追加し、
出所不明の知見は criteria へ昇格させない。

## 背景・課題

inspired-mino-design-skills は知見を外部原典・操作的解釈・リポジトリ固有運用の3層に厳密に区別し、
帰属の誤りを防いでいる。ai-harness の knowledge-reflux は criteria へ昇格する仕組みを持つが、
昇格した知見が「外部由来か・自分たちの解釈か・単なる運用都合か」の区別が残らず、
後から原典に当たり直す・解釈だけ見直すことができなかった。

## 採用する方針

- 3層の定義・選択規則・混在時の分割規則を `docs/harness/knowledge/reflux.md` に正本として記載
- `.agents/skills/knowledge-reflux/SKILL.md` の昇格ゲートに帰属ゲートを追加
- `docs/templates.md` に昇格提案テンプレートと criteria テンプレートの帰属欄を追加
- P3マージ後の新規昇格分から適用（既存 `docs/criteria/`、P1・P2成果物への遡及適用なし）

## 採用しない方針 / 却下した代替案

- **既存 criteria の一括書き換え**: コストと誤帰属リスクが大きく、受け入れ条件のスコープ外のため却下
- **外部原典本文のコピー**: 正本の肥大化とメンテ負荷のため却下。URL・識別可能な出所の参照に留める
- **validator・CI による機械検査の同時導入**: 本Issueのスコープ外。様式導入後に別Issueで検討

## 判断理由

- 3層区分により、後続の criteria・Skill 作成時に「原典を見直す」「解釈だけ見直す」「運用判断を見直す」
  の切り分けが可能になる
- 遡及適用を避けることで、既存成果物への破壊的影響を抑えつつ、新規昇格から規律を適用できる
- 出所不明時の昇格停止により、誤帰属の拡散をゲートで防げる

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`.agents/skills/knowledge-reflux/SKILL.md` の変更）。
  人間事前承認: 2026-07-16（Issue #73 対話承認）

## 影響範囲

- `.agents/skills/knowledge-reflux/SKILL.md`（帰属ゲート・提案様式の追加）
- `docs/harness/knowledge/reflux.md`（3層帰属区分の正本）
- `docs/harness/knowledge/criteria-design-guide.md`（新規昇格分の帰属要件）
- `docs/templates.md`（昇格提案・基準ファイルテンプレート）
- `docs/decisions.md`（本記録）

## 取り消し手順

本決定に伴う5ファイルの変更を `git revert` で戻す。変更自体は可逆。
ただし、誤帰属を参照して作られた後続 criteria・Skill は個別に訂正が必要になる可能性がある
（revert だけでは後続成果物は自動修正されない）。

## 見直す条件

- 帰属欄が形骸化し、記入なしで昇格が進む運用が常態化した場合
- P4 移植時に3層区分が実務上過剰と判明した場合（様式の簡素化を再検討）

## 次アクション

- [ ] ChatGPTによる要件レビューを受ける
- [ ] Codexによる技術レビューを受ける
- [ ] 人間による merge 判断

承認: 人間（2026-07-16、Issue #73）
