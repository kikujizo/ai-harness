# Decision Log

抜本変更・高リスク変更・方針転換の記録。形式は `docs/templates.md` の「Decision Log」に従う。

---

# Decision: 高リスク承認状態とPM_VERDICT遷移の正本化（Issue #134）

Date: 2026-08-10
Status: Accepted
Related Issues: #134, #133, #54

## 決定事項

高リスク時の承認状態を `APPROVAL_SCOPE` / `APPROVAL_STATE` / `PROPOSED_ROUTE` / `APPROVAL_RECORD` /
`HUMAN_APPROVAL_RECORD: v2` で正本化し、実装開始承認（`implementation_start`）と発効点承認
（`merge` / `settings_apply` / `execution`）を分離する。`gate=human_approval` は `pending` 専用とし、
人間approve後のみ正式 `route` を確定する。承認の源泉とGitHub監査recordを分離し、
`approval_source=human_explicit_response` / `recorded_by` で源泉を検証する。
高リスク技術ゲートは expected-workflow-first で `CI_STATUS` を判定する。
`AGENTS.md` と `.agents/skills/pm-review/SKILL.md` を同期する。

## 背景・課題

Issue #133 のPM評価で承認scope・verdict遷移の正本化が先行Checkpointとして必要と判断され、本Issue #134を分離した。
旧契約では高リスク時にPMが `route` と `gate=human_approval` を同時付与し、実装開始の事前承認が不要と読めた。
`PROPOSED_ROUTE` 必須条件、active record一意判定、supersedes整合性、#133同期前の移行停止（#133自身の循環）、
deny後の `gate` 残存矛盾が不足していた。

PR #135独立レビュー後のPM再評価で、さらに次の2点（P1/P2）が残存した。

- **P1**: GitHub metadata（`performed_via_github_app` 等）だけでは同一userのWeb UI投稿とAPI/PAT経由を一般に証明できない。
  「人間が物理的に直接投稿したこと」を機械判定条件にする契約は過剰保証になる。
- **P2**: `workflow_runs=[]` / `statuses=[]` だけではCI未設定・未実行・取得漏れを区別できない。

## 採用する方針

- 高リスク `implementation_start`: `PROPOSED_ROUTE` → `pending` + `gate=human_approval` → 人間approve/deny →
  有効v2 record確認後に正式 `route`（`gate` なし）。approved/deniedの固定順序は
  `APPROVAL_SCOPE` → `APPROVAL_RECORD` → `APPROVAL_STATE` → `PM_VERDICT`
- 発効点承認は別scope。`implementation_start` の承認は merge/settings_apply/execution へ流用不可
- **承認源泉と監査attestation分離**: 人間の明示 `approve|deny` が源泉。GitHub recordは転記であり物理投稿の暗号学的証明ではない
- `HUMAN_APPROVAL_RECORD: v2` で subject/scope/proposal_url/proposed_route / `approval_source` / `recorded_by` を固定。
  Codex/Cursorはrecord作成禁止。源泉不明は `approval_record_provenance_unverifiable` でfail-closed
- active record判定（supersedes・一意性）でfail-closed（`approval_record_missing|invalid|mismatch|ambiguous|provenance_unverifiable`）
- deny後は `needs-info risk=high`（gate/routeなし）。同一proposalを再承認待ちに戻さず新proposal必須
- **v1移行例外**: PR #135 implementation_start のみ
  `https://github.com/kikujizo/ai-harness/issues/134#issuecomment-5235497751` を有効維持。新規はv2
- **expected-workflow-first CI**: base SHAから自動PR workflow期待集合を先に確定し、workflowごとに固定HEAD runを照合。
  `CI_STATUS: passed|failed|pending|missing|unknown|not-applicable`。`failed|pending|missing|unknown` は
  `HIGH_RISK_TECH_GATE: blocked`
- 通常リスクは従来どおり即route確定（変更なし）
- Issue #133 を必須同期Checkpointとし、#133だけbootstrap例外で新契約を先行適用
- カテゴリ③の該当条件は不変。旧「事前承認なしで実装できる」運用補足のみ `implementation_start` 契約へ置換

## 採用しない方針 / 却下した代替案

- **GitHub metadataだけで人間の物理的UI投稿を証明する要件**: P1により過剰保証のため却下
- **`statuses=[]` / `workflow_runs=[]` 単独からCI未設定を推定する判定**: P2により区別不能のため却下
- **旧契約で #133 のrouteを人間approve前に確定する案**: #133の責務分離（承認契約の同期）と逆行し、
  bootstrap目的（#133をblockedにしない）を満たさないため却下
- **#134 mergeだけで全面適用とみなす案**: `CLAUDE.md` / `.cursor/rules/` / `docs/harness/roles/*.md` の
  同期が未完了のため却下（#133で同期）
- **verdict parser / CI / state machine の同時実装**: 文書契約先行。機械実装は別Checkpoint
- **実装AIによる `HIGH_RISK_TECH_GATE: passed` 自己最終確定**: 技術ゲート最終判定はCodex PM等の別主体

## 判断理由

- 実装開始approveと発効点approveを分離することで、「誰に実装を任せる提案を承認したか」と
  「merge等を承認したか」を別記録にでき、古い・重複・別proposalの承認流用を防げる
- `gate=human_approval` を `pending` 専用にすることで、deny後やapprove後の状態矛盾を解消
- 承認源泉と監査recordの分離により、GitHub経路の曖昧さを過剰保証せず、AI自己承認をfail-closedできる
- expected-workflow-firstにより、空配列からの誤判定（CI green扱い）を防げる
- active record + supersedes 方式により、追記型監査を維持しつつ訂正・撤回を可能にする
- #133 bootstrap例外により、#133同期完了までの移行停止と#133自身の実装開始を両立

## リスク（不可逆4カテゴリの該当有無）

カテゴリ③に該当（`AGENTS.md` と `.agents/skills/pm-review/SKILL.md` の権限・パイプライン契約変更）。
高リスクのため本Issue自身も人間approve前に実装routeを確定しない。

## 影響範囲

- `AGENTS.md`（承認節・verdict節・承認補助行・高リスク技術ゲート）
- `.agents/skills/pm-review/SKILL.md`（手順5ルーティング・v2検証・expected-workflow-first）
- 本 Decision Log
- 後続必須Checkpoint: Issue #133（`CLAUDE.md` / `.cursor/rules/` / `docs/harness/roles/*.md` 同期）

## 取り消し手順

1. 本Issueの実装PRを `git revert`
2. `AGENTS.md` / `pm-review` を旧verdict契約へ戻す
3. 本 Decision Log エントリの Status を `Superseded` に更新
4. #133が同期済みなら、正本revert後に#133由来同期差分も戻す
5. 誤承認で外部操作が発生済みなら別Issueで影響調査

## 見直す条件

- Issue #133 がmerge/完了し同期完了記録が確認できた時点で、通常の高リスク案件へ全面適用を開始
- #133が中止・変更された場合は全面適用へ進まず、Codex PMへ戻す
- 将来、暗号学的human-origin証明や機械parserが必要になった場合は本契約を入力仕様として別Checkpointで実装
- PR #135のv1移行例外recordは新proposal/発効点へ流用しない

## 次アクション

- [ ] Issue #133 で `CLAUDE.md` / `.cursor/rules/` / `docs/harness/roles/*.md` を同期
- [ ] #133完了後、#134契約の全面適用開始を記録

---

# Decision: GitHub作業Skillの責務境界とCodex PM非実装停止条件

Date: 2026-07-19
Status: Accepted
Related Issues: #50, #51
Related PRs: #95

## 決定事項

Issue #50の実測に基づき、GitHub作業で頻用する3 Skillの責務境界を `AGENTS.md` に正本化する。
あわせて、Codex PMが `gh-address-comments` を発動せず、修正・commit・pushへ進まない停止条件を
`AGENTS.md` と `docs/harness/roles/codex.md` に同期する。外部plugin Skill（`github`・`gh-address-comments`）の
本文は変更しない。

| Skill | 責務 |
|---|---|
| `github`（外部plugin） | GitHub一次情報の取得・記録のみ |
| `pm-review` | Issue・実装依頼のPM評価（`PM_VERDICT`） |
| `recursive-review` | PR・差分・文書の基準照合（`REVIEW_VERDICT`） |

- 状態確認・記録だけでは評価Skillへ強制遷移しない。
- 実装が必要な場合、AI PMは通常 `route=cursor`、例外時のみ `route=claude-code` へ割り当てる
  （`route=codex` は新設しない）。

## 背景・課題

Issue #50で、Codex PMがレビュー確認から `gh-address-comments` 経由で越権実装へ進むリスクと、
`github` / `pm-review` / `recursive-review` の責務混在が観測された。正本に境界がなく、
PMが状態確認だけの依頼でも評価Skillへ遷移したり、実装Skillを起動したりする余地があった。

## 採用する方針

- 3 Skillの責務表とルーティング規則を `AGENTS.md` に置く（実効正本）
- Codex PMの `gh-address-comments` 禁止を機械的に明記（`AGENTS.md` + `codex.md`）
- 実装routeは現行verdict契約どおり `cursor` / `claude-code` のみ

## 採用しない方針 / 却下した代替案

- **外部plugin Skill本文の変更**: リポジトリ管理外のため却下。上位ルール（`AGENTS.md`）で停止させる
- **`route=codex` の新設**: verdict正本・機械検証の変更が必要でCheckpoint Aの範囲を超えるため却下
- **人間による実装者指名の維持**: 2026-07-18「責務境界の再定義」で廃止済みのため却下
- **状態確認でも評価Skillを必須化**: トークン浪費と責務混在を招くため却下

## 判断理由

- Issue #50の気づき（`recursive-review` は低頻度高アウトカム、`github` は基盤、`gh-address-comments` はPMと衝突）
  を実効ルールへ落とし込む最小変更
- 外部pluginを変えずに `AGENTS.md` で越権を止められる（カテゴリ③の多層防御の一層）
- 3ファイル・半日のCheckpoint Aで観測可能な受け入れ条件を満たせる

## リスク（不可逆4カテゴリの該当有無）

カテゴリ③に該当（`AGENTS.md` と Codexロール定義の変更）。
可逆工程（実装・テスト・レビュー・PR更新）はAIレーンで進める。実装開始の事前承認と人間による実装者指名は不要。
AI PMが実装担当と独立レビュアーを確定する。発効点（merge・設定反映）のみ人間approve/denyを必須とし、
approve後のmergeはAIが実行する（PR #93 merge 後ルール）。

## レビュー記録

| 項目 | 結果 | 証跡 |
|---|---|---|
| merge | mainへmerge済み（2026-07-19 02:42:29 UTC）。merge commit: `1bc08bee316ac016496d30593fcc2da96b6c045b` | PR #95 |
| ChatGPT要件レビュー | 要件上の変更要求は解消（修正後HEAD `1d8e14163f65241e2b58196583b0eced029f272c`） | https://github.com/kikujizo/ai-harness/pull/95#issuecomment-5013858459 |
| Codex独立技術・事後監査 | `REVIEW_VERDICT: request-changes risk=high`（P1: Decision Logの状態と完了記録をmainの実態へ整合させる必要） | https://github.com/kikujizo/ai-harness/pull/95#issuecomment-5013893412 |
| CI | **未報告・成功確認不能**（PR #95 head `1d8e14163f65241e2b58196583b0eced029f272c` のcheck run 0件） | 監査注記 |
| 発効点の人間approve/deny | **未確認**（merge済みだが確認可能な承認証跡なし） | 監査注記 |

## 影響範囲

- `AGENTS.md`（「GitHub作業Skillの責務境界」節の追加）
- `docs/harness/roles/codex.md`（使い分け表・`gh-address-comments` 停止条件）
- 本 Decision Log
- Checkpoint B（別Issue）: `.agents/skills/pm-review/SKILL.md`、`.agents/skills/recursive-review/SKILL.md`、`docs/harness/setup.md`

## 取り消し手順

本Issueの3ファイルを同一PR単位で `git revert` する。適用先へ同期済みなら、正本revert後に
各適用先へ再同期する。外部plugin Skillは変更していないため、revert対象外。

## 見直す条件

- Codex PMが `gh-address-comments` を起動する越権事故が1件でも起きた場合（停止条件の強化を検討）
- `github` / `pm-review` / `recursive-review` の責務が再び混在した場合（Checkpoint BでSkill本文を同期）

## 次アクション

- ChatGPT要件レビュー: 完了。要件上の変更要求は解消済み
- Codex独立技術レビュー: 事後監査として実施。`request-changes` — Decision Log整合性の是正を要求し、Issue #96で対応
- 発効点の人間approve/deny: **未確認**。PR #95はmerge済みだが、確認可能な承認証跡はない
- merge: 実施済み。ただし、発効点の人間approve/denyは未確認

---

# Decision: pm-review / recursive-review への運用実測教訓の反映（レビュアー同時確定・独立性・AI再ルーティング）

Date: 2026-07-19
Status: Accepted
Related Issues: #92
Related PRs: #88

## 決定事項

頻用Skill `pm-review` / `recursive-review` に、運用実測で判明した次の教訓を正本へ反映する。

- **pm-review**: 実装担当決定時に、ルート`AGENTS.md`「レビュー独立」表に従い独立レビュアーも同時確定する。
  候補不在時は独立AIへ再ルーティングまたは `blocked`（人間をレビュアー代替にしない）
- **recursive-review**: 自己実装物の主レビュー禁止、証拠の帰属確認、書き込み不能時の独立AI再ルーティング、
  前回レビュー復元不能時の無進展判定、委譲時の復唱済み基準埋め込みを手順に明記する
- カテゴリ③の可逆工程はAIレーンで進め、発効点（merge・設定反映）のみ人間approve/deny。
  approve後のmerge実行はAI

## 採用理由

- 独立レビュアー未確定によるPR停滞（ai-dev-workflow PR #79/#81）を、PM評価段階で防ぐ
- 自己レビュー・帰属反転（PR #45）・下位モデルへの基準未伝達（2026-07-17実測）をSkill手順で塞ぐ
- PR #94 で発効した「人間を技術代替にしない」境界と整合させる（旧PR #88の人間フォールバック記述は採用しない）

## 却下した代替案

- **旧PR #88のまま取り込む**（カテゴリ③で人間が実装者指名・人間merge）: PR #93/#94 の正本と矛盾するため却下
- **人間へのIssue化依頼・人間への無進展返却**: 判断専任PMの体制目的に反するため却下。独立AI再ルーティングまたは `blocked` に統一

## 影響範囲

- `.agents/skills/pm-review/SKILL.md`（手順6追加）
- `.agents/skills/recursive-review/SKILL.md`（独立性・帰属・再ルーティング・無進展・委譲基準）
- 本 Decision Log

## 取り消し手順

PR #88 を `git revert` する。下流同期済みの場合は、正本revert後の差分を各導入先へ同期する。

## リスク（不可逆4カテゴリの該当有無）

カテゴリ③（`.agents/skills/` の正本改定）。発効点で人間 approve/deny 後に AI が merge 実行する。

## 独立レビュー予定

- 要件レビュー: ChatGPT
- 技術レビュー: Codex

---

# Decision: 技術レビュー・復旧の人間フォールバック廃止（独立AI再ルート / blocked）

Date: 2026-07-19
Status: Accepted
Related Issues: #51
Related PRs: #94

## 決定事項

技術レビュー・技術復旧・ルーティング停滞において、人間をAIの代替要員にしない。

- 独立レビュアー不足時は、人間をレビュアー代替にせず、AI PMが独立AIへ再ルーティングする。
  候補がなければ `blocked` を記録し、実装へ流さない
- 2回失敗時のエスカレーションも同様（Cursor差し戻し・Claude Code例外委譲・独立AI再ルーティング。
  候補がなければ `blocked`。人間を技術復旧の代替にしない）
- 人間の役割は変更しない: 意図入力と不可逆4カテゴリの**発効点**（merge・設定反映・実行の直前）での
  approve/deny のみ
- lab Skill の昇格・停止・Archive の日常判断は AI PM が確定。カテゴリ③に該当する正本変更の発効点のみ人間 approve/deny

## 採用理由

Issue #51 の裁定（`PM_VERDICT: approve risk=high route=cursor gate=human_approval`）に沿い、
「人間は判断専任PM」体制を技術レーンまで一貫させる。人間フォールバックはボトルネック化し、
レビュー独立性も損なう。

## 却下した代替案

- **人間フォールバック維持**（「不可なら人間」「または人間」）: 人間が技術レビュアー・復旧担当の
  代替要員になり、判断専任PMの体制目的に反するため却下

## 影響範囲

- `AGENTS.md`（エスカレーション・レビュー独立表・人間への問いかけ・自動マージG1/G2・lab Skill節）
- `CLAUDE.md`
- `docs/harness/roles/claude-code.md` / `codex.md`
- `.agents/skills/pm-review/SKILL.md`（`blocked` 追記）
- 本 Decision Log

## 取り消し手順

本Decisionを含むPRを `git revert` する。旧文言（人間フォールバック）へ戻す場合は
`docs/decisions.md` に Supersedes 記録を追記する。

## リスク（不可逆4カテゴリの該当有無）

カテゴリ③に該当（`AGENTS.md`・`CLAUDE.md`・roles・pm-review の正本改定）。
発効点で人間 approve/deny 後に AI が merge 実行する（PR #93 merge 後ルール）。

## 独立レビュー予定

- 要件レビュー: ChatGPT
- 技術レビュー: Codex

---

# Decision: 責務境界の再定義（人間ゲートを不可逆操作の発効点へ移動）

Date: 2026-07-18
Status: Accepted
Related Issues: #51（裁定記録コメントあり）、#29 #40 #54 #67 #85 #86 #92（同境界の適用対象）
Related PRs: 本Decisionを含むPR、#88（本境界への追従が必要）

## 決定事項

人間とAIの責務境界を次のとおり再定義する。

- **人間の判断は「不可逆案件（不可逆4カテゴリ）の不可逆操作を実行する直前のapprove/deny」のみ**とする
- 具体計画・採否・優先順位・Issue分割・**実装AIの選定**・独立レビュアーの選定・実装・テスト・レビュー・
  Decision Log記録・可逆なGitHub操作（コメント・close/reopen・revert可能なmerge等）は**すべてAIの担当**とする。
  AI PMが実装AIと独立レビュアーを同時確定する
- カテゴリ③（権限・パイプライン自己変更）のゲートは**廃止せず位置を移動**する:
  実装開始前の事前承認・人間による実装者指名・着手可否や優先順位の人間判断を廃止し、
  **発効点**での人間approve/denyに一本化する。発効点とは (a) mainへのmerge、
  (b) 作業環境で即時に効く設定の反映（例: `.claude/settings.json` の変更適用）を指す
- 人間は**承認のみ**を行い、承認後のmerge等の実行はAIが担う
- `gate=human_approval` の語義を「実装開始の事前承認」から「**不可逆操作の発効点の実施可否承認**」へ再定義する
- 機械壁: `.claude/settings.json` のカテゴリ③パス（`AGENTS.md`・`CLAUDE.md`・`.agents/`・`.claude/`・
  `.codex/`・`.cursor/`・`.github/workflows/`）の Edit/Write と `Bash(gh pr merge:*)` を **deny→ask** へ変更する
  （askプロンプト＝発効点ゲートの機械化。非対話実行では拒否として振る舞う）。
  secret読み取り・mainへの直接push・force push・`gh repo edit`・`rm -rf` のdenyは維持する
- 越権事故防止条項は保護を維持したまま置換する:
  「人間が実装者を明示指名した場合のみ実装」→「AI PM（または人間）が承認済みIssue/Checkpointに
  紐づけて実装を割り当てた場合のみ実装（会話中のフォローアップ文言は割り当てではない）」

## Supersedes（旧決定の扱い）

- 「カテゴリ③の実装主体の再定義」（2026-07-07）: **全面Superseded**（事前承認・人間merge実行を本決定の発効点ゲートへ置換）
- 「高リスク時の verdict 表記を gate=human_approval に整理」（2026-07-10）: **部分**（route/gate分離・互換表記は維持。gate語義のみ本決定で再定義）
- 「通常リスクPRの自動マージレーン導入」（2026-07-17）: **部分**（G1〜G6の枠組みは維持。「高リスクPRのmergeは人間が行う」を「人間approve後にAIが実行」へ変更。ai-harnessの `gh pr merge` denyはaskへ）

## 背景・課題

ユーザー（判断専任PM）が2026-07-18に責務境界を明確化した。従前の正本は人間ゲートを
「実装開始前の事前承認・実装者指名・優先順位判断」まで広げており、実運用でも
`gate=human_approval` が実装開始承認として稼働し（Issue #51 / #86 / #92 のPM評価で実測）、
人間ボトルネックが発生していた。ChatGPT横断監査（2026-07-18、10コメント）と
Claude Code検証所見（Issue #51）を経て、ユーザーが対話レーンで裁定した。

## 採用する方針

上記決定事項のとおり（発効点ゲートへの一本化）。

## 採用しない方針 / 却下した代替案

- カテゴリ③ゲートの全面撤廃（「revert可能なmergeはAIが実行」まで拡張する案）:
  正本・設定は生きたガードレールであり、文面がrevert可能でも弱体化したガードレールの下で
  実行された行動は取り消せない（カテゴリ①④への入口リスク）ため却下
- 現状維持（実装開始前の事前承認・実装者指名の継続）: 人間ボトルネックが続き、
  「人間は判断のみ」の体制目的に反するため却下

## 判断理由

- リスク3軸: 最大リスク=③変更の誤merge（発効点の人間approve＋独立レビューで防御、revertで文面復旧可）×
  発生頻度=低（G1で③は自動マージ対象外のまま）× 復旧可否=文面は可逆・発効中の行動リスクは発効点ゲートで抑止
- 人間の判断コストを発効点1点に集中させることで、判断の質を保ったまま停滞を解消できる

## リスク（不可逆4カテゴリの該当有無）

カテゴリ③に該当（正本 `AGENTS.md`・`CLAUDE.md`・`.claude/settings.json` 等の書き換え）。
**移行時例外**: 本Decisionを導入するPR（#93）自身のmergeは、改定前ルールにより**人間が実行する**（独立レビュー＋人間merge）。本PRのmerge完了をもって新境界が発効し、以降の高リスクPRは「人間approve → AIがmerge実行」を適用する。人間の事前裁定は2026-07-18取得済み（Issue #51記録）、実装AI=Claude Code/Cursor、独立レビュー=Codex/ChatGPT。

## 影響範囲

- `AGENTS.md`（役割分担・リスク分類③・承認節・実装許可の解釈・verdict節・標準フロー）
- `CLAUDE.md`（役割・オーケストレーション規律・絶対ルール）
- `docs/harness/roles/codex.md` / `chatgpt.md` / `claude-code.md`、`docs/harness/ops/routing.md`
- `.agents/skills/pm-review/SKILL.md`（カテゴリ③分岐）
- `.claude/settings.json`（deny→ask）
- open Issue/PR（#29 #40 #54 #67 #85 #86 #92 #88）: 本決定のmerge後、各本文の旧境界記述をAIレーンで更新する

## 取り消し手順

本PRをrevertする（`git revert` で完全に戻る）。旧Decision（2026-07-07 / 07-10 / 07-17）の
Status注記を元に戻す。

## 見直す条件

- 発効点ゲート導入後、意図しないカテゴリ③変更が発効する事故が1回でも起きたら、
  旧境界（事前承認制）へ一時復帰して再設計する
- `ask` 運用が非対話実行の頻発で機能しない場合、ゲートの実装方式を再検討する

## 次アクション

- 本PR（#93）の独立レビュー（Codex/ChatGPT）→ 人間がmerge実行（上記移行時例外）
- merge後から新境界を適用。open Issue/PR本文の旧境界記述をAIレーンで更新（#51へ完了報告）
- 下流リポジトリへの反映はHARNESS_VERSION同期時に個別判断

承認: kazuk（2026-07-18 対話レーン。裁定記録: https://github.com/kikujizo/ai-harness/issues/51#issuecomment-5011677151）

---

# Decision: 通常リスクPRの自動マージレーン導入

Date: 2026-07-17
Status: Accepted（部分改定: 2026-07-18「責務境界の再定義」— 高リスクPRのmerge実行者を「人間」から「人間approve後にAI」へ変更。G1〜G6は維持）
Related Issues: なし（対話レーンでのkazuk事前承認: 2026-07-17）
Related PRs: 本Decisionを含むPR

## 決定事項

「merge判断は常に人間」を再定義する。通常リスクPRに限り、`AGENTS.md`「自動マージ条件」の
G1〜G6を全て満たす場合にAIがmergeできる自動マージレーンを開通する。
高リスク（不可逆4カテゴリ）PRと、条件を1つでも欠くPRのmergeは引き続き人間が行う。

## 背景・課題

maintainer（非エンジニア・判断専任PM）の判断キューで、AI作業完了済みの通常リスクPRが
merge待ちで停滞していた（プロセスがプロダクトを食う問題）。`AGENTS.md`承認節は
「通常リスクのmergeは…明示的に定義した自動条件を満たした場合のみ」と受け皿を設計済みだったが、
その自動条件が未定義のままだった。

## 採用する方針

既存部品（リスク分類正本・レビュー独立表・verdict契約・ディスポジション契約・CI）のみを
組み合わせた6条件ANDゲート（新規発明なし）。リスク3軸評価: 最大リスク=通常リスクPRの
不具合混入（G1で不可逆を除外済みのため `git revert` で完全復旧可）× 発生頻度=6重ゲートで低 ×
復旧可否=可。

## 採用しない方針 / 却下した代替案

- 全面人間merge維持: 判断専任PMのボトルネック化が続き、承認節の自動レーン設計が形骸化する
- 無条件AI merge: 不可逆4カテゴリの防壁を失う

## 判断理由

既存の防御部品（リスク分類・レビュー独立・verdict契約・ディスポジション契約・CI）が揃っており、
それらのAND条件だけで「revertで完全復旧できる変更」に自動レーンを限定できるため。

## リスク（不可逆4カテゴリの該当有無）

本変更自体はカテゴリ③（正本`AGENTS.md`の書き換え）に該当。既定の多層防御
（人間の事前承認・独立レビュー・人間merge・Decision Log記録・deny機械壁の常設）の下で実施する。

## 影響範囲

- `AGENTS.md`承認節 / `CLAUDE.md`（役割・絶対ルール） / `docs/harness/roles/claude-code.md`
- `.claude/settings.json` の deny `Bash(gh pr merge:*)` は**常設のまま維持**
  （ai-harnessは正本群中心のため本リポジトリでは自動マージを適用しない。下流への適用は個別判断）
- Vault側: 憲法CLAUDE.mdのmerge行・gh-review Skill作法6（同期済み）
- 下流リポジトリ: HARNESS_VERSION同期時に適用可否とdeny設定を個別判断

## 取り消し手順

本PRをrevertし、Vault側2箇所（憲法merge行・gh-review作法6）を旧文言（mergeは常に人間）へ戻す。

## 見直す条件

自動マージ運用の最初の5件以内に誤マージ（revert発生）が1件でも出たら、次を一組として実施する:
(a) 人間レーンへ一時復帰、(b) 下流リポジトリへの同期を停止、(c) 条件を再設計する。

## 次アクション

- 下流リポジトリへの展開時にdeny設定の扱いを個別判断
- 運用初期5件は判断コメント（G6）を人間が事後確認して較正する

承認: kazuk（2026-07-17 対話レーン）

---

# Decision: カテゴリ③の実装主体の再定義

Date: 2026-07-07
Status: Superseded（2026-07-18「責務境界の再定義」による。事前承認・人間merge実行は発効点ゲートへ置換）
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
Status: Accepted（部分改定: 2026-07-18「責務境界の再定義」— gate語義を「事前承認」から「発効点の実施可否承認」へ再定義。route/gate分離・互換表記は維持）
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

---

# Decision: mino-contract-driven-coding への operation 別 applicability 判定の導入

Date: 2026-07-24
Status: Proposed
Related Issues: #103, #74
Related PRs: #108

## 決定事項

`mino-contract-driven-coding` の契約表作成手順に、operation ごとの retry・duplicate・idempotency applicability 判定表を追加する。
3項目は相互推定せず独立判定し、Evidence 不足は `unknown` として上位仕様へ差し戻す。pure function・read-only operation へ根拠のない mechanism を要求しない。

## 背景・課題

現行 Skill は上位仕様から契約表を作り不明事項を Issue へ戻す境界を持つが、retry・duplicate・idempotency の独立判定が明文化されていない。
retry 可能なら idempotency も必要とみなす、duplicate を key の有無だけで決める、`unknown` を `not_applicable` へ丸める、といった誤推定を防げない。

## 採用する方針

- STEP 2 に operation 別 applicability 判定表を中間成果物として追加する
- 各項目を `required | not_applicable | unknown` で独立判定し、`rationale`・`evidence` を必須とする
- `unknown` 時は `confirmation_method`・`impact_if_unresolved` を記録し、実装せず Issue へ差し戻す
- Hard Gate で相互推定・pure/read-only への架空 mechanism・`unknown` の丸めをブロックする
- 外部 `inspired-mino-design-skills`（commit `afd50e2`）から部分移植し、P3 の3層帰属で記録する

## 採用しない方針 / 却下した代替案

- **3項目一括判定**: retry から idempotency を推定する誤りを招くため却下
- **全 operation への idempotency key 必須化**: pure/read-only への不要な mechanism を生むため却下
- **外部 Skill 丸ごと輸入**: lab ティア・上位仕様境界・既存契約表構造と衝突するため却下
- **新規テスト基盤・CI の同時導入**: 本 Issue のスコープ外。既存構造検証が無いため検証ファイル追加は行わない

## 判断理由

- Issue #74 P4 部品1として、契約作成時の誤推定を最小変更で防げる
- 既存 STEP 2・出力契約・反証ラウンドへ追記するだけで、lab ティア・発動条件・実行主体を変えずに適用できる
- 外部原典の「独立判定・Evidence・pure/read-only 禁止」を ai-harness の契約表様式へ操作的に落とし込める

## 3層帰属（P3）

| 層 | 内容 | 出所 |
|---|---|---|
| `source-derived` | 相互推定禁止、Evidence 付き applicability、pure/read-only への架空 mechanism 禁止 | `inspired-mino-design-skills` commit `afd50e2` の `mino-design-by-contract`（SKILL.md L45–83, workflow.md L130–159）、`mino-interface-implementation-separation`（SKILL.md L45–71, workflow.md L81–170） |
| `operationalization` | 既存契約表へ operation 別 applicability 判定表として組み込む | ai-harness Issue #103 仕様化 |
| `repository-policy` | lab ティア・明示発動・実装主体・上位仕様優先を維持 | ai-harness 既存 `mino-contract-driven-coding` 境界 |

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`.agents/skills/mino-contract-driven-coding/SKILL.md` の変更）。
  可逆工程（実装・テスト・レビュー・PR作成）は AI レーンで進める。発効点（merge・設定反映）のみ人間 approve/deny を必須とする。
- 最悪の失敗: 誤った再実行契約が後続実装へ伝わり、重複副作用または不要な仕組みを作ること。文書変更は revert 可能だが、誤契約に基づく外部副作用は戻せない。

## 影響範囲

- `.agents/skills/mino-contract-driven-coding/SKILL.md`（applicability 判定表・Hard Gate・出力契約・品質基準の追加）
- `docs/decisions.md`（本記録）

## 取り消し手順

1. 本 PR を `git revert` で戻す
2. 本 Decision Log の Status を Superseded へ変更する
3. 誤契約に基づき既に作られた外部実装がある場合は個別に訂正が必要（revert だけでは自動修正されない）

## 見直す条件

- applicability 判定表が形骸化し、相互推定が再発した場合
- Issue #74 部品2・部品3 との整合で様式変更が必要になった場合

## 次アクション

- [ ] ChatGPT による要件レビューを受ける
- [ ] Codex による技術レビューを受ける
- [ ] 人間による merge 判断

---

# Decision: オーケストレーション軽作業境界のループ構造基準化

Date: 2026-07-28
Status: Proposed
Related Issues: #110
Related PRs: #111

## 決定事項

`docs/harness/ops/orchestration.md` §2・§7 および `CLAUDE.md` のオーケストレーション規律を、
「1〜2ファイル」基準から**ループ非発生**基準へ変更する。多段実装ループ（調査→実装→CI→修正→再CI→記録）は
軽作業に含めず委譲必須とする。ツール着手前の委任表宣言を明文化する。
実測記録を `docs/harness/knowledge/2026-07-28-conductor-direct-heavy-loop.md` に新設し、正本から参照する。

## 背景・課題

ai-dev-workflow Issue #130 で、変更見込み2ファイルにもかかわらず指揮者が多段実装ループを直接実行した。
正本の軽作業定義がファイル数に偏り、ループ構造と委任表宣言が欠けていた。

## 採用する方針

- §2 委譲ラダー: 軽作業行を「ループ非発生の読み取り/1行修正」に変更し、多段ループ委譲必須を注記
- §7 グローバルスニペット: 委任表着手前必須・ループ基準を同期
- `CLAUDE.md`: 同上をオーケストレーション規律に反映
- knowledge/ 実測記録新規 + orchestration.md から参照
- 可逆工程（実装・PR作成）は先行可。発効点（merge・設定反映）は人間 approve/deny 必須

## 採用しない方針 / 却下した代替案

- **ファイル数基準の維持**: 多段ループを軽作業と誤判定する実測があるため却下
- **incidents/ 新設**: 本リポジトリに incidents/ 慣行がないため knowledge/ に記録

## 判断理由

- Vault76 で実測・ルール改訂済みの知見を正本へ還流し、全リポジトリの指揮者挙動を揃える
- 文言変更のみで実行主体・ティア・発動条件は変えない

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`CLAUDE.md`・`docs/harness/ops/orchestration.md` の変更）。
  可逆工程は AI レーンで進める。発効点のみ人間 approve/deny を必須とする。

## 影響範囲

- `docs/harness/ops/orchestration.md`
- `CLAUDE.md`
- `docs/harness/knowledge/2026-07-28-conductor-direct-heavy-loop.md`（新規）
- `docs/decisions.md`（本記録）

## 取り消し手順

1. 本 PR を `git revert` で戻す
2. 本 Decision Log の Status を Superseded へ変更する

## 見直す条件

- 委譲過多・委譲不足の新たな実測が蓄積した場合
- orchestration.md と Vault 側 orchestrate Skill の差分が運用上問題化した場合

## 次アクション

- [ ] ChatGPT による要件レビューを受ける
- [ ] Codex による技術レビューを受ける
- [ ] 人間による merge 判断

---

# Decision: mino-model-deepening への 12観点欠落監査と destruction probe の導入

Date: 2026-07-28
Status: Proposed
Related Issues: #109, #74
Related PRs: #112

## 決定事項

`mino-model-deepening` の設計 Checkpoint 手順に、対象 scope 固定後の **12観点欠落監査（screening）**、**applicable 観点の詳細化**、**destruction probe（反証）** を追加する。
Evidence 不足は `unknown` として停止し、本番データ・本番環境での probe を禁止する。無効状態を公開 writer または迂回 writer から生成できる候補は採用可能・完了扱いにしない。

## 背景・課題

現行 Skill は既存モデルの暗黙前提を問い直し代替候補を比較できるが、要件に必要な意味がどの観点で欠落しているかを網羅的に screening する手順と、無効状態を具体的な writer から作れてしまうかを検証する手順がない。
そのため、state・transition・failure・writer・authority 等の欠落や serializer・migration・admin 等の迂回経路を見逃したまま採用候補にできてしまう。

## 採用する方針

- 手順に「前提: 対象 scope の固定」を追加し、無限 scope を禁止する
- STEP 4〜6 として 12 観点 screening、applicable 観点の詳細化、destruction probe を追加する
- 各観点を `applicable | not_applicable | unknown` で判定し、`rationale`・`evidence` を必須とする
- `unknown` 時は `confirmation_method`・`impact_if_unresolved` を記録し、詳細化・完了扱いに進めない
- destruction probe は思考実験または使い捨て fixture を既定とし、writer / entry から伝播・業務影響まで追跡する
- Hard Gate で架空要素禁止・本番 probe 禁止・無効状態生成可能候補の完了扱い禁止をブロックする
- 外部 `inspired-mino-design-skills`（commit `afd50e2`）から部分移植し、P3 の3層帰属で記録する

## 採用しない方針 / 却下した代替案

- **全観点の詳細モデル化**: screening の穴埋めに架空要素を生むため却下
- **外部 `mino-domain-model-completeness` Skill 丸ごと輸入**: lab ティア・既存深化フロー・上位仕様境界と衝突するため却下
- **Completeness Package の全 schema・coverage 計算・canonical decision schema の導入**: 本 Issue のスコープ外のため却下
- **本番データ・本番環境での destruction probe**: 不可逆リスクのため却下
- **架空 probe による screening 穴埋め**: 監査の信頼性を損なうため却下
- **新規テスト基盤・CI の同時導入**: 本 Issue のスコープ外。既存構造検証が無いため検証ファイル追加は行わない

## 判断理由

- Issue #74 P4 部品2として、モデル候補評価時の見落としを最小変更で防げる
- 既存 STEP 1〜3・反証ラウンド・出力契約へ追記するだけで、lab ティア・発動条件・採否権限を変えずに適用できる
- 外部原典の「12 観点 rubric・applicability screening・destruction probe・本番 data 禁止」を ai-harness のモデル深化様式へ操作的に落とし込める

## 3層帰属（P3）

| 層 | 内容 | 出所 |
|---|---|---|
| `source-derived` | 12 観点 rubric、applicability screening、destruction probe の追跡項目、本番データ禁止 | `inspired-mino-design-skills` commit `afd50e2` の `mino-domain-model-completeness`（SKILL.md L14–25,36,44–54,62–76,78–88；workflow.md L34–45,47–84,145–200,233–269,297–371） |
| `operationalization` | 完全性監査 Skill 全体は輸入せず、既存モデル深化フローへ欠落監査表と反証記録として組み込む | ai-harness Issue #109 仕様化 |
| `repository-policy` | lab ティア・明示発動・実装中の自動再設計禁止・採否を人間に残す既存境界を維持 | ai-harness 既存 `mino-model-deepening` 境界 |

12 観点は外部 Skill 内の suite operationalization であり、一般 DDD 理論の固定定義として帰属させない。

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ③に該当（`.agents/skills/mino-model-deepening/SKILL.md` の変更）。
  `AGENTS.md` 承認節・verdict 契約および Decision「責務境界の再定義」（2026-07-18）に従う。

**人間ゲートの分離（混同しないこと）**:

| フェーズ | 人間の関与 | 根拠 |
|---|---|---|
| 1. 可逆工程（実装着手〜レビュー・PR作成） | **事前承認は不要**。AI PM が `PM_VERDICT: approve risk=high route=cursor gate=human_approval` で実装担当（`route`）と独立レビュアーを同時確定する（人間の実装者指名は不要） | `AGENTS.md` 承認節・verdict 節 |
| 2. merge 前の必須条件 | 人間の判断ではなく **AI 独立レビュー**（ChatGPT 要件レビュー・Codex 技術レビュー）と本 Decision Log の記録 | `AGENTS.md` レビュー独立・G2 |
| 3. 発効点（不可逆操作の直前） | **`gate=human_approval`**: merge・設定反映について人間が approve/deny。approve 後の merge 実行は AI が担う | `AGENTS.md` verdict 節・Decision 2026-07-18 |

- `gate=human_approval` は**実装着手前の事前承認ではない**。可逆工程（実装・テスト・レビュー・PR 作成）はこのゲートを待たずに進めてよい。
- 発効点の人間 approve/deny は、可逆工程の完了・独立レビュー合格・Decision Log 記録を**省略しない**。
- 最悪の失敗: AI が本番データへ破壊操作を行う、または無効状態を生成可能なモデルを安全と誤判定して後続実装へ渡すこと。文書変更は revert 可能だが、既に発生した外部副作用は完全には戻せない。

## 影響範囲

- `.agents/skills/mino-model-deepening/SKILL.md`（12 観点 screening・destruction probe・Hard Gate・出力契約・品質基準の追加）
- `docs/decisions.md`（本記録）

## 取り消し手順

1. 本 PR を `git revert` で戻す
2. 本 Decision Log の Status を Superseded へ変更する
3. 誤監査に基づき既に採用されたモデル設計がある場合は個別に訂正が必要（revert だけでは自動修正されない）

## 見直す条件

- 12 観点 screening が形骸化し、架空要素で穴埋めする運用が再発した場合
- Issue #74 部品3 との整合で様式変更が必要になった場合

## 次アクション

- [ ] ChatGPT による要件レビューを受ける
- [ ] Codex による技術レビューを受ける
- [ ] 人間による merge 判断

---

# Decision: capability-classification-criteria の導入（technical capability 誤分類の限定阻止）

Date: 2026-07-28
Status: Proposed
Related Issues: #113, #74
Related PRs: #114

## 決定事項

`docs/criteria/capability-classification-criteria.md` を新設し、設計・アーキテクチャ成果物で capability 種別・差別化・domain vision を扱うとき、
technical capability への根拠なき `core | supporting | generic` 付与・架空の differentiation / unique value / domain vision を
5項目のバイナリ基準で検出し、完成・推奨扱いに進めない。

## 背景・課題

親 Issue #74 部品3として、外部 `mino-architecture-quality-strategy` の Hard Gate を Skill 丸ごと輸入せず `docs/criteria/` へ限定移植する必要がある。
現行 `docs/criteria/` には、Redis・cache・deployment 等の技術手段をそれ自体で競争優位とみなす誤りや、Evidence なしの価値物語を直接止める設計基準がない。

## 採用する方針

- 適用対象を capability classification / differentiation / domain vision / architecture investment を扱う成果物に限定する
- 5項目のバイナリ基準（観測手順・項目ごとの `attribution` / `source` 付き）として実装する
- 外部 `inspired-mino-design-skills`（commit `afd50e2`）から部分移植し、P3 の3層帰属で記録する
- `docs/criteria/README.md` へ索引追加、`docs/decisions.md` に本記録のみ追加する

## 採用しない方針 / 却下した代替案

- **外部 `mino-architecture-quality-strategy` Skill 丸ごと輸入**: lab ティア・既存 Skill 境界と衝突するため却下
- **全設計成果物への常時適用**: 過剰適用とトークン浪費のため却下。適用対象を明示して限定する
- **技術要素の一律低評価**: technical capability を貶めるのではなく、技術軸（quality scenario 等）での評価を要求する
- **AI による事業価値・投資判断の承認**: 本基準は検出と停止のみ。最終承認は人間または上位仕様の Evidence に残す
- **新規テスト基準・CI・AGENTS.md / `.agents/` の同時変更**: 本 Issue のスコープ外のため却下

## 判断理由

- Issue #113 の Checkpoint と受け入れ条件5項目を、変更3ファイル・半日以内で満たせる
- 既存 `recursive-review` 運用から README 索引経由で選択でき、Skill・CI を変えずに導入できる
- 5項目固定により「10項目以内」と「5項目以内」の併記による曖昧性を解消する

## 3層帰属（P3）

| 層 | 内容 | 出所 |
|---|---|---|
| `source-derived` | capability kind 先行判定、technical capability への core/価値物語禁止、技術軸評価、Evidence 不足時の unknown | `inspired-mino-design-skills` commit `afd50e2` の `mino-architecture-quality-strategy`（SKILL.md L49, L66–75；workflow.md L47–87） |
| `operationalization` | Architecture Strategy Package 全体は輸入せず、5項目のバイナリ設計基準へ変換。`confirmation_method` / `impact_if_unresolved` を観測必須化 | ai-harness Issue #113 仕様化 |
| `repository-policy` | `docs/criteria/` を運用正本とする（1ファイル10項目以内・バイナリ＋観測手順は `docs/criteria/README.md` 運用ルール）。事業価値・優先順位・事業上の差別化の承認は AI が確定しない | `docs/criteria/README.md` 運用ルール（形式）+ ai-harness Issue #113 repository-policy（価値・優先順位・事業上の差別化の承認は AI が確定せず、人間または上位仕様の Evidence へ残す） |

## リスク（不可逆4カテゴリの該当有無）

- **該当なし（通常リスク）**。変更はドキュメント3件のみ。`git revert` で戻せる。
- 最悪の失敗: 基準が過剰適用され妥当な設計を止める、または逆に偽の差別化を見逃すこと。誤判定に基づく後続判断が既に行われた場合は個別訂正が必要。

## 影響範囲

- `docs/criteria/capability-classification-criteria.md`（新規）
- `docs/criteria/README.md`（索引追加のみ）
- `docs/decisions.md`（本記録）

## 取り消し手順

1. 本 PR を `git revert` で戻す
2. 本 Decision Log の Status を Superseded へ変更する
3. 誤適用に基づき既に却下された設計案がある場合は個別に訂正が必要（revert だけでは自動修正されない）

## 見直す条件

- 基準が capability を扱わない成果物へ誤適用される運用が再発した場合
- Issue #74 他部品との整合で様式変更が必要になった場合
- 6ヶ月間項目5以外が一度も×を出さない場合は剪定候補（`criteria-design-guide.md` のライフサイクルに従う）

## 次アクション

- [ ] ChatGPT による要件レビューを受ける
- [ ] Codex による技術レビューを受ける
- [ ] 人間による merge 判断

---

# Decision: stall-rescue Skill を ai-harness 正本へ lab として導入

Date: 2026-07-29
Status: Proposed
Related Issues: #106
Related PRs: #117

## 決定事項

停滞案件（同種失敗2回以上など。失敗層移動はチェックポイントの1つ）を安全に診断し最小再開手順を提示する `stall-rescue` Skill を、
`.agents/skills/stall-rescue/` に **lab ティア**として正本導入する。
Vault76_Cloud の同名Skillはマージ後ミラーとして扱い、正本は ai-harness とする。

## 背景・課題

ai-dev-workflow WSL2 sandbox PoC（15 Run成功0・約2週間停滞）の立て直し手順は、
Vault側 `.claude/skills/stall-rescue/` で稼働しているが、ai-harnessの正本・レビュー・配布対象になっていなかった。
PR #107 の暫定repository-policy（瞬間特定型description＋チェックポイント表のセット採用）に従い、
本Skillも発動境界を明示する必要がある。

## 採用する方針

- 正本: `ai-harness/.agents/skills/stall-rescue/`（`SKILL.md` + `references/adapters.md`）
- 初期ティア: **lab**（明示指定または AI 判断＋宣言。core の代替ではなく補助プレイブック）
- 発動境界: 同種失敗2回以上・失敗層未整理・律速支配・安全契約弱化案・断定直前の5チェックポイント（いずれか）
- 非発動: 初回失敗のみ → 通常デバッグ。仕様判断・PMルーティングは `pm-review` 等へ
- README・setupシナリオ試験・Decision Log で名称・lab・正本/ミラー・発動境界を一致させる

## 採用しない方針 / 却下した代替案

- **Vaultのみで継続**: ai-harness導入先で再現不能。SSOT Rot の原因になる
- **core ティアで初回導入**: 発動効果の実測が未完了。lab でパイロット後に昇格判断する（別Checkpoint）
- **AGENTS.md への規範再掲**: SSOT原則に反する。Skill内・adapters は `AGENTS.md` を参照のみ
- **PM判定・merge権限の付与**: Issueスコープ外。本Skillは診断プレイブックに限定

## 判断理由

- WSL2 PoC立て直しで実証済みの手順を、4AI体制で共有可能な形に固定する価値がある
- lab ティア＋明示発動境界により、通常デバッグ・PMルーティングとの責務衝突を抑える
- 5ファイル・単一Checkpointで受け入れ条件が観測可能

## リスク（不可逆4カテゴリの該当有無）

- **カテゴリ③に該当**（`.agents/skills/` 変更＝AIエージェント設定ディレクトリ）。
  実装route `route=cursor` は Codex PM が Issue #106 PM評価で決定済み。
  人間承認（`gate=human_approval`）: merge発効点で**承認済み**（2026-07-29 [#5113842833](https://github.com/kikujizo/ai-harness/pull/117#issuecomment-5113842833)）。

## 影響範囲

- `.agents/skills/stall-rescue/SKILL.md`（新規）
- `.agents/skills/stall-rescue/references/adapters.md`（新規）
- `README.md`（Skill一覧・責務境界）
- `docs/harness/setup.md`（シナリオ試験2件追加）
- `docs/decisions.md`（本記録）

## 取り消し手順

1. 本PRを `git revert` で戻す
2. `.agents/skills/stall-rescue/` ディレクトリを削除
3. README・setup から `stall-rescue` 記載を除去
4. 本 Decision Log の Status を Superseded へ変更
5. Vault側ミラーは正本削除後も残るが、ai-harness正本との同期は人間が判断する

`git revert` で完全に戻せる（可逆）。

## 見直す条件

- lab 共通規則の重大事故（誤ルーティング・未承認仕様追加・担当外実装）が1件でも発生した場合 → 即停止
- 発動効果の実測（別Checkpoint）で core 昇格候補と判定された場合 → Decision Log で昇格判断
- 8週間使用0回 → Archive候補（lab共通規則に従う）

## 次アクション

- [x] ChatGPT による要件レビュー（PR #117・[#5113515005](https://github.com/kikujizo/ai-harness/pull/117#issuecomment-5113515005) request-changes → [#5113618866](https://github.com/kikujizo/ai-harness/pull/117#issuecomment-5113618866) approve）
- [x] Codex による技術レビュー（[#5113660726](https://github.com/kikujizo/ai-harness/pull/117#issuecomment-5113660726) request-changes → [#5113726262](https://github.com/kikujizo/ai-harness/pull/117#issuecomment-5113726262) approve）
- [x] 人間による merge 判断（発効点・`gate=human_approval`・[#5113842833](https://github.com/kikujizo/ai-harness/pull/117#issuecomment-5113842833) approve・2026-07-29）

---

# Decision: Issue外の設計変更を実装前に提案へ分離する境界を正本へ追加

Date: 2026-07-29
Status: Proposed
Related Issues: #115
Related PRs: #118

## 決定事項

実装AIがIssue外の要件・安全契約・外部挙動・変更範囲を必要とした場合、影響する実装だけを停止し、
提案5点を記録してCodex PMへ返却する境界を、`AGENTS.md`・`CLAUDE.md`・`.cursor/rules/ai-workflow.mdc` に追加する。
Issue内の実装詳細は通常どおり継続し、逐次人間承認や全作業停止は新設しない。

## 背景・課題

- ai-dev-workflow Issue #32: Issueにない変更の越権実装
- ai-dev-workflow PR #138: `getent passwd` をIssue本文へ同期せず実装し撤回
- 現行正本はスコープ拡張禁止を示すが、提案・停止・復帰手順が未定義

## 採用する方針

- 正本: `AGENTS.md`「実装ルール」節に境界・具体例・提案5点・Codex PM返却を記載
- 実効ルール: `CLAUDE.md`・`.cursor/rules/ai-workflow.mdc` が同一境界を参照
- setupに正例・負例・GitHub書き込み不能の3シナリオを追加
- `scope-guard` Skillの新設・移送は行わない（Issue #115スコープ外）
- 人間approveは不可逆4カテゴリの**発効点**（merge等）のみ。通常仕様同期への新ゲートは作らない

## 採用しない方針 / 却下した代替案

- **Vault `scope-guard` Skillの丸ごと移送**: ai-harness導入先で過剰。共通境界への短い追記で再発抑制を優先
- **実装詳細ごとの人間承認ゲート**: ボトルネック化。Issue外変更のみ停止
- **事後報告での正当化**: 独断実装の再発を許す。実装前提案を必須化
- **全作業停止**: 独立に進められるIssue内作業まで止める必要はない

## 判断理由

- 仕様を勝手に変えたい部分だけ止め、Issue内の通常実装は止めない運用が実事故に最も適合
- 5ファイル・単一Checkpointで受入条件が観測可能
- Issue #116（fail-closed迂回パターン集約）は本境界確立後に続ける順序が妥当

## リスク（不可逆4カテゴリの該当有無）

- **カテゴリ③に該当**（`AGENTS.md`・`CLAUDE.md`・`.cursor/rules/` 変更）。
  実装route `route=cursor` は Codex PM が Issue #115 PM評価で決定済み。
  人間承認（`gate=human_approval`）: merge発効点で未実施。
  merge前に独立レビュー＋人間approve/deny必須。

## 影響範囲

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/ai-workflow.mdc`
- `docs/harness/setup.md`
- `docs/decisions.md`

## 取り消し手順

1. 本PRを `git revert` で戻す
2. 各ファイルから本Decisionに対応する追記節を除去
3. 本 Decision Log の Status を Superseded へ変更

`git revert` で完全に戻せる（可逆）。

## 見直す条件

- Issue外変更の見逃し（独断実装→撤回）が再発した場合 → 境界定義の見直し
- 過剰停止（Issue内詳細まで毎回停止）が観測された場合 → 具体例の剪定

## 次アクション

- [x] ChatGPT による要件レビュー（[#5114152763](https://github.com/kikujizo/ai-harness/pull/118#issuecomment-5114152763) request-changes → [#5114231564](https://github.com/kikujizo/ai-harness/pull/118#issuecomment-5114231564) approve）
- [x] Codex による技術レビュー（[#5114309408](https://github.com/kikujizo/ai-harness/pull/118#issuecomment-5114309408) request-changes → [#5114380333](https://github.com/kikujizo/ai-harness/pull/118#issuecomment-5114380333) approve）
- [x] Codex PM最終判断（[#5114462900](https://github.com/kikujizo/ai-harness/pull/118#issuecomment-5114462900) `PM_VERDICT: approve risk=high gate=human_approval`）
- [ ] 人間による merge 判断（発効点・`gate=human_approval`）

---

# Decision: fail-closed機構の既知迂回パターン基準を docs/criteria へ集約

Date: 2026-07-29
Status: Proposed
Related Issues: #116
Related PRs: #119

## 決定事項

新設または変更する fail-closed 機構について、実装前と独立レビュー時に照合する8基準を
[`docs/criteria/fail-closed.md`](criteria/fail-closed.md) に集約する。
`AGENTS.md`・`CLAUDE.md`・`.cursor/rules/ai-workflow.mdc` から同一基準を必須参照する。
根拠不足は `fail`、Issue外設計変更は提案5点で Codex PM へ返す契約を明記する。

## 背景・課題

ai-dev-workflow の WSL2 sandbox PoC では、fail-closed 追加後に独立レビューで別の迂回経路が繰り返し発見され、
専用 Issue で補修する流れが観測された（Issue #123 / #128 / #139 / #147）。
個別機構の実装ではなく、既知パターンを再利用可能な基準へ変換する必要がある。
PR #118 で Issue外設計変更の境界が正本化済みであり、本 Issue はその後続として実施する。

## 採用する方針

- 8基準を `docs/criteria/fail-closed.md` に閉じ、各項目に判定質問・pass証拠・失敗時挙動・attribution・一次資料を置く
- 実効ルール3ファイルが同一基準を参照し、実装前・レビュー時の照合を義務化
- 判定形式: `pass|fail|not_applicable` + `basis` + `next_action=continue|return_to_pm|blocked`
- 4具体例（`$HOME` 偽装、symlink/mountpoint、manifest 前 backup 消費、provenance 不明）を基準ファイル内に置く
- 将来の新パターンは別 Issue で基準へ追加（共通コア肥大化を避ける）

## 採用しない方針 / 却下した代替案

- **8基準を `AGENTS.md` 本文へ全量展開**: 共通コア肥大化。基準ファイル参照に集約
- **fail-closed 照合ごとの人間承認ゲート**: ボトルネック化。発効点（merge）のみ `gate=human_approval`
- **全作業停止**: 独立に進められる Issue 内作業まで止める必要はない
- **新規 CLI / Skill / GitHub Action**: Issue スコープ外。基準ファイルと参照のみ

## 判断理由

- 観測済み4系統の迂回を重複なく8項目に分離でき、10項目上限内に収まる
- `docs/templates.md` の基準ファイル形式と `capability-classification-criteria.md` の運用実績に整合
- PR #118 の提案5点ルールと接続し、推測 `pass` を構造的に禁止できる

## リスク（不可逆4カテゴリの該当有無）

- **カテゴリ③に該当**（`AGENTS.md`・`CLAUDE.md`・`.cursor/rules/` 変更）。
  実装 route は Codex PM が `route=cursor` で確定済み。
  実装・テスト・レビュー・Draft PR 作成は事前承認不要。
  発効点（merge）のみ `gate=human_approval`。

## 影響範囲

- `docs/criteria/fail-closed.md`（新規）
- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/ai-workflow.mdc`
- `docs/decisions.md`

## 取り消し手順

1. 実装 PR を `git revert` する
2. `AGENTS.md`・`CLAUDE.md`・`.cursor/rules/ai-workflow.mdc` から必須参照節を除去
3. `docs/criteria/fail-closed.md` を削除
4. 本 Decision Log の Status を Superseded へ更新

`git revert` で完全に戻せる（可逆）。

## 見直す条件

- 新しい迂回パターンが2回以上観測された場合 → 別 Issue で基準へ追加
- 対象外判定が過剰停止を招いた場合 → `not_applicable` 具体例の剪定

## 次アクション

- [x] ChatGPTによる要件レビュー（[#5115059848](https://github.com/kikujizo/ai-harness/pull/119#issuecomment-5115059848) approve）
- [x] Codexによる技術レビュー（[#4805904431](https://github.com/kikujizo/ai-harness/pull/119#pullrequestreview-4805904431) approve）
- [x] Codex PM最終判断（[#5115449824](https://github.com/kikujizo/ai-harness/pull/119#issuecomment-5115449824) `PM_VERDICT: approve risk=high gate=human_approval`）
- [ ] 人間によるmerge判断（発効点・`gate=human_approval`）

---

# Decision: 曖昧な包括指示の権限拡張解釈防止（AI PM割当・人間発効点approve・closed question・技術的不確実性の境界明確化）

Date: 2026-07-31
Status: Proposed
Related Issues: #121
Related PRs: #125

## 決定事項

既存 `AGENTS.md`「実装許可の解釈」節へ、対象物・操作・権限段階を特定しない包括表現（「後は頼みます」等）が
新規実装割当・独立レビューの代行・self-approve・merge等の発効点通過へ拡張解釈されないことを追記する。
あわせてAI PM割当と人間の発効点approveの境界、人間へclosed questionを返してよい条件、技術的不確実性の
差し戻し先を明文化する。`CLAUDE.md` と `.cursor/rules/ai-workflow.mdc` は全文複製せず、`AGENTS.md` への
正本参照と実行時強調を1項目だけ追加し、`docs/harness/setup.md` へ5シナリオの手動試験記録を追加する。

## 背景・課題

2026-07-30の運用で、対象操作を特定しない包括的な発言を次の権限へ拡張解釈しかけた事例が2件報告された。

- 実装AIが、独立AIに割り当てられたレビューを自ら代行しかけた
- 高リスクPRについて、人間の発効点approveがない状態でmergeへ進みかけた

実害は発生していないが、既存規定は次の境界を明示していなかった。

1. AI PMのIssue／Checkpoint割当が許可する範囲
2. 人間の発効点approveが許可する範囲
3. 曖昧な権限表現を人間へ確認してよい条件
4. 技術的不確実性を人間への承認質問で代替してはならない条件

## 採用する方針

- 既存「実装許可の解釈」節への狙い撃ち追記（新設・全文複製ではない）
- 規則の正本は `AGENTS.md`。`CLAUDE.md` と `.cursor/rules/ai-workflow.mdc` は実行時強調＋正本参照のみ
- `docs/harness/setup.md` へ5シナリオ（曖昧な包括指示・明示approve・AI PM割当・技術的不確実性・
  通常リスク自動merge）の入力・期待挙動・実出力・合否を既存形式で追記
- 曖昧な包括表現は新しい権限を発生させない。人間へのclosed questionは、非人間ゲートが成立し
  残件がapprove/denyだけになった場合に限定する
- 技術的不確実性はAI PM再ルートまたは `blocked` へ差し戻し、人間承認で代替しない

## 採用しない方針 / 却下した代替案

- **新Skillの新設**: 既存「実装許可の解釈」節への狙い撃ち追記で受け入れ条件を満たせるため却下
  （Codex PM初回評価で「Checkpoint分割不要・既存節への追記が妥当」と判定済み）
- **`CLAUDE.md`・`.cursor/rules/ai-workflow.mdc` への全文複製**: 正本が複数箇所に分裂し将来の改定で
  乖離する危険があるため却下。実行時強調＋参照のみを採用
- **高リスク操作のたびに毎回人間へ進行確認を求める運用**: 過剰停止を招き、本Checkpointが目的とする
  「技術的不確実性を人間承認で代替しない」境界に反するため却下
- **技術ゲート不成立時に人間へ実行可否を質問する運用**: 人間を技術判断・技術復旧の代替にしない既存契約
  に反するため却下。AI PM再ルートまたは `blocked` 記録を採用
- **非公開advisor相談ログ・Vault内チャットログの逐語転載**: 非公開情報のリポジトリ持ち出しになるため却下。
  抽象化した事象のみを記録する

## 判断理由

- 実害は未発生だが、既存規定は「発言から権限を推定する境界」を明示しておらず、再発防止のため
  境界を先回りで固定する必要がある
- `AGENTS.md` への狙い撃ち追記は差分が小さく、既存G1〜G6・不可逆4カテゴリ・高リスク発効点承認を
  変更しないため、カテゴリ③の変更の中でもリスクを抑えられる
- Issue #121のCodex PM再評価で、確定した文言が現行mainの正本と整合していることを確認済み

## リスク（不可逆4カテゴリの該当有無）

カテゴリ③に該当（`AGENTS.md`・`CLAUDE.md`・`.cursor/rules/` はAIエージェントの実効ルール・設定）。
カテゴリ①（秘匿・個人情報）・②（課金）・④（不可逆データ操作）は非該当。可逆工程（実装・テスト・
レビュー・PR作成）は事前承認不要でAIレーンにより進行し、発効点（merge）でのみ人間approve/denyを
必須とする。最悪の失敗シナリオは、曖昧な発言を権限として誤認し、独立レビューを省略するか、
高リスク操作を人間approveなしで実行することである。リポジトリ差分は `git revert` で戻せるが、
誤った解釈に基づき既に実行された外部操作の影響は完全には戻せない可能性がある。

## 影響範囲

- `AGENTS.md`（「実装許可の解釈」節への追記）
- `CLAUDE.md`（「絶対ルール」節への1項目追記、正本参照）
- `.cursor/rules/ai-workflow.mdc`（Cursor固有注記の追記、正本参照）
- `docs/harness/setup.md`（Issue #121 Checkpoint・5シナリオの試験記録追加）
- 本 Decision Log

## 取り消し手順

本Issueに紐づく上記5ファイルの変更を同一PR単位で `git revert` する。適用先リポジトリへ既に
同期済みの場合は、正本revert後に各適用先へ再同期する。本Checkpointは既存G1〜G6・不可逆4カテゴリ・
高リスク発効点承認の文言を変更していないため、revertによる既存契約への副作用はない（可逆）。

## 見直す条件

- 追記した境界を適用してもなお、曖昧な包括表現からの権限拡張解釈事故が再発した場合
  （表現の判定基準を強化）
- 追記した境界が過剰停止（技術的に進行可能な場合まで人間へclosed questionを返す）を招いた場合
  （条件4の運用を見直す）
- 通常リスクPRの自動merge判断へ、本Checkpoint由来の新しい承認ゲートが誤って波及した場合（即座に是正）

## 次アクション

- [ ] ChatGPT要件レビュー
- [ ] Codex技術・差分レビュー
- [ ] 対象PRを明示した人間の発効点approve/deny
- [ ] approve後、AIによるmerge実行

---

# Decision: Issue外設計変更のPR実差分をmanifest照合で機械停止する（issue-manifest-diff）

Date: 2026-07-31
Status: Proposed
Related Issues: #122, #120
Related PRs: #124

## 決定事項

Issue本文に固定manifest（`issue-change-manifest/v1`）を1件だけ記載し、固定`base_sha`からPR headまでの
全tracked fileの`add|modify|delete`実差分（renameは`delete+add`へ正規化）と完全一致するかを
Node.js標準機能のみのcheckerで機械照合する。不一致・入力不正は`pass|fail|blocked`契約で
nonzero終了させ、独立レビュー前に停止できる状態にする。

## 背景・課題

親提案 #120 で新設した「Issue外の設計変更を実装前に提案へ分離するルール」が、導入当日に
ai-dev-workflow PR #169 で破られた（`docs/decisions.md`の許可範囲外に既存エントリの更新が混入）。
現状はIssue文章とPR差分を人手で比較しており、機械的な最初の壁がなかった。

## 採用する方針

- `harness/checks/issue-manifest-diff.cjs`（新規・Node.js標準機能のみ）でmanifest抽出・schema検証・
  git diffの正規化・比較を行う。CLI契約はIssue本文が定義する`--repo --issue --head`のみ
- `.github/workflows/issue-manifest-diff.yml`（新規）が`pull_request_target`（`opened/synchronize/reopened/edited`）で
  base branch上のcheckerをread-only実行する。PR head側のプログラム・test・workflowは実行しない。
  `pull_request`ではなく`pull_request_target`を使うのは、GitHub Actionsの仕様上`pull_request`は
  ワークフローファイル自体がPRのmerge commit版（PR側の変更を含む版）で実行され、PRが`.yml`自身を
  改変してcheckerの呼び出し・終了判定を無力化できてしまうため（Codex技術レビューで指摘・修正）。
  `pull_request_target`はワークフローファイルをbase repositoryのdefault branch側から取得するため
  PR側の`.yml`改変の影響を受けない。PR headの内容は`git diff`比較用のデータとしてのみ扱い、
  PR head側のファイルはcheckout・実行しない（`permissions`も読み取り専用のみに限定する）
- `docs/harness/sync-ownership.md`に`harness/checks/`をharness-ownedとして追加（`.github/`はrepo-ownedのまま変更しない）
- `harness/checks/issue-manifest-diff.test.cjs`（新規）は`node:test`のみを使い、実git fixture
  （`git init`→実コミット・rename・mode変更・symlink/submodule相当のcacheinfo操作）で
  正常系・異常系を再現する。テスト不能をskip・終了コード0にしない

## 採用しない方針 / 却下した代替案

- **CLIに`--pr`フラグを追加し、checker自身がPR本文の`Related Issue: #<n>`行を解析する2モード設計**:
  Issue本文が定義するCLI契約は`--repo --issue --head`のみであり、`--pr`はIssue外の独自仕様判断に
  当たるため却下。advisor相談（2026-07-31）でも同じ指摘を受けた。related-issue行の抽出・検証は
  `.github/workflows/issue-manifest-diff.yml`側の責務とし、確定したissue番号だけをcheckerへ渡す
- **rename/copy検出を自前で再実装する**: `git diff --no-renames`（rename検出無効化。`-C`/`--find-copies`も
  付与しない）を使えば、rename→delete+add、copy→add(+別途modify)がgitの標準出力としてそのまま
  Issue本文の正規化規則と一致するため、自前実装は不要と判断し却下
- **外部npm packageでの引数解析・YAML/JSON検証**: 「Node.js標準機能だけで実装し、外部npm packageを
  追加しない」の確定事項に反するため却下。`fetch`はNode組み込みのためpackage追加に当たらない

## 判断理由

- Issue本文が定義していないCLI拒否・依存追加は「実装せずIssueへ返す」対象であり、実装判断で
  勝手に拡張しないことを優先した
- `git diff --no-renames --name-status -z`はIssue本文の差分正規化規則（rename→delete+add、
  copy→add＋別途modify、mode/symlink/submodule変更→modify）とそのまま一致し、追加ロジックなしで
  正しく実現できることをローカルの実git fixtureで確認済み
- 実git fixtureテストにより、AC4が要求する正常系・異常系（exact match、余分な変更、不足変更、
  add/modify/delete/rename、generated file、manifest欠落・重複・不正JSON、不正base、非ancestor）を
  すべて再現し、`node --test`で24件全通過を確認した

## 実装判断（Issue本文が明示していない詳細・独立レビュー対象として明記）

Issue本文はすべてのエッジケースを一意に定めていない。以下は実装時に確定させた判断であり、
独立レビュー（ChatGPT要件・Codex技術）で意図的に照合してもらう対象とする。

1. **glob文字の定義**: manifest pathの禁止規則「globを禁止」に対し、`*?[]{}`を禁止文字集合とした
2. **manifest markerの異常系の割り振り**: start/end markerが「両方0件」は`manifest_missing`、
   それ以外の不正な組み合わせ（複数件・片方欠落・順序逆転）はすべて`manifest_ambiguous`とした
3. **stop_reasonの優先順位**: 同一PRで「余分な変更」と「不足変更」が両方観測された場合、
   `stop_reason=diff_not_in_manifest`を優先する（manifest外ファイルの混入の方が危険度が高いため）。
   両方の行（`unexpected_change=`・`missing_change=`）は出力に残す
4. **実差分側の重複pathガード**: 「manifestと実差分の双方を重複排除せず、重複があれば入力不正として
   停止する」という規則のうち、実差分側で重複が観測された場合（通常のgit diffでは発生しない）は
   専用enumがないため`checker_internal_error`にマップした
5. **related-issue行の抽出責務**: `.github/workflows/issue-manifest-diff.yml`側に置き、
   checker本体（`--repo --issue --head`契約）には持たせない
6. **root相対pathの厳密検査**: Issue本文「pathはリポジトリルート相対、`/`区切り」に対し、
   バックスラッシュ区切り（`docs\decisions.md`）とWindowsドライブ形式（`C:\...`・`C:/...`）も
   `manifest_schema_invalid`として拒否する（ChatGPT要件レビューで欠落を指摘・修正）
7. **出力行のsort順**: 「path一覧はbyte順でsortして比較する」に対し、`unexpected_change=`・
   `missing_change=`の出力行はUTF-8 byte列（`Buffer.compare`）でsortする。JS標準の文字列比較
   （UTF-16コード単位順）はサロゲートペア（絵文字等）を含むとbyte順と逆転するため使用しない
   （ChatGPT要件レビューで指摘・修正）

## リスク（不可逆4カテゴリの該当有無）

- **カテゴリ③に該当**（`.github/workflows`の新設とharness-owned配布範囲の変更）。`risk=high gate=human_approval`
- 実装・テスト・PR作成・独立レビュー（ChatGPT要件・Codex技術）はAI工程として進める。merge発効点で
  人間のapprove/denyを必須とする（今回の承認範囲はIssue #122コメントに明記のとおり実装・PR作成まで）
- 初回導入PRはbase branchにcheckerがまだ存在しないため、本checker自身による機械検査の対象外。
  通常テストと独立レビューで補完する（Issue本文に明記済みの既知の限界）
- branch protection設定自体は変更しないため、fail/blockedは運用契約上のレビュー・merge停止であり、
  GitHubの強制マージ阻止ではない

## 影響範囲

- `harness/checks/issue-manifest-diff.cjs`（新規）
- `harness/checks/issue-manifest-diff.test.cjs`（新規）
- `.github/workflows/issue-manifest-diff.yml`（新規）
- `docs/harness/sync-ownership.md`
- 本 Decision Log

## 取り消し手順

1. 実装PRを`git revert`する
2. `.github/workflows/issue-manifest-diff.yml`を削除する
3. `harness/checks/issue-manifest-diff.*`を削除する
4. `docs/harness/sync-ownership.md`から`harness/checks/`分類を戻す
5. 本Decision LogのStatusを`Superseded`へ更新する

`git revert`で完全に戻せる（可逆）。ただし、誤って`pass`と判定した期間中にmanifest外変更が
mergeされていた場合、その下流影響は本PRのrevertだけでは取り消せない（Issue本文に明記済み）。

## 見直す条件

- 初回導入PR自体の機械的阻止、またはGitHub上の強制阻止（branch protection required check化）が
  必要になった場合 → 別Checkpointで再設計
- 適用先リポジトリ（ai-dev-workflowなど）への配線が必要になった場合 → 別Checkpointとして扱う
  （Issue本文の仮定に明記済み）
- 上記「実装判断」7項目のいずれかに独立レビューから修正要求が入った場合 → 該当箇所を修正し本エントリを更新

## レビュー記録

| 項目 | 結果 | 証跡 |
|---|---|---|
| ChatGPT要件レビュー（1回目） | request-changes risk=high（AC1: pathのバックスラッシュ・Windowsドライブ拒否漏れ、詳細仕様: byte順sort未実装） | [PRコメント](https://github.com/kikujizo/ai-harness/pull/124) |
| Codex技術レビュー（1回目） | request-changes risk=high（AC5: `pull_request`はワークフロー定義自体がPR側で改変可能なため権威ある判定にならない） | [#5143007038](https://github.com/kikujizo/ai-harness/pull/124#issuecomment-5143007038) |
| 対応 | 上記2件を修正（`pull_request_target`へ変更、`validatePathRule`にバックスラッシュ・ドライブ形式拒否を追加、`compareBytes`でUTF-8 byte順sortに変更）。実装判断6・7として本エントリへ追記、テスト追加、`node --test`で29件全通過を再確認 | 本PR追加commit |
| 再レビュー | 依頼中 | (未確定) |
| merge | 未実施 | - |

## 次アクション

- [x] Claude Codeによる実装・テスト・PR作成（本エントリ）
- [ ] ChatGPTによる要件レビュー（1回目request-changes→修正済み→再レビュー依頼中）
- [ ] Codexによる技術レビュー（1回目request-changes→修正済み→再レビュー依頼中）
- [ ] 人間によるmerge判断（発効点・`gate=human_approval`）

---

# Decision: 既知のsuccess-propagation迂回をPRレビュー前にblocking検出する（fail-closed-success-propagation）

Date: 2026-08-01
Status: Proposed
Related Issues: #123
Related PRs: #127

## 決定事項

変更された shell・Node.js test・GitHub Workflow について、既知の success-propagation 迂回（SP001〜SP004）と静的に成否伝播を証明できない箇所を、`harness/checks/fail-closed-success-propagation.cjs` で機械検出し、独立レビュー前に成功扱いせず停止する。PR 上の権威ある判定は `pull_request_target` ＋ read-only ＋ base branch 上の checker で行い、PR head 側コードは checkout / require / exec しない。

## 背景・課題

親提案 #120 の fail-closed 基準導入直後、ai-dev-workflow PR #157（実行不能を skip して成功）と PR #156（未処理 `sleep 5` 後に終了コード 0）が確認された。現状は実装後レビューでの人手確認に依存しており、既知迂回を PR レビュー前に blocking 検出する仕組みがなかった。

## 採用する方針

- 固定構文契約 `success-propagation-fixed/v1`（checker 出力 `syntax_contract=...`）で SP001〜SP004 を既知パターン検出。CLI 契約は `--base <commit_sha> --head <commit_sha>` のみ
- shell 候補同一性: 同一 `TARGET_COMMAND` 開始行は 1 候補。SP001 `fail` 時は SP002 `unknown` を重複付与しない
- Node.js: `raw_view` / `code_view` 分離、対応可能 condition と限定 implicit return のみ `fail`、それ以外は `unknown`
- Workflow / composite: `jobs.*.steps` と `runs.steps`（composite）のみ step 候補。job reusable・dynamic matrix・`uses:`・`run: >` は `unknown` または契約どおり `fail`
- `harness/checks/fail-closed-success-propagation.test.cjs`（新規）で AC1〜AC5 相当を実 git fixture で再現
- `.github/workflows/fail-closed-success-propagation.yml`（新規）を `pull_request_target`（opened / synchronize / reopened）で発火。base branch 上の checker を read-only 実行
- `docs/criteria/fail-closed.md` へ checker の適用範囲・候補同一性・`unknown` blocking・構造解析分離・checker pass の限界を追記
- 個別 finding は `pass|fail|unknown`、PR 全体は `pass|fail|blocked`。`unknown` が1件でも PR 全体を `blocked` ＋ nonzero

## 採用しない方針 / 却下した代替案

- **完全な shell / JavaScript / YAML 構文・意味解析（AST 等）を本 PR で導入**: 固定構文 v3 で構造解析を分離し別 Checkpoint へ送るため却下
- **fail-closed 基準2〜8の機械検査を同一 PR で導入**: 粒度超過のため却下（別 Checkpoint）
- **inline ignore / allowlist / warning-only 経路**: 迂回経路を増やすため却下
- **PR head 側 checker の実行**: 信頼境界を破るため却下
- **`pull_request` イベントの使用**: ワークフロー定義自体が PR 側で改変可能なため却下（Issue #122 と同様に `pull_request_target` を採用）

## 判断理由

- Checkpoint 1（Issue #122 / PR #124）で確立した manifest 照合と同型の信頼境界（base branch 上 checker、PR head 非実行）を踏襲できる
- 導入直後に実測された2件の迂回に限定することで、3〜5ファイル・半日粒度に収まる
- `unknown` を PR 全体 `blocked` とすることで、静的解析不能を成功扱いしない fail-closed 契約を維持できる

## リスク（不可逆4カテゴリの該当有無）

カテゴリ③に該当（`.github/workflows` へ blocking 判定を追加）。
`risk=high gate=human_approval`。実装・テスト・PR 作成は AI 工程として進め、merge 発効点のみ人間 approve/deny を必須とする。

最悪の失敗は既知迂回を `pass` にして違反を見逃すこと、または `unknown` 過剰判定で正常 PR を継続停止すること。Workflow と checker は `git revert` で戻せるが、見逃し期間中に merge された下流影響は revert だけでは戻らない。

## 影響範囲

- `harness/checks/fail-closed-success-propagation.cjs`（新規）
- `harness/checks/fail-closed-success-propagation.test.cjs`（新規）
- `.github/workflows/fail-closed-success-propagation.yml`（新規）
- `docs/criteria/fail-closed.md`
- 本 Decision Log

## 取り消し手順

1. 実装 PR を `git revert` する
2. `.github/workflows/fail-closed-success-propagation.yml` を削除する
3. `harness/checks/fail-closed-success-propagation.*` を削除する
4. `docs/criteria/fail-closed.md` の checker 節を戻す
5. 本 Decision Log の Status を `Superseded` へ更新する

## 見直す条件

- `unknown` 過剰判定が運用上のボトルネックになった場合 → 検出ルールの見直しを別 Issue で行う
- 基準2〜8の機械検査が必要になった場合 → 別 Checkpoint として分割する
- branch protection への required check 化が必要になった場合 → 別 Checkpoint で再設計

## レビュー記録

| 項目 | 結果 | 証跡 |
|---|---|---|
| ChatGPT要件レビュー | 未実施 | - |
| Codex独立技術レビュー | 未実施 | - |
| merge | 未実施 | - |

## 次アクション

- [x] Cursor による実装・テスト・PR 作成（本エントリ）
- [ ] ChatGPT 要件レビュー
- [ ] Codex 独立技術レビュー
- [ ] 人間による merge 判断（発効点・`gate=human_approval`）

---

# Decision: harness-sync PRのbaseをmainへ固定しstacked PRを禁止する

Date: 2026-08-06
Status: Proposed
Related Issues: #128, #85
Related PRs: #130

## 決定事項

harness-sync で作成・確認・処置する同期 PR について、base を常に `main` に固定し、既存 OPEN 同期 PR への stack（既存 OPEN PR の head branch を base にした新規同期 PR）を禁止する。既存 OPEN 同期 PR が 1 件以上ある場合は新規同期 PR を作成しない。再作成は既存 OPEN 同期 PR を close または取り下げ、OPEN 件数が 0 になったことを確認した後に限る。自動 close、自動 rebase、自動 base 変更は行わない。

## 背景・課題

Issue #85 / #128 で、harness-sync 同期 PR の base が `main` 以外（feature branch や既存同期 PR の head branch）になるケースや、既存 OPEN 同期 PR がある状態で新規同期 PR を作成する stacked 運用が発生しうる。これにより merge 候補の判定が曖昧になり、誤 base や重複同期 PR が残存するリスクがある。

## 採用する方針

- `AGENTS.md` に harness-sync 固有の運用規則を追記する（通常 PR の G1〜G6・リスク分類・承認条件は変更しない）
- `docs/harness/sync-ownership.md` に許可・停止判断の運用例を追記する（guard / verify-merge の機械契約変更は行わない）
- base は常に `main`。再作成時も `main`
- 既存 OPEN 同期 PR がある場合は新規作成を停止し、既存 PR の source、base、state を確認する
- 個別処置は別 Issue へ分離し、Codex PM が route を確定する
- 例外は原則なし。緊急復旧等は Decision Log 記録＋カテゴリ③発効点で人間 approve

## 採用しない方針 / 却下した代替案

- **既存 OPEN 同期 PR へ stack する**: base 固定と OPEN 件数制御を破るため却下
- **OPEN 同期 PR を残したまま新規同期 PR を作る**: 重複同期 PR と誤 merge リスクのため却下
- **既存 PR を自動 close する**: 個別 PR の処置を本 Issue で自動化せず、別 Issue へ分離して Codex PM が route を確定するため却下
- **既存 PR を自動 rebase または自動 base 変更する**: 同期内容の意図を破壊しうるため却下
- **通常 PR へ base 固定・stack 禁止を拡張する**: 本 Decision のスコープ外のため却下
- **guard / verify-merge の契約を今回変更する**: 文書正本化のみのスコープのため却下
- **例外を恒常運用へする**: 運用の曖昧化を招くため却下

## 判断理由

- harness-sync 同期 PR はテンプレート同期という単一目的であり、base を `main` に固定することで merge 候補の判定を単純化できる
- stacked PR や OPEN 重複は、どの同期 PR が正本かを人間が判断しづらくする
- 文書正本化のみで実装・テスト・PR 作成を先行でき、発効点（merge）でのみ人間 approve を要求する運用と整合する

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ① 非該当
- カテゴリ② 非該当
- カテゴリ③ **該当**（`AGENTS.md` 正本変更）
- カテゴリ④ 非該当

`risk=high` `gate=human_approval`。実装・テスト・PR 作成は先行可能。発効点は実装 PR の merge。Cursor とは独立した ChatGPT 要件レビューと Codex 技術レビューが必要。Decision Log 記録後、merge 直前に人間 approve／deny が必要。approve 後の merge 実行は AI が行う。

## このPRの最悪の失敗は何か・それは戻せるか

1. **規則が広すぎて通常 PR まで不必要に停止する**: 文書上の適用範囲が曖昧だと、通常 PR の base/stack 判断まで harness-sync 規則が及ぶ。`git revert` と Decision Log の `Superseded` 更新で戻せる。
2. **規則が曖昧で、誤 base、stacked PR、OPEN のままの再作成を許す**: 運用例と AGENTS 節の表現が不十分だと、意図しない PR が merge 候補に残る。同上、`git revert` で戻せる。

## 影響範囲

- `AGENTS.md`（harness-sync 固有節の追記のみ）
- `docs/harness/sync-ownership.md`（許可・停止判断例の追記のみ）
- `docs/decisions.md`（本 Decision Log エントリ）
- 通常 PR、G1〜G6、既存 guard / verify-merge の契約には影響しない

## 例外条件

原則なし。緊急復旧等の例外は、対象 PR、理由、依存関係、取り消し手順を Decision Log へ記録し、カテゴリ③の発効点で人間 approve を得る。例外を通常運用へ一般化しない。

## 取り消し手順

1. 実装 PR を revert する
2. `AGENTS.md` の harness-sync 固有規則を戻す
3. `docs/harness/sync-ownership.md` の運用例を戻す
4. Decision Log の Status を `Superseded` へ更新する
5. 通常 PR、G1〜G6、既存 guard / verify-merge の契約が元の状態であることを確認する

## 見直す条件

- harness-sync 以外の PR 種別へ規則が誤適用された場合
- stacked PR や OPEN 重複が文書規則だけでは防止できないと判明した場合（guard / verify-merge 変更は別 Issue）
- 適用先リポジトリ数の増加により、同期 PR の運用負荷が変化した場合

## レビュー記録

| 項目 | 結果 | 証跡 |
|---|---|---|
| Draft PR | 作成済み | [#130](https://github.com/kikujizo/ai-harness/pull/130) |
| ChatGPT要件レビュー | 未実施 | - |
| Codex独立技術レビュー | 未実施 | - |
| merge | 未実施 | - |

## 次アクション

- [x] Cursor による実装・テスト・PR 作成（本エントリ）
- [ ] ChatGPT 要件レビュー
- [ ] Codex 独立技術レビュー
- [ ] 人間による merge 判断（発効点・`gate=human_approval`）

---

# Decision: 高リスク承認v2契約の実効ルール同期（Issue #133）

Date: 2026-08-10
Status: Accepted
Related Issues: #133, #134

## 決定事項

Issue #134 で `AGENTS.md` / `pm-review` に正本化した高リスク承認v2契約を、
`CLAUDE.md` と `docs/harness/roles/chatgpt.md` / `codex.md` / `claude-code.md` へ同期する。
実装開始承認（`implementation_start`）と発効点承認（`merge` / `settings_apply` / `execution`）を分離し、
各AI経路で承認前route禁止・v2 record・approve後gate除去を明文化する。

## 背景・課題

#134 merge後も `CLAUDE.md` と貼付用role文書に旧契約（「発効点のみ人間approve」「カテゴリ③事前承認不要」
「実装開始は止めない」等）が残り、AIごとに解釈が分かれていた。
#133 は #134 の全面運用適用に必須の同期Checkpointである。

## 採用する方針

- **二段階移行**: #134で正本（`AGENTS.md` / `pm-review`）を先行変更し、#133で実効・貼付用ルールを同期
- **Cursor非変更**: `.cursor/rules/ai-workflow.mdc` と `docs/harness/roles/cursor.md` は現mainで
  `AGENTS.md` 参照型であり独自の旧契約を持たないため変更しない
- **ask≠v2 record**: `.claude/settings.json` の `ask` はローカル権限の追加防御。v2承認recordの代替ではない
- **#133 merge後の全面適用**: #133がmerge/完了し同期完了記録がGitHub上で確認できた時点で
  `approval_contract_sync_pending` を解除し、#133以外の新規高リスク案件へv2契約を全面適用
- **カテゴリ③**: 権限・パイプライン自己変更（`CLAUDE.md` / role文書の同期はカテゴリ③ high-risk）

## 採用しない方針 / 却下した代替案

- **#134 mergeだけで同期完了とみなす案**: 実効ファイルに旧契約が残るため却下
- **cursor.md / ai-workflow.mdc の同時変更**: AGENTS参照型で独自旧契約がないため不要
- **`.claude/settings.json` の権限値変更**: askは維持し、文書上の意味づけのみ同期

## 判断理由

- 正本と実効ルールの乖離を解消し、どのAI経路でも同じ承認順序を強制できる
- Cursor側は既にAGENTS参照型のため、変更せず二重定義を避ける
- settings JSONは機械壁として維持し、v2 recordとの役割分離を文書で明確化

## リスク（不可逆4カテゴリの該当有無）

カテゴリ③に該当（AI実効ルール・貼付用role文書の権限・パイプライン契約同期）。

## 影響範囲

- `CLAUDE.md`
- `docs/harness/roles/chatgpt.md` / `codex.md` / `claude-code.md`
- 本 Decision Log
- 変更しない: `AGENTS.md` / `pm-review` / `ai-workflow.mdc` / `cursor.md` / `.claude/settings.json`

## 取り消し手順

1. 本Issueの実装PRを `git revert`
2. 上記5ファイルを旧契約へ戻す
3. 本 Decision Log エントリの Status を `Superseded` に更新
4. #134正本との整合をCodex PMが再確認

## 見直す条件

- #133が中止・仕様変更された場合はCodex PMへ戻す
- 将来、verdict parser / 機械state machine実装が必要になった場合は別Checkpoint
- `.claude/settings.json` またはCursor実効ルールの変更が必要と判明した場合はmanifest拡張せず再評価

## 次アクション

- [ ] #133 PR merge後、`approval_contract_sync_pending` 解除を記録
- [ ] 通常の新規高リスク案件へv2契約を全面適用

---

# Decision: Cursor一時scratch配置とcleanup技術ゲート・発効点分離

Date: 2026-08-07
Status: Proposed
Related Issues: #54
Related PRs: #132

## 決定事項

Cursorの一時ファイルをOS identity由来のtrusted home配下のrun固有scratch
（`CACHE_ROOT=<TRUSTED_HOME>/.cache`、`SCRATCH_BASE=<CACHE_ROOT>/ai-harness-scratch`、
`RUN_ROOT=<SCRATCH_BASE>/<repo_slug>/<run_id>/`）に限定する。
`LOCK_ROOT`（`<SCRATCH_BASE>/.locks/<repo_slug>/`）と `RUN_ROOT` は兄弟系統であり、
`COMMON_PREFIX`（`TRUSTED_HOME→CACHE_ROOT→SCRATCH_BASE`）、
`LOCK_CHAIN`（`TRUSTED_HOME→CACHE_ROOT→SCRATCH_BASE→LOCK_BASE→LOCK_ROOT→RUN_LOCK`）と
`RUN_CHAIN`（`TRUSTED_HOME→CACHE_ROOT→SCRATCH_BASE→RUN_BASE→RUN_ROOT`）を別々に検証する
（単一 `PATH_CHAIN` ではない）。
writerは lock 系 directory（`CACHE_ROOT`/`SCRATCH_BASE`/`LOCK_BASE`/`LOCK_ROOT`）だけを限定 bootstrap し、
`RUN_LOCK` 取得後に `RUN_BASE`/`RUN_ROOT` を作成する。既存 safe `RUN_ROOT` は
`run_root_collision` で blocked（再利用・resume 禁止）。
**新規 `RUN_ROOT` ごとに OS/runtime 標準 CSPRNG で fresh 256-bit `instance_nonce` を生成し、
create-new の `RUN_INSTANCE_MARKER`（`scratch-instance/v1`）へ保存・read-back 検証後にのみ payload を書く。**
**`repo_slug` / `run_id` は path/lock 識別子のみ。provenance 証明に単独では使わない。**
**completion は `scratch-completion/v2`（`instance_commitment` のみ公開。`instance_nonce` は GitHub へ出さない）。
`scratch-completion/v1` は cleanup provenance として受理しない。**
writerとcleanupは同一 `RUN_LOCK` を OS標準の排他プリミティブで必ず取得する
（repo内lock実装ファイル・daemon・DBは追加しない）。
Linux/WSLのbind mount判定は device ID 照合だけに依存せず mount table/mountinfo を用い、
評価不能は `path_safety_unknown` で blocked。
cleanupは filesystem 上に新規 directory/file/lock を一切作成しない read-only 契約。
cleanup inventory は `run-inventory/v1` canonical recursive snapshot（`RUN_INSTANCE_MARKER` を含む。
pre/post で
`inventory_version`/`inventory_digest`/`entry_count` を exact 比較。不一致は `inventory_changed`）。
cleanup は `RUN_ROOT` と全 descendant へ recursive path safety を適用する（nested mount/bind mount/
reparse 拒否）。
Windows cleanup は既存 lock file のみ open し `OpenOrCreate` を使わない。

identity-root resolverを次で固定する。

- **Windows native**: current SID（`WindowsIdentity.GetCurrent().User.Value`）→
  同一SIDの唯一の `Win32_UserProfile.LocalPath` を `TRUSTED_HOME`。
  排他は `FileShare=None` 相当のexclusive FileStream。
- **Linux / WSL**: `id -u` → `getent passwd <CURRENT_UID>` 第6フィールドを `TRUSTED_HOME`。
  排他は non-blocking exclusive `flock`。

`USERPROFILE` / `HOME` / `~` 等の環境由来homeは正本にせず、不一致・解決不能・unsupported OSでは
scratch作成もcleanup候補化もしない（`scratch_created=false`、run側 mkdir/writeより前に停止）。
scratch初回write前にOS別path safety（symlink/reparse/mountpoint/owner/mode/ACL/special/
canonical境界）を検証する。Linux/WSLでは mount table/mountinfo で bind mount を判定し、
device ID 照合だけを mount 不在の十分条件にしない。

provenanceの権威入力はrun終了時の **exact GitHub `scratch-completion/v2` 1件** と
local `scratch-instance/v1` marker から再計算した `instance_commitment` の exact 一致とする。
`record_type=scratch-completion/v2`、`repo_full_name`、`repo_slug`、`run_id`、
相対 `scratch_rel=.cache/ai-harness-scratch/<repo_slug>/<run_id>/`、
`instance_commitment=sha256:<64 lowercase hex>`、`run_state=completed`、
**`residue=present`**（`residue=none` は writer 正常フローでは禁止。A9到達時には `RUN_ROOT` と
`RUN_INSTANCE_MARKER` が存在するため通常到達不能であり、`none` を成立させる別 writer フローは
新設しない）を照合する。**`scratch-completion/v1` は受理しない。v1 から instance binding を
推測・補完・昇格しない。** **`run_id` 単独は provenance 証拠にならない。**
`instance_nonce` は GitHub へ書かない。旧仕様の canonical absolute scratch root を
GitHubへ記録する方式は撤回し、absolute local home path・個人情報はGitHubへ書かない。

**（再仕様化v3・safe create/lock identity binding）** writerが新規作成するdirectory（`CACHE_ROOT`/
`SCRATCH_BASE`/`LOCK_BASE`/`LOCK_ROOT`/`RUN_BASE`/`RUN_ROOT`）は、process umaskや既定ACLに安全性を
委ねず、Linux/WSLはrequested/observed mode `0700` 固定、Windowsは作成時点からcurrent SID/SYSTEM/
BUILTIN\Administrators以外へwrite/modify/delete相当を与えないowner/DACLを要求し、作成直後に同一OS検査で
再検証する。`RUN_LOCK` の取得は曖昧な `OpenOrCreate` 一発ではなくcreate-new/open-existingを区別し
（Linux/WSL新規lockは `0600` 固定）、**取得直後にopened handleのfile identity（Linux: device+inode／
Windows: `FILE_ID_INFO`相当）と現在の `RUN_LOCK` path entryのfile identityをexact比較する**。
writerはcompletion record作成直前にも同じ比較を行い、cleanupはpre-approval取得直後と
post-approval再取得直後・**最初の削除mutation直前**の計4箇所で同じ比較を行う。不一致・判定不能は
`path_safety_failed`/`path_safety_unknown` としてmutationへ進まない。同一opened lock handleは
削除完了確認まで保持する。

通常作業中はcleanupせず、cleanupはexact `RUN_ROOT` 1件に対しidentity・exact provenance・
path safety・inventory・`RUN_LOCK` 取得を含むread-only技術ゲート全成立後にのみ
closed questionへ進む。将来の実cleanupは別 `execution` scope の v2 人間approveが必要。
approve後は既存 `RUN_LOCK` を non-blocking exclusive で再取得し、recursive path safety と
inventory をゼロから再検証し、削除完了確認までlockを保持する。
状態変化時は `approval_stale` / `inventory_changed` / `run_lock_conflict` 等で blocked
（approval再利用禁止）。
カテゴリ③（`.cursor/rules/ai-workflow.mdc` のmerge）とカテゴリ④（実cleanup）は別発効点・別scopeとする。

## 背景・課題

`.cursor/rules/ai-workflow.mdc` は `alwaysApply: true` だが、一時ファイル配置とcleanup境界が未定義。
旧Issueは「別cleanup中でないことを確認」と要求しながらlock機構をスコープ外としており、
cleanup排他が構造的に不成立だった。fail-closedのまま常時blockedに縮小するとCheckpointの
「安全確認後にcleanupのclosed questionへ到達する」目的を失う。

**再仕様化（instance binding / Codex P1/P2）**: Codex独立技術レビュー `#5263502982`（P1:
`scratch-completion/v1` が local run instance へ束縛されず cross-host/profile 誤結合可能、
P2: Decision Log/PR本文の HEAD・review disposition 未同期）と ChatGPT再判定 `#5263568325` により、
local-only 256-bit `instance_nonce` + SHA-256 `instance_commitment`、`scratch-instance/v1` marker、
`scratch-completion/v2`、v1 非受理・推測昇格禁止へ再同期した。旧 proposal `#5263051242` /
旧 approval `#5263099857` は本再仕様化後の実装許可として流用しない。新 proposal `#5263694044`、
新 `HUMAN_APPROVAL_RECORD: v2` `#5263876000`、Codex PM route `#5263894169`（route=cursor）が
本再仕様化後の実装開始正本。

**再仕様化v3（safe create / RUN_LOCK identity binding）**: fixed HEAD `1eccda8` に対する独立技術レビューで、
非outdated・未解決として次の4件が確認された。(1) 新規 `RUN_LOCK` を取得直後にmode/path-safety再検証する、
(2) A9では通常到達不能な `residue=none` を許可しない、(3) writer bootstrapで新規directoryをumask任せに
せず安全なmode/ACLで作る、(4) cleanupで取得したlock handleを検証済み `RUN_LOCK` path entryとfile identity
で束縛する。Codex PM `#5276235137` はこれらをIssue正本の不足/矛盾としてChatGPTへ再仕様化差し戻しした。
前段 proposal `#5274678076` / `implementation_start` record `#5276117459` は限定scopeの使用済み記録であり、
本再仕様化へ流用しない（実装は着手されず、fixed HEAD `1eccda8` は変更していない）。
新 canonical proposal `#5276309603`（Codex PMは「今回依頼で明示された例外担当」としてClaude Codeを
`PROPOSED_ROUTE` に提示）、新 `HUMAN_APPROVAL_RECORD: v2` `#5276357583`
（`proposed_route=claude-code` で承認）が本ラウンドの実装開始正本。

**PM補正（A0/A7/A8/B8是正）**: fixed HEAD `0840fbd` に対する追加レビューで新たに2件のcurrent threadが
確認され、Codex PM補正判断 `#5277162613` が最新read-back時点の未解決4件（A0 identity command trusted
execution、A7 marker safe mode、A8 payload安全属性、B8 child mutation binding）を同一Checkpoint内の
実装修正と判定した。共通する失敗クラスは「安全性を検証した証拠と、後続処理が触る実体が最後まで
束縛されていないこと」。A1 `GetFullPathNameW` threadは別途wontfix/resolved済みであり本ラウンドの対象外。
既存canonical proposal `#5276309603` / `HUMAN_APPROVAL_RECORD: v2` `#5276357583`
（subject=`issue:#54`、scope=`implementation_start`、route=`claude-code`）は変更なく継続利用。
新proposal・新approvalは発行していない。

**独立技術レビュー第2ラウンド（A9/B8(9)是正）**: fixed HEAD `6a11031` に対する独立技術レビュー
`#5277468171` で新たに2件のcurrent threadが確認された。(1) A9: `RUN_LOCK` identity driftで
completion作成前にblockedとなった場合、A8で作成済みのpayloadを「未作成」と誤報し残留を隠す
契約になっていた、(2) B8(9): child単位のidentity/type/path safety再確認だけでは、同一inode上の
regular fileへのin-place write（内容のみの書き換え）を検出できなかった。Codex PM判断 `#5277578620`
はこの2件をIssue #54の既存Checkpoint内の実装修正と判定し、既存canonical proposal `#5276309603` /
`HUMAN_APPROVAL_RECORD: v2` `#5276357583` を継続利用する形でroute=`claude-code`を維持した
（新proposal・新approvalは発行していない）。

**再仕様化v4（P1-2 delete target binding／Windows・Linux OS分岐）**: fixed HEAD `334b24f`
（`0549e83`是正の同期コミット）に対する独立技術レビュー`#5277901998`は、AC3を非outdated・
未解決のP1 2件で **fail** と判定した。(1) B8(9)が比較を要求する「(6)時点のchild identity」を
`run-inventory/v1` は記録していない（v1のfile entryはpath/size/hash、directory entryはpathのみ
であり、device+inode / `FILE_ID_INFO` と比較する基準値がない）。(2) Linux/WSLでchild descriptorを
検証しても `unlink` はpathnameを解決してmutationするため、再取得後に同一UIDの別processが
rename/replaceした場合、「同じdescriptorで即時unlink」という記述だけでは検証済み実体を削除対象へ
原子的に束縛できない。同HEADのChatGPT要件レビューは`REVIEW_VERDICT: approve risk=high`（Issue #54
本文および[#5278010167](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5278010167)
でのChatGPT自身の記録）であり、要件面はpass・技術面（AC3）のみCodexがfailと判定した構図だった。
Codex PM判断`#5278028614`はP1-1（既存AC3の実装詳細として閉じ得る）とP1-2（Issue正本の安全契約
不足）を明確に区別し、限定文言修正での続行を「AGENTS.mdの同一タスク2敗後3回目リトライ禁止」に
抵触すると判定して拒否、ChatGPTへ再仕様化を差し戻した。同時に既存canonical proposal
`#5276309603` / `HUMAN_APPROVAL_RECORD: v2` `#5276357583` は、P1-2が削除mutationの安全契約・
利用API・保証不能時挙動を新たに確定する仕様変更であるため、再仕様化後の実装開始へ**流用不可**と
判定した。

その後、「Cursorは現在利用可能トークンを持たず本Issueの実装を開始できない」という新しい一次入力
（`AGENTS.md` Claude Code例外委譲条件に該当）に基づき、Codex PMは新canonical proposal
`#5278352801`（`PROPOSED_ROUTE: claude-code`、scopeは更新後Issue #54の固定4ファイルと既存5AC
のみ）を発行した。人間はこの対話で `HUMAN_APPROVAL_RECORD: v2` `#5278387881`
（`proposed_route=claude-code`、`decision=approve`）としてapproveし、Codex PMはroute確定
`#5278407512`で、proposal・承認recordのfield完全一致とactive一意性を照合したうえで
`route=claude-code` の `implementation_start` を確定した。既存Cursor向けrecord `#5278202174`
（`proposed_route=cursor`）は別tupleであり、今回のClaude Code routeへは流用していない。
Issue #54本文はこの再仕様化により、B8(6)のprocess-local child identity baseline契約、B8(9)の
Windows/Linux-WSL OS別delete target binding契約、Windows nativeでの技術前提（handle-bound
`SetFileInformationByHandle`+`FileDispositionInfo`）とLinux/WSLでの技術前提
（`unlinkat`のpathname解決契約はchild FDへの直接binding手段ではない）を明記する形へ更新済み。

**再仕様化v5（6 finding是正／RUN_ROOT baseline・share条件・A8 rescan・directory accounting）**:
fixed HEAD `af7c9cd`/`96f1d96`（v4是正後）に対する追加のCodex独立技術レビュー`#5289296528`は
`REVIEW_VERDICT: request-changes risk=high`。Codex（PM）判断`#5289485250`は次の6件すべてを
成立と判定し、finding 1・3・4・5は既存Issue契約の実装・文書同期不足として**今回修正**、
finding 2・6はIssue本文の仕様不足として一度ChatGPTへ再仕様化を差し戻した（`route=mixed`）。

1. **finding 1（Windows verified handle share条件不足）**: verified handleがwrite/delete
   sharingを十分に排除する契約になっておらず、size/hash確認後からmutationまでの間に同一UID等の
   別processが内容変更・renameできる余地があった。
2. **finding 2（`RUN_ROOT`自身のidentity baseline不足）**: process-local child identity baseline
   がdescendant中心で、`RUN_ROOT` directory自身のidentity取得時点・比較対象・drift時挙動が
   未定義だった。`RUN_ROOT` rename→元pathへのreplacement作成等でdescendant検証を通過しながら
   別rootを操作できる余地があった。
3. **finding 3（A8 completion前再走査の安全性条件不足）**: A8のcompletion前再走査がB6のOS別
   recursive safety predicateと同じ強度になっておらず、Linux/WSLのnested mount/bind mount・
   mountinfo評価・ACL確認・評価不能時のfail-closedが明記されていなかった。
4. **finding 4（directory child集合条件の矛盾）**: bottom-up削除では承認済みchildを正常に削除
   すればchild集合は減少するが、現SSOTの「child集合の増減」を一律driftとして拒否する残存文言が、
   正常な削除による縮小まで`inventory_changed`にしてしまう論理矛盾を残していた。
5. **finding 5（AC4のWindows handle-based delete capability unavailable観測例不足）**:
   `docs/harness/setup.md`に、read-only検査は通過したがverified handleへの安全なdelete
   disposition capabilityを証明できないnegative scenarioが不足していた。
6. **finding 6（A8 post-write失敗時のresidue記録不足）**: payload書き込み後にA8のdescendant
   安全性再走査が失敗した場合、completion未作成だけでなく`payload_written=true`等の肯定記録が
   契約として明記されていなかった。

その後、正規PM proposal`#5289589235`（`PROPOSED_ROUTE: claude-code`、scopeは固定4ファイル）を
Codex（PM）本人が発行し、人間は`HUMAN_APPROVAL_RECORD: v2` `#5289615101`
（`proposed_route=claude-code`、`decision=approve`、`recorded_by=ChatGPT`）としてapproveした。
ChatGPTのroute確定プリフライト`#5289663239`（`@codex`宛て）を経て、Codex（PM）本人が正式route
確定`#5289667993`を投稿した。

```text
APPROVAL_SCOPE: implementation_start
APPROVAL_RECORD: https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5289615101
APPROVAL_STATE: approved
PM_VERDICT: approve risk=high route=claude-code
```

**（v5・監査履歴）** 上記 proposal `#5289589235` / approval `#5289615101` / route `#5289667993` は
v5実装の監査履歴として本文に残すが、**superseded**——2026-08-17以降の`implementation_start`へは
**非流用**（v6再仕様化およびv6是正ラウンドの正本proposal/approval/routeへ差し替え済み）。

本ラウンド（v5）より前のproposal・approval（`#5276309603`/`#5276357583`、`#5278352801`/`#5278387881`
を含む）は、v5再仕様化に伴う`implementation_start`としては流用しない。

**再仕様化v6（pre-write target binding／A7 marker + A8 payload）**: fixed HEAD
`4c3effe6f0f5809ec3848d5db069c5a517b67969`（PR #132 current HEAD）に対するCodex独立技術レビュー
`#5291297447`は `REVIEW_VERDICT: request-changes risk=high`。current P1
[`discussion_r3782248568`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3782248568)
は、A8がpayload pathnameへの最初のwrite前にfresh target bindingを要求しておらず、同一UIDの
非協調processが外部fileへのhard linkを先置きするとpathname write/truncateが`RUN_ROOT`外の
既存実体を書き換え得ると指摘した。同HEADのcurrent P1
[`discussion_r3782373045`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3782373045)
は、`RUN_INSTANCE_MARKER`のcreate-new後にpathnameを再openしてschema writeし得る同型の欠陥を
指摘した。Codex（PM）判断`#5291492454`はこれらをvalidと判定し、単なるSSOT同期漏れではなく
**Issue #54のpre-write target binding契約不足**としてChatGPTへ再仕様化を差し戻した。wontfix /
後回しは採用していない。本再仕様化では「writer-created regular artifactへの最初のwriteは
create-newで得た実体へ束縛する」という共通契約にA7/A8を統合する。

canonical proposal `#5289589235` / `HUMAN_APPROVAL_RECORD: v2` `#5289615101` / route確定
`#5289667993` を含め、**本2026-08-17 v6再仕様化より前のproposal / implementation_start approvalは
流用しない**（v5分は上記「（v5・監査履歴）」のとおり superseded・非流用）。旧v6 proposal
[`#5311085139`](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311085139)、
旧 `HUMAN_APPROVAL_RECORD: v2`
[`#5311256262`](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311256262)、
旧 Codex PM route確定
[`#5311265605`](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311265605) も、
**v6是正ラウンド（下記）の`implementation_start`へは非流用**（監査履歴として残す）。
新canonical proposal
[`#5311558125`](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311558125)、
新 `HUMAN_APPROVAL_RECORD: v2`
[`#5311600611`](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311600611)
（`proposed_route=cursor`、`decision=approve`）、Codex PM route確定
[`#5311611273`](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311611273)
（`route=cursor`）が本ラウンド（v6是正）の実装開始正本。review base HEAD:
`56def48cfecff031d2d2c6a35a3971c320e7bdd7`。

```text
APPROVAL_SCOPE: implementation_start
APPROVAL_RECORD: https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311600611
APPROVAL_STATE: approved
PM_VERDICT: approve risk=high route=cursor
```

**（v6）実装（pre-write binding・2026-08-17）**: 固定4ファイルへ A7 `RUN_INSTANCE_MARKER` / A8 payload regular file の
pre-write create-new + same-handle binding 契約、setup.md 否定例3件、fail-closed 8の
`verify-before-mutate` / `concurrency-interrupt-residue` 同期、cursor.md 最小同期を反映
（実装tip `c9f2663915a0d263e08e6be45e79c11606df626a`。検証結果は下表。decisions同期tip `56def48`）。

**（v6是正）実装**: 固定4ファイルへ A7 pre-write identity照合（content write前停止）・
A7 post-write residue肯定記録、setup.md AC1/residue観測例、decisions.md v5 superseded明示・
v6レビュー/read-back実状態同期を反映（実装tip cfe6154。検証結果は下表。本同期コミットで記録）。

本ラウンド（v6是正）より前のproposal・approval（`#5289589235`/`#5289615101`/`#5289667993`、
`#5311085139`/`#5311256262`/`#5311265605` を含む）は、v6是正の`implementation_start`としては
**非流用**（v5は**superseded**監査履歴）。Cursorは実装担当としてこの委任を受け、
Codex（PM）の役割・route判定・承認record検証を代理・自称しない（記録者は`Cursor`）。

## 採用する方針

- **最小run固有排他を仕様スコープへ戻す**: OS標準lockのみ。repo内script/daemon/DB/packageは追加しない
- `.cursor/rules/ai-workflow.mdc` にidentity-root・`LOCK_CHAIN`/`RUN_CHAIN` 別検証・
  lock bootstrap限定・`RUN_LOCK` 取得後run側作成・exact completion record・
  cleanup read-only gate（A0–A9/B0–B8制御順序）を短く追記
- `docs/harness/roles/cursor.md` は正本参照を維持し設計意図・chain分離・lock bootstrap順序のみ同期
- `docs/harness/setup.md` にfresh bootstrap成功・bootstrap安全性不明・bind mount判定不能・
  lock/run chain分岐・cleanup missing path・post-approve drift・否定例・fail-closed 8基準の実装後照合記録
- provenanceはpath名推測禁止。exact GitHub record + local再検証の組み合わせ
- Windowsはcurrent SIDと `Win32_UserProfile.LocalPath` の対応をルール契約として記述
- **（v3）** 新規directory作成はLinux/WSL `0700`・Windows safe owner/DACLをrequested値として固定し、
  作成直後に同一OS検査で再検証する（umask/既定ACL任せにしない）
- **（v3）** `RUN_LOCK` はcreate-new/open-existingを区別して取得し、取得直後・completion直前
  （writer）／取得直後・post-approval再取得直後・削除mutation直前（cleanup）の計4箇所で
  opened handleと現在のpath entryのfile identityをexact比較する
- **（v3）** completion v2のwriter正常フローは `residue=present` のみを許可する
- **（PM補正）** Linux/WSL identity-root解決を`PATH`検索の`id`/`getent`から、syscall/NSS APIまたは
  実体検証済み絶対パスcommandへ固定する（`PATH`差し替え・shadowing経路を正本にしない）
- **（PM補正）** `RUN_INSTANCE_MARKER`をLinux/WSL `0600`固定・Windows safe owner/DACLで作成し、
  作成直後に同一OS検査で再検証する（`RUN_LOCK`と同じ規則をmarkerへも適用）
- **（PM補正）** payload descendantをcleanup（B6）互換の安全属性で作成し、completion record作成前に
  全descendantを再走査する。unsafe/判定不能が1件でもあればcompletion recordを作らない
- **（PM補正）** cleanup削除時、`RUN_LOCK`のhandle/path identity再確認に加え、approve後に取得した
  inventoryの各child entryについてもno-follow実体identityをmutation直前に個別再確認する
- **（A9/B8(9)是正）** A9でlock identity driftによりblockedとなった場合、A8で作成済みのpayloadを
  `payload_written=false`等と誤報しない。payloadは残留し得る状態として保持し、completionのみ
  未作成のまま自動delete/repair/resumeへ拡張しない
- **（A9/B8(9)是正）** B8(9)のchild単位識別確認に、regular fileの`size_bytes`/`sha256_lower_hex`を
  既存`run-inventory/v1`とexact再照合する手順と、directoryのmutation直前child集合再列挙を追加する。
  内容/集合不一致は既存`inventory_changed`へ収束させ、新しいinventory versionは作らない
- **（v4）** B8(6)で公開`run-inventory/v1`とは別に、process-local・非公開のchild identity
  baseline（`child_identity_map[path_b64] = {entry_type, identity}`）を`RUN_INSTANCE_MARKER`を
  含む全descendantについて取得し、B8(9)の child 単位比較元とする。GitHub・completion record・
  公開inventory・ログへidentityは出さない
- **（v4）** Windows nativeの削除mutationは、削除直前に取得したverified handle（identity/type/
  owner/DACL/reparse/canonical boundaryとsize/hashを同一handle上で再確認済み）に対する
  `SetFileInformationByHandle` + `FileDispositionInfo`相当のhandle-based dispositionでのみ許可し、
  pathname-only `DeleteFile`/`RemoveDirectory`をbinding根拠にしない。B8(6)時点の対象が別実体へ
  差し替わっていた場合はpathnameを追跡して削除しない
- **（v4）** Linux/WSLは、現在のthreat modelで同一UIDの非協調processによるrename/replace/writeを
  排除しないため、identity/content/provenance/lock等すべてのread-only checkがpassしても、現在
  許可されたOS/runtime標準APIだけでは検証済みchild実体と実delete mutation対象を原子的に束縛
  できないと判断し、削除mutationを行わずに`path_safety_unknown`で停止する契約へ固定する
- **（v5・finding 2）** B8(6)でprocess-local baselineとして`RUN_ROOT`自身の`run_root_identity`を
  child mapとは別に必須取得し、B8(9)の各mutation candidate処理直前にcurrent `RUN_ROOT`を
  baselineとexact比較する。不一致（rename/replacement等）は`path_safety_failed`、証明不能は
  `path_safety_unknown`とし、後段のOS別delete capability判定でこの前段失敗を上書きしない
- **（v5・finding 1）** Windows nativeのverified handleは、write/delete sharingを許可しないか
  OS/APIとして同等の安全性を証明できるshare条件で取得する。既存handleとのshare conflict等で
  target bindingを証明できない場合は`path_safety_unknown`でmutation前に停止する
- **（v5・finding 3）** A8のcompletion前descendant再走査を、B6と同一のOS別recursive safety
  predicate（Linux/WSLのnested mount/bind mount・mountinfo評価・ACL確認・評価不能時fail-closedを
  含む）へ明示的に揃える
- **（v5・finding 4）** directory child集合の再確認で拒否する対象を、承認snapshot外の新規entry・
  削除対象として検証済みのchildの残留・置換/type/content/identity/safety drift・列挙不能へ限定し、
  bottom-up削除による正常なchild集合の減少はdriftとして扱わない
- **（v5・finding 5）** `docs/harness/setup.md`にWindows handle-based delete capability
  unavailableの否定例を追加し、`delete_attempted=false`/`approval_reusable=false`が観測できる
  ようにする
- **（v5・finding 6）** A8のpayload write後recursive safety失敗でも、`payload_written=true`
  `completion_record_created=false` `result=blocked` `auto_cleanup=false` `auto_repair=false`
  `auto_resume=false`を肯定記録し、completion未作成をresidue不存在の根拠にしない
- **（v6）** `RUN_INSTANCE_MARKER` と payload regular file の最初のcontent writeは、atomic
  create-new / no-overwrite で得た同一 handle/descriptor へ束縛する。create-new 後の pathname
  再 open による初回 write / truncate は禁止。expected pathname への既存 entry（外部 file への
  hard link 先置き含む）は open/truncate しない。pre-write binding を証明不能・不一致なら当該
  write 前に `path_safety_failed` / `path_safety_unknown` で blocked。A7 失敗時は A8 未進入
- **（v6）** payload へ1回でも write mutation 成功後の後続失敗は `payload_written=true`
  `completion_record_created=false` `result=blocked` を肯定記録（残留を隠さない）
- **（v6是正・AC1）** A7のcreate-new成功後、marker content writeの**前に**current path entry
  identityと`WRITE_TARGET`（handle）identityを照合する。不一致→content writeしない・
  `path_safety_failed`・A8未進入。一致証明不能→`path_safety_unknown`でwrite前停止・A8未進入。
  pathname再openによる初回content writeを正常経路へ戻さない
- **（v6是正・finding P2）** A7のmarker content write完了後にread-back/decode/schemaが失敗した場合、
  `run_root_created=true` `instance_marker_created=true` `payload_written=false`
  `completion_record_created=false` `result=blocked`を肯定記録する。
  `auto_cleanup=false` `auto_repair=false` `auto_resume=false`。作成済みmarker/residueを
  未作成扱い・省略で隠さない（既存`provenance_unknown`等へ収束可。新stop/schema禁止）
- **（v10）** writer の fresh 成功経路（A7/A8 最初の content write 成功）は `platform=windows_native`、
  または `leaf_containment_capability=demonstrated` を現行の同一 UID/SID 非協調 process 脅威モデルに
  対し OS/API として実証できる環境に限定する
- **（v10）** Linux/WSL の現行契約プリミティブ（open descriptor / `flock` / file mode /
  ancestor・`RUN_ROOT` binding）だけでは `leaf_containment_capability=demonstrated` にならず、
  A7/A8 最初の content write 前に既存 `path_safety_unknown` で blocked とする
- **（v10）** `discussion_r3795298185` / `discussion_r3800278015` で指摘された fail-closed 契約と
  Linux/WSL 無条件 writer 成功例の矛盾を `.cursor/rules/ai-workflow.mdc` と `docs/harness/setup.md`
  の双方で解消する

## 採用しない方針 / 却下した代替案

- **単一 `PATH_CHAIN`（`LOCK_ROOT`→`RUN_ROOT` 直結）**: 兄弟系統を誤検証するため却下
- **device ID 照合だけでの mount/bind mount 判定**: bind mount 迂回リスクのため却下
- **cleanup への writer missing-component 作成規則の流用**: read-only 境界違反のため却下
- **cleanup での `OpenOrCreate`**: missing lock を暗黙作成するため却下
- **追加resolver script・package・daemon・repo内lock実装ファイル・provenance DB**: 4ファイル文書のみで表現するため却下
- **環境変数homeを正本化**: 偽装リスクのため却下
- **canonical absolute scratch rootのGitHub記録**: 個人情報・absolute path漏洩リスクのため撤回
- **lock競合時のsteal・待機・lock file削除による突破**: 誤cleanupリスクのため却下
- **本PRでの実cleanup**: カテゴリ④は別発効点のため却下
- **固定manifest外ファイルの追加**: Issue境界を超えるため却下
- **環境変数優先またはOS側無条件優先の不一致fallback**: 両方禁止
- **fail-closedのままcleanupを常時blockedに縮小**: Checkpoint目的と矛盾するため却下
- **（v3）曖昧な `OpenOrCreate` 一発での `RUN_LOCK` 取得**: create/existingが不分離のままだと
  取得直後の対象file特定が曖昧になりTOCTOU（取得後のpath差し替え）を検出できないため却下
- **（v3）writer正常フローでの `residue=none` 受理**: A9到達時は `RUN_ROOT`/marker が存在し
  通常到達不能な状態を記録することになり、誤ったresidue無し記録を許すため却下
- **（v3）新規directory作成時のumask/既定ACL依存**: 環境のumask設定次第でmodeが変動し
  非決定的な安全性になるため却下し、requested modeを明示固定した
- **（PM補正）identity-root解決を`PATH`検索の`id`/`getent`へ依存させること**: 差し替え・shadowing可能な
  実行経路を正本にするとHOME偽装と同種のリスクが残るため却下
- **（PM補正）marker/payloadの作成属性をumask/既定ACLへ委ねること**: `RUN_LOCK`/directoryと同じ理由で
  非決定的になるため却下し、markerは`0600`固定・payloadはcleanup互換属性へ固定した
- **（PM補正）削除mutation直前を`RUN_LOCK`のhandle/path identity再確認だけで済ませること**: lockの
  identityとdescendant個々の実体は別物であり、inventory取得後に子要素が差し替えられる経路を
  閉じられないため却下し、child単位のno-follow実体identity再確認を追加した
- **（A9/B8(9)是正）A9のlock drift時に「payload/completionとも未作成」と一律報告すること**: A8が
  既に成功していればpayloadは実在するため、実在する残留を偽って否定するfabricationになるため却下した
- **（A9/B8(9)是正）B8(9)をidentity/type/path safetyの再確認のみで完結させること**: 同一inode上の
  in-place writeやdirectory child集合の増減はidentity不変のまま発生しうるため検出できず、
  size/SHA-256再照合とchild集合再列挙を追加した
- **（A9/B8(9)是正）payload/inventory不一致検出に新しいstop_reasonを追加すること**: 既存
  `inventory_changed`で意味的に閉じられるため、新規stop_reasonの追加は不要と判断し却下した
- **（v4）検証済みdescriptorを保持して直後にunlinkする方式を安全根拠にすること**: Codex独立技術
  レビュー`#5277901998`のP1-2で、rename/replace競合下では時間・協調性の仮定に過ぎず原子的
  bindingにならないと指摘されたため却下した
- **（v4）`openat2`のRESOLVE_*によるinspectionを後続pathname deleteのidentity binding保証として
  扱うこと**: path解決時の安全性は高めるが、後続のpathname deleteを同一inodeへ束縛する代替には
  ならないため却下した
- **（v4）Linux/WSLの削除mutationを人間approvalだけで許可すること**: 人間approvalは技術的束縛
  保証の代替にならないため却下した
- **（v4）Linux/WSLの実cleanupを成立させるための新helper/runtime/isolationを本Checkpointへ
  追加実装すること**: 固定4ファイル・文書契約のみというIssue #54のscope外であるため却下し、
  必要になった場合は別Checkpointへ分離する
- **（v4）P1-2再仕様化前の既存canonical proposal `#5276309603` / approval `#5276357583`を
  そのまま実装開始承認として流用すること**: 削除mutationの安全契約・利用API・保証不能時挙動を
  新たに確定する仕様変更であり、承認対象proposalの内容自体が変わるため却下し、新proposal
  `#5278352801` / 新承認 `#5278387881` を取得した
- **（v5・finding 4）「child集合の増減」を一律driftとして拒否する契約**: 上記「（A9/B8(9)是正）」
  時点ではin-place write検出とchild集合変化検出を同列に導入する目的で採用したが、bottom-up削除
  では承認済みchildの正常な削除自体がchild集合を減少させるため、この一律拒否は現在の規範契約では
  **superseded**（優先度が上位の会計条件（承認snapshot外の新規entry・検証済みchildの未削除残留・
  置換/drift/列挙不能の個別検出）へ置き換え済み）。「（A9/B8(9)是正）」の却下理由テキスト自体は
  当時の判断記録として残すが、現在の規範は`.cursor/rules/ai-workflow.mdc` B8(9)の会計条件であり、
  「child集合の増減」という文言で一律拒否する契約はこのIssueでは採用しない
- **（v5・finding 1）read sharingのみでwrite/delete競合を防げるとみなすこと**: read shareを
  許可しても他processのwrite/delete/renameを排除できなければtarget bindingが証明できないため
  却下し、write/delete sharingを排除するか同等の安全性を証明できる条件を要求する
- **（v5）`renameat2`等を用いたquarantine/交換方式を、本Issue内で検証なしに新しい安全根拠として
  採用すること**: 未検証の新方式をfail-closedの代替根拠にはできないため却下し、Linux/WSLの実
  cleanup有効化は別Checkpointでの設計・Codex PM評価を要求する
- **（v5・finding 6）A8 post-write failureを契機とした自動cleanup/repair/resume**: 残留状態を
  肯定記録することと、そこから自動的に後続処理を進めることは別問題であり、後者は誤った自動復旧の
  リスクを生むため却下し、`auto_cleanup=false` `auto_repair=false` `auto_resume=false`を明示する
- **（v10）platform 名・Linux/WSL で lock 取得成功だけを根拠に fresh writer 成功経路（marker/payload
  content write・completion 作成）へ進むこと**: `leaf_containment_capability=demonstrated` を
  OS/API 実証できない環境での content write は fail-closed 違反のため却下
- **（v10）Linux/WSL で leaf containment を成立させる helper / isolation / runtime / daemon を
  本 Checkpoint へ追加すること**: 固定4ファイル scope 外のため却下し、別 Checkpoint へ分離
- **（v10）v9 以前の `implementation_start` / merge approval / route record を本ラウンドへ流用すること**:
  非流用（v10 は新 proposal / approval / route に基づく）

## 判断理由

- writerとcleanup間の排他は明示的な共有lockなしでは証明できないが、OS標準プリミティブだけで足りる
- identity-rootをOS由来で固定し、環境変数偽装への否定例を文書化することで、誤cleanupの主要経路を閉じる
- exact GitHub completion record（相対path）とlocal再検証を組み合わせ、path単独推測を禁止する
- 技術ゲートと人間approveを分離し、approveがゲートを代替しない契約を明示する
- 文書正本化のみで実装・テスト・PRを先行し、merge（カテゴリ③）と実cleanup（カテゴリ④）を分離する

## リスク（不可逆4カテゴリの該当有無）

- カテゴリ① 非該当（absolute homeのGitHub記録を撤回し個人情報リスクを低減）
- カテゴリ② 非該当
- カテゴリ③ **該当**（`.cursor/rules/ai-workflow.mdc` 正本変更）
- カテゴリ④ 本PR実装は非該当。将来の実cleanupは**別発効点で該当**

`risk=high`。実装は v2 `implementation_start` 承認後に実施。merge は独立レビュー・
`HIGH_RISK_TECH_GATE: passed` 後の merge scope 人間approveが必要。
本PRのmerge承認はカテゴリ④の実cleanupへ流用しない。`implementation_start` / merge record を
cleanup execution に流用しない。

## このPRの最悪の失敗は何か・それは戻せるか

1. **lock / provenance / path safetyの契約が誤り、同時writerまたは別cleanupを見逃し、
   利用中・別run・別filesystemのデータをcleanup対象にする**:
   ルール変更は `git revert` で戻せるが、誤cleanupの外部影響は完全復旧不能の可能性がある。
2. **lockを過剰に厳しく定義しscratch/cleanupが常時fail-closedで停止する**:
   可逆。誤削除より優先する設計判断。

## 影響範囲

- `.cursor/rules/ai-workflow.mdc`
- `docs/harness/roles/cursor.md`
- `docs/harness/setup.md`
- `docs/decisions.md`（本エントリ）

## 例外条件

原則なし。`id` / `getent` / `Win32_UserProfile` / `flock` / exclusive FileStream が
利用不能な環境はfail-closedで停止し、新resolver実装はIssue外設計変更としてCodex PMへ戻す。

## 取り消し手順

1. 実装PRをrevertする
2. 上記4ファイルの本Issue由来変更を戻す
3. 本 Decision Log の Status を `Superseded` へ更新する
4. runtime `RUN_LOCK` fileは活動証明ではないため、revertだけを理由に自動削除しない
5. 外部影響が既にある場合はrevertだけで復旧済みとみなさず、別Issueで影響調査する

## 見直す条件

- Windows / Linux・WSL以外のOSで同等resolverが必要になった場合
- 追加script・lock daemon・provenance DBが必要と判明した場合（別Checkpoint）
- 文書契約だけでは活動中run・inventory変化を観測できないと実測で判明した場合

## レビュー記録

| 項目 | 結果 | 証跡 |
|---|---|---|
| Draft PR | 作成済み | PR #132 |
| canonical proposal（再仕様化後） | 固定 | #5263694044 |
| HUMAN_APPROVAL_RECORD: v2 | implementation_start approved | #5263876000 |
| Codex PM route（再仕様化後） | route=cursor | #5263894169 |
| 旧 canonical proposal | **非流用**（再仕様化前監査記録） | #5263051242 |
| 旧 `implementation_start` approval | **非流用**（再仕様化前監査記録） | #5263099857 |
| 旧 Codex PM route | inactive（旧proposal用） | #5263113733 |
| Codex独立技術レビュー（P1/P2指摘時） | request-changes risk=high | #5263502982 |
| ChatGPT再判定（P1 supersede） | request-changes risk=high | #5263568325 |
| ChatGPT要件レビュー（本実装 fixed HEAD） | **未実施** | implementation tip `a3aeac8` 待ち（AC5未充足） |
| Codex独立技術レビュー（本実装 fixed HEAD） | **未実施** | 同上 |
| `HIGH_RISK_TECH_GATE` | blocked / pending | 両レビュー完了前に進まない |
| merge scope | 未承認 | `HIGH_RISK_TECH_GATE: passed` 後 |
| `settings_apply` | 未承認 | — |
| `execution` / 実cleanup | 未承認・未実行 | カテゴリ④別 scope |
| implementation tip | `a3aeac84725cd7be0313c2049dabb48651b41c94` | instance binding 実装（中間 `e8658f0` は権威化しない） |
| Fail-closed success propagation @ `a3aeac8` | **success** | run `31577773018` |
| Issue manifest diff @ `a3aeac8` | **FAIL** `manifest_missing` | run `31577792954`。Issue #54 本文に `issue-change-manifest:v1` 欠落。復旧は Issue 本文更新（固定4ファイル外）→ Codex PM |
| Issue #54 本文 `issue-change-manifest:v1` 復旧 | 完了 | 固定4ファイルmanifestとして復旧済み（Codex PM route再評価 #5264655488 で照合済み） |
| PR #132 本文構造復旧 | 完了 | 本文が単一行化・文字化けしていた構造破損を、ChatGPTがmetadataのみで復旧（HEAD変更なし） |
| **現 fixed tip（PR #132 HEAD）** | `1bd64cb19b5187a1ba104f8fd3dd09c1c6f3d577` | tip `a3aeac8` と CI disposition を同期したdocsコミット。以後 manifest復旧・本文復旧を経てもHEAD不変 |
| Fail-closed success propagation @ `1bd64cb` | **success** | run [31578332485](https://github.com/kikujizo/ai-harness/actions/runs/31578332485) |
| Issue manifest diff @ `1bd64cb` | **success** | run [31580948676](https://github.com/kikujizo/ai-harness/actions/runs/31580948676)（manifest復旧・PR本文復旧後の再実行） |
| ChatGPT要件レビュー（fixed HEAD `1bd64cb`） | **request-changes** risk=high | [#5264631720](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5264631720)。AC1/AC2/AC3/AC5 ○、**AC4 ×**（本Decision Logの最終HEAD・CI・review disposition未同期） |
| Claude Code 例外委譲（CI復旧確認・記録限定） | 完了 | [#5264479320](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5264479320) 委譲 → [#5264545733](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5264545733) 記録 |
| Codex PM route再評価（AC4修正のactor候補） | `PM_VERDICT: approve risk=high gate=human_approval` / `PROPOSED_ROUTE: claude-code` | [#5264655488](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5264655488) / proposal本文 [#5264648223](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5264648223)。既存承認 `#5263876000`（`proposed_route=cursor`）はactor変更へ流用不可のため新規承認が必要と判定 |
| HUMAN_APPROVAL_RECORD: v2（route=claude-code, scope=docs/decisions.md最小同期） | **approve** | [#5264680032](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5264680032)。`docs/decisions.md`のみが対象。他3ファイル・merge・settings_apply・execution・実cleanupへは流用しない |
| fixed HEAD `1bd64cb`以降の再要件レビュー・独立技術レビュー | **superseded** | 上記4件は完了前にv3再仕様化（下記）へ差し替わり、fixed HEADが `1eccda8` へ進んだため対象外。旧HEAD `1bd64cb`向けの指摘はv3実装で個別に再確認する |
| **（v3再仕様化）** Codex独立技術レビュー（新規4指摘の確認） | 未解決4件を特定 | #5276235137（新規`RUN_LOCK`再検証・A9 `residue=none`拒否・writer safe mode/ACL・cleanup handle/path binding） |
| 旧 canonical proposal（v3前段） | **非流用**（実装未着手のまま差し替え） | #5274678076 |
| 旧 `implementation_start` approval（v3前段） | **非流用**（実装未着手のまま差し替え） | #5276117459 |
| 新 canonical proposal（v3） | 固定 | #5276309603 |
| HUMAN_APPROVAL_RECORD: v2（v3, route=claude-code, scope=implementation_start） | **approve** | #5276357583 |
| **v3実装開始時HEAD** | `1eccda8558a57138a9382811301c40d18341fad4` | 独立技術レビュー時点のblocked HEAD。本ラウンドの実装起点 |
| **v3実装tip** | `7a24e94a42b9cdd69d615122864023adca7558b0` | safe create・RUN_LOCK identity binding・cleanup pre/post binding・`residue=present` only を固定4ファイルへ反映したコミット |
| Issue manifest diff @ `7a24e94` | **pass** | ローカル実行: `manifest_change_count=4` `actual_change_count=4`（`node harness/checks/issue-manifest-diff.cjs --repo kikujizo/ai-harness --issue 54 --head 7a24e94a42b9cdd69d615122864023adca7558b0`）。GitHub Actions run IDはCI実行後にPR側で別途確認する |
| Fail-closed success propagation @ `7a24e94` | **pass** | ローカル実行: `applicable=false` `checked_file_count=0`（対象拡張子`.sh/.js/.cjs/.mjs/.yml/.yaml`が今回diffに含まれないため）。GitHub Actions run IDはCI実行後にPR側で別途確認する |
| `git diff --check origin/main...HEAD` @ `7a24e94` | **success**（exit 0） | ローカル実行確認 |
| Codex独立技術レビュー（fixed HEAD `238ae78`） | **request-changes** risk=high | [#5276711835](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5276711835)。AC2/AC3/AC5 ○、**AC1 ×**（`docs/harness/setup.md`のWindows writer成功例が`OpenOrCreate`陽性記述のままA5契約と矛盾） |
| Claude Code による `docs/harness/setup.md` 修正 | 完了 | Windows writer成功例をA5のcreate-new/open-existing+handle/path identity binding契約へ同期。他3ファイル無変更 |
| **fixed tip** | `0840fbdf0d6e60b6c5bd2aae76ce327440c57ddb` | `OpenOrCreate`陽性記述の同期修正コミット |
| Issue manifest diff @ `0840fbd` | **success** | ローカル実行: `manifest_change_count=4` `actual_change_count=4` |
| Fail-closed success propagation @ `0840fbd` | **success** | ローカル実行: `applicable=false` `checked_file_count=0` |
| `git diff --check origin/main...HEAD` @ `0840fbd` | **success**（exit 0） | ローカル実行確認 |
| PR #132 コメント（fixed HEAD `0840fbd`のレビュー依頼） | 記録済み | [#5276786924](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5276786924) |
| Codex PM補正判断（追加current thread 2件検出、A0/A7/A8/B8を今回修正と判定） | `PM_VERDICT: approve risk=high route=claude-code` | [#5277162613](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5277162613)。A1は別途wontfix/resolved済み。既存proposal `#5276309603`/approval `#5276357583`を継続利用、新規発行なし |
| **（PM補正）fixed tip** | `f8c80302b2b874e4e2d75602c84f144b458c86a5` | A0/A7/A8/B8補強コミット |
| Issue manifest diff @ `f8c8030` | **pass** | ローカル実行: `manifest_change_count=4` `actual_change_count=4` |
| Fail-closed success propagation @ `f8c8030` | **pass** | ローカル実行: `applicable=false` `checked_file_count=0` |
| `git diff --check origin/main...HEAD` @ `f8c8030` | **success**（exit 0） | ローカル実行確認 |
| PR #132 コメント（PM補正 fixed HEAD `6a11031`のレビュー依頼） | 記録済み | [#5277328523](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5277328523) |
| Codex独立技術レビュー第2ラウンド（fixed HEAD `6a11031`） | **request-changes** risk=high | [#5277468171](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5277468171)。A9（payload保全）/B8(9)（content binding）の2件 |
| Codex PM判断（A9/B8(9)是正） | `PM_VERDICT: approve risk=high route=claude-code` | [#5277578620](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5277578620)。既存Checkpoint内の実装修正と判定、既存proposal `#5276309603`/approval `#5276357583`継続利用 |
| **（A9/B8(9)是正）fixed tip** | `85eb4b3cae7e2d3c588af4201b49a49fcbeb58e7` | A9 payload保全・B8(9) content/child集合binding補強コミット |
| Issue manifest diff @ `85eb4b3` | **pass** | ローカル実行: `manifest_change_count=4` `actual_change_count=4` |
| Fail-closed success propagation @ `85eb4b3` | **pass** | ローカル実行: `applicable=false` `checked_file_count=0` |
| `git diff --check origin/main...HEAD` @ `85eb4b3` | **success**（exit 0） | ローカル実行確認 |
| advisor指摘（B8(9) directory再検証の論理矛盾） | 是正 | 削除はbottom-upのため削除直前の子は空であり、(6)時点inventoryとの「exact一致」要求は非空directoryで恒久的に不成立になる論理矛盾があった。PM原文「空であることを確認してから削除する」（#5277578620）に合わせ、(a) 残余child集合が空であること (b) inventory外entry混入がないこと、という会計条件へ書き換えた |
| **（advisor是正）fixed tip** | `0549e836def844a8a1328b0bce7fe6a3c9406d16` | B8(9) directory再検証の論理矛盾是正、A9の`payload_written=true`肯定記録、size/hash再取得〜unlink間の残留window明記 |
| Issue manifest diff @ `0549e83` | **pass** | ローカル実行: `manifest_change_count=4` `actual_change_count=4` |
| Fail-closed success propagation @ `0549e83` | **pass** | ローカル実行: `applicable=false` `checked_file_count=0` |
| `git diff --check origin/main...HEAD` @ `0549e83` | **success**（exit 0） | ローカル実行確認 |
| **（v4）** Codex独立技術レビュー（fixed HEAD `334b24f`、AC3 P1-1/P1-2） | **request-changes** risk=high（AC3 fail） | [#5277901998](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5277901998)。B8(6) child identity baseline未定義（P1-1）、Linux/WSL pathname `unlink`のrename/replace競合下での実体束縛不能（P1-2） |
| **（v4）** ChatGPT要件レビュー（fixed HEAD `334b24f`） | `REVIEW_VERDICT: approve risk=high`（要件面はpass） | Issue #54本文の記載、および[#5278010167](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5278010167)でのChatGPT自身の確認記録による。GitHub上に単体の`REVIEW_VERDICT`コメントは特定できなかったが、両記録が一致して同HEADでのapproveを示す |
| **（v4）** Codex PM判断（P1-2再仕様化差し戻し・既存proposal/approval非流用） | 再仕様化へ差し戻し、限定修正拒否 | [#5278028614](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5278028614)。AGENTS.md「同一タスク2敗後3回目リトライ禁止」を適用、`#5276309603`/`#5276357583`を非流用と判定 |
| **（v4）** Issue #54本文のP1-1/P1-2再仕様化 | 完了 | ChatGPTによる本文更新。B8(6) child identity baseline・B8(9) Windows/Linux-WSL OS別delete target binding契約を追加 |
| **（v4）** 新 canonical proposal（route=claude-code） | 固定 | [#5278352801](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5278352801)。Cursorトークン不足によるClaude Code例外委譲、scopeは固定4ファイル・既存5AC |
| **（v4）** HUMAN_APPROVAL_RECORD: v2（route=claude-code, scope=implementation_start） | **approve** | [#5278387881](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5278387881) |
| **（v4）** Codex PM route確定 | `PM_VERDICT: approve risk=high route=claude-code` | [#5278407512](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5278407512)。既存Cursor向けrecord `#5278202174`（proposed_route=cursor）は別tupleとして非流用 |
| **（v4）実装tip** | `3d7d4e98b2b2e0186304ea9b260e602fc099da51` | B8(6) child identity baseline・B8(9) Windows handle-bound disposition／Linux-WSL fail-closed分岐を固定4ファイルへ反映したコミット |
| Issue manifest diff @ `3d7d4e9` | **pass** | ローカル実行: `manifest_change_count=4` `actual_change_count=4`（`node harness/checks/issue-manifest-diff.cjs --repo kikujizo/ai-harness --issue 54 --head 3d7d4e98b2b2e0186304ea9b260e602fc099da51`） |
| Fail-closed success propagation @ `3d7d4e9` | **pass** | ローカル実行: `applicable=false` `checked_file_count=0`（`node harness/checks/fail-closed-success-propagation.cjs --base c7f2b4c32a4f34f5715fb3279c217bcc7d0ba188 --head 3d7d4e98b2b2e0186304ea9b260e602fc099da51`） |
| `git diff --name-only origin/main...HEAD` @ `3d7d4e9` | 固定4ファイルのみ | ローカル実行確認（`.cursor/rules/ai-workflow.mdc` / `docs/decisions.md` / `docs/harness/roles/cursor.md` / `docs/harness/setup.md`） |
| `git diff --check origin/main...HEAD` @ `3d7d4e9` | **success**（exit 0） | ローカル実行確認 |
| **（v4是正）** advisor指摘によるsetup.md table pipe escape・ChatGPT要件レビュー記録訂正・cursor.md SSOT整合 | 完了 | Codex技術レビュー観点で読める`docs/harness/setup.md`のfail-closed 8表・否定テストテーブルが`os=linux|wsl`の未エスケープpipeでセル崩壊していた点、および決定記録が実際には存在した`REVIEW_VERDICT: approve risk=high`（ChatGPT、Issue #54本文・[#5278010167](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5278010167)）を「未実施」と誤記していた点を是正 |
| **（v4是正）実装tip** | `6e71c2a795c873dc2a919e767cc8a5bcf9c60361` | 上記3点の是正コミット |
| Issue manifest diff @ `6e71c2a` | **pass** | ローカル実行: `manifest_change_count=4` `actual_change_count=4` |
| Fail-closed success propagation @ `6e71c2a` | **pass** | ローカル実行: `applicable=false` `checked_file_count=0` |
| `git diff --name-only origin/main...HEAD` @ `6e71c2a` | 固定4ファイルのみ | ローカル実行確認 |
| `git diff --check origin/main...HEAD` @ `6e71c2a` | **success**（exit 0） | ローカル実行確認 |
| **（v5）** Codex独立技術レビュー（fixed HEAD `af7c9cd`/`96f1d96`、6 finding） | **request-changes** risk=high | [#5289296528](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5289296528) |
| **（v5）** Codex（PM）6 finding判定 | route=mixed（finding 1・3・4・5は今回修正、finding 2・6はChatGPT再仕様化） | [#5289485250](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5289485250) |
| **（v5）** Issue #54本文の6 finding再仕様化 | 完了 | ChatGPTによる本文更新（root identity baseline・post-write residue契約を追加） |
| **（v5）** 正規PM proposal（route=claude-code） | 固定 | [#5289589235](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5289589235)（Codex本人が発行） |
| **（v5）** HUMAN_APPROVAL_RECORD: v2（route=claude-code, scope=implementation_start） | **approve** | [#5289615101](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5289615101) |
| **（v5）** route確定プリフライト | `@codex`宛て | [#5289663239](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5289663239)（ChatGPT） |
| **（v5）** Codex（PM）正式route確定 | `PM_VERDICT: approve risk=high route=claude-code` | [#5289667993](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5289667993)（Codex本人が投稿） |
| **（v5）実装tip** | `e7b993e67696af831c8a47a77a80c22b10460809` | 6 finding（RUN_ROOT identity baseline・Windows share条件・A8 B6同等rescan・directory bottom-up accounting・capability unavailable観測例・A8 post-write residue肯定記録）を固定4ファイルへ反映したコミット |
| Issue manifest diff @ `e7b993e` | **pass** | ローカル実行: `manifest_change_count=4` `actual_change_count=4`（`node harness/checks/issue-manifest-diff.cjs --repo kikujizo/ai-harness --issue 54 --head e7b993e67696af831c8a47a77a80c22b10460809`） |
| Fail-closed success propagation @ `e7b993e` | **pass** | ローカル実行: `applicable=false` `checked_file_count=0`（`node harness/checks/fail-closed-success-propagation.cjs --base c7f2b4c32a4f34f5715fb3279c217bcc7d0ba188 --head e7b993e67696af831c8a47a77a80c22b10460809`） |
| `git diff --name-only origin/main...HEAD` @ `e7b993e` | 固定4ファイルのみ | ローカル実行確認 |
| `git diff --check origin/main...HEAD` @ `e7b993e` | **success**（exit 0） | ローカル実行確認 |
| **（v5是正）** advisor指摘によるdecisions.md却下代替案の補完（renameat2/read-sharing/自動復旧/child増減supersede） | 完了 | 採用しない方針にv5分の4項目が欠けていた点を補完 |
| **（v5是正）実装tip** | `bb3772df72b953b3d3b42b69e682bfffe8d435c6` | 上記補完コミット |
| Issue manifest diff @ `bb3772d` | **pass** | ローカル実行: `manifest_change_count=4` `actual_change_count=4` |
| Fail-closed success propagation @ `bb3772d` | **pass** | ローカル実行: `applicable=false` `checked_file_count=0` |
| `git diff --name-only origin/main...HEAD` @ `bb3772d` | 固定4ファイルのみ | ローカル実行確認 |
| `git diff --check origin/main...HEAD` @ `bb3772d` | **success**（exit 0） | ローカル実行確認 |
| **（v6）** Codex独立技術レビュー（fixed HEAD `4c3effe`、pre-write binding P1） | **request-changes** risk=high | [#5291297447](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5291297447)。[`discussion_r3782248568`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3782248568)（A8 hard-link先置き）、[`discussion_r3782373045`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3782373045)（A7 marker pathname再open） |
| **（v6）** Codex（PM）P1判定・再仕様化差し戻し | valid、ChatGPTへ再仕様化 | [#5291492454](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5291492454) |
| **（v6）** Issue #54本文のpre-write binding再仕様化 | 完了 | ChatGPTによる本文更新（2026-08-17） |
| **（v6）** 新canonical proposal（route=cursor） | 固定 | [#5311085139](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311085139) |
| **（v6）** HUMAN_APPROVAL_RECORD: v2（route=cursor, scope=implementation_start） | **approve** | [#5311256262](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311256262) |
| **（v6）** Codex（PM）正式route確定 | `PM_VERDICT: approve risk=high route=cursor` | [#5311265605](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311265605) |
| **（v6）実装tip** | `c9f2663915a0d263e08e6be45e79c11606df626a` | A7/A8 pre-write create-new + same-handle binding、setup否定例3件、fail-closed 8同期、cursor.md最小同期を固定4ファイルへ反映したコミット |
| Issue manifest diff @ `c9f2663` | **pass** | ローカル実行: `manifest_change_count=4` `actual_change_count=4`（`node harness/checks/issue-manifest-diff.cjs --repo kikujizo/ai-harness --issue 54 --head c9f2663915a0d263e08e6be45e79c11606df626a`） |
| Fail-closed success propagation @ `c9f2663` | **pass** | ローカル実行: `applicable=false` `checked_file_count=0`（`node harness/checks/fail-closed-success-propagation.cjs --base c7f2b4c32a4f34f5715fb3279c217bcc7d0ba188 --head c9f2663915a0d263e08e6be45e79c11606df626a`） |
| `git diff --name-only origin/main...HEAD` @ `c9f2663` | 固定4ファイルのみ | ローカル実行確認 |
| `git diff --check origin/main...HEAD` @ `c9f2663` | **success**（exit 0） | ローカル実行確認 |
| **（v6是正）** Codex PM再評価（fixed HEAD `56def48`、current thread read-back） | 完了 | [#5311506954](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5311506954)。[`discussion_r3793407704`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3793407704)（v5 approval/route表示・**今回修正**）、[`discussion_r3793661805`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3793661805)（A7 post-write residue・**今回修正**）、[`discussion_r3793661803`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3793661803)（ancestor directory binding・**本ラウンド非実装**・open保持） |
| **（v6是正）** 新canonical proposal（route=cursor） | 固定 | [#5311558125](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311558125) |
| **（v6是正）** HUMAN_APPROVAL_RECORD: v2（route=cursor, scope=implementation_start） | **approve** | [#5311600611](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311600611) |
| **（v6是正）** Codex（PM）正式route確定 | `PM_VERDICT: approve risk=high route=cursor` | [#5311611273](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5311611273) |
| **（v6是正）実装tip** | `cfe6154dce98ae8c441c778405cabe9dd3579193` | A7 pre-write identity照合・A7 post-write residue肯定記録・setup AC1/residue観測例・decisions v5 superseded/v6実状態同期を固定4ファイルへ反映したコミット |
| Issue manifest diff @ `cfe6154` | **pass** | ローカル実行: `manifest_change_count=4` `actual_change_count=4` |
| Fail-closed success propagation @ `cfe6154` | **pass** | ローカル実行: `applicable=false` `checked_file_count=0` |
| `git diff --name-only origin/main...HEAD` @ `cfe6154` | 固定4ファイルのみ | ローカル実行確認 |
| `git diff --check origin/main...HEAD` @ `cfe6154` | **success**（exit 0） | ローカル実行確認 |
| ChatGPT 要件レビュー（v6実装tip `c9f2663` / sync HEAD `56def48`） | 初回 **approve** → 訂正後 **request-changes** risk=high | 初回 [#pullrequestreview-4948186086](https://github.com/kikujizo/ai-harness/pull/132#pullrequestreview-4948186086)。訂正 [#5311465262](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5311465262) |
| Codex 独立技術レビュー（v6実装tip `c9f2663` / sync HEAD `56def48`） | **request-changes** risk=high | [#5311448260](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5311448260) |
| current finding read-back（v6是正着手前・HEAD `56def48`） | **完了** | PM再評価 [#5311506954](https://github.com/kikujizo/ai-harness/pull/132#issuecomment-5311506954) で当時のnon-outdated thread dispositionを固定。本行は過去確定状態 |
| current finding read-back（v6是正後・HEAD `a1df393` 以降の再検証） | **未実施** | 過去の#5311506954と混同しない。独立技術レビュー／ゲート前にGitHub一次資料から再read-backする |
| ChatGPT 要件レビュー（v6是正 fixed HEAD `a1df393`） | **request-changes** risk=high | [#pullrequestreview-4948418881](https://github.com/kikujizo/ai-harness/pull/132#pullrequestreview-4948418881)。blockingはAC4 Decision Log同期のみ（本同期コミットの対象） |
| **（v7）** canonical proposal（route=cursor） | 固定 | [#5312145952](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5312145952) |
| **（v7）** HUMAN_APPROVAL_RECORD: v2（route=cursor, scope=implementation_start） | **approve** | [#5312239369](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5312239369) |
| **（v7）** Codex（PM）正式route確定 | `PM_VERDICT: approve risk=high route=cursor` | [#5312291132](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5312291132) |
| **（v7）実装開始時HEAD** | `c0536a5a7bcff562a935e57b53cc2c93bce2135e` | 本ラウンドの実装起点 |
| **（v7）** 今回修正 finding | [`discussion_r3793661803`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3793661803)（ancestor directory / `RUN_ROOT` **create-new 前** pre-write binding）、[`discussion_r3793893860`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3793893860)（payload mutation 後 write/flush/close 失敗の fail-closed 伝播） | 固定4ファイル文書契約のみ |
| **（v7）** 非再実装 finding | [`discussion_r3782248568`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3782248568)（A8 payload leaf pre-write binding） | 前HEADで addressed。今回再実装・弱体化しない |
| **（v7）** 旧 proposal / approval / route | **非流用** | v6/v6是正の `#5311558125` / `#5311600611` / `#5311611273` 等は本ラウンドへ流用しない |
| **（v7）実装 tip** | `70eeab88aa17fee8c602eb5f2901a4dc8ea2a516` | 固定4ファイルへ **create-new 前** ancestor bind・payload IO fail-closed を反映 |
| **（v7）ローカル検証（tip `70eeab8`）** | **pass** | `git diff --check` / `git diff --name-only`（`c7f2b4c...HEAD` および `c0536a5...HEAD`）いずれも固定4ファイルのみ |
| **（v7）** 新HEAD / same-head CI | **push後に一次確認** | 本行更新時点では CI 結果を先書きしない |
| **（v7）** `HIGH_RISK_TECH_GATE` | **blocked** | 修正・要件レビュー・Codex技術レビュー・same-head CI 完了まで |
| **（v7）** merge / settings_apply / execution / 実cleanup | 未承認・未実施 | — |
| **（v8）** canonical proposal（route=cursor） | 固定 | [#5312568119](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5312568119) |
| **（v8）** HUMAN_APPROVAL_RECORD: v2（route=cursor, scope=implementation_start） | **approve** | [#5312744438](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5312744438) |
| **（v8）** Codex（PM）正式route確定 | `PM_VERDICT: approve risk=high route=cursor` | [#5312754424](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5312754424) |
| **（v8）実装開始時HEAD** | `c95b82840600e030fa30d5f12184b4f28901bff9` | 本ラウンドの実装起点 |
| **（v8）** 今回修正 finding | [`discussion_r3794153887`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3794153887)（A8 payload directory **create 前** `PreDirCreateAncestorBind` + bound-parent one-level create-new）、[`discussion_r3794153890`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3794153890)（A7 marker / A8 payload regular file の create-new 成功〜初回 content write 完了までの **LeafContainmentCapabilityGate**） | 固定4ファイル文書契約のみ |
| **（v8）** 非再実装 finding | [`discussion_r3793893860`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3793893860)、[`discussion_r3793661803`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3793661803)、[`discussion_r3782248568`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3782248568) | 前HEADで addressed。今回再実装・弱体化しない |
| **（v8）** 旧 proposal / approval / route | **非流用** | v7の `#5312145952` / `#5312239369` / `#5312291132` 等は本ラウンドへ流用しない |
| **（v8）実装 tip** | `e0d7609c99288c91fb371a914d169daa3e9c2e2a` | 固定4ファイルへ payload dir create 前 bind・leaf containment gate を反映 |
| **（v8）ローカル検証（tip `e0d7609`）** | **pass** | `git diff --check` / `git diff --name-only`（`c7f2b4c...HEAD` および `c95b828...HEAD`）いずれも固定4ファイルのみ |
| **（v8）** 新HEAD / same-head CI | **push後に一次確認** | 本行更新時点では CI 結果を先書きしない |
| **（v8）** `HIGH_RISK_TECH_GATE` | **blocked** | 修正・要件レビュー・Codex技術レビュー・same-head CI 完了まで |
| **（v8）** merge / settings_apply / execution / 実cleanup | 未承認・未実施 | — |
| **（v9）** canonical proposal（route=cursor） | 固定 | [#5313111564](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5313111564) |
| **（v9）** HUMAN_APPROVAL_RECORD: v2（route=cursor, scope=implementation_start） | **approve** | [#5313331045](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5313331045) |
| **（v9）** Codex（PM）正式route確定 | `PM_VERDICT: approve risk=high route=cursor` | [#5313362865](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5313362865) |
| **（v9）実装開始時HEAD** | `432dad5ea163c84a59bdcf52f5478d4f7d7058b9` | 本ラウンドの実装起点 |
| **（v9）** 今回修正 finding | [`discussion_r3794446604`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3794446604)（B8(9) Windows cleanup: verified `RUN_ROOT` directory handle 保持契約・保証不能時 pre-mutation `path_safety_unknown`）、[`discussion_r3794446609`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3794446609)（A7 marker: create-new 成功後の write/flush/close/durability 失敗の residue 肯定伝播） | 固定4ファイル文書契約のみ |
| **（v9）** 非再実装 finding | [`discussion_r3794153887`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3794153887)、[`discussion_r3794153890`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3794153890)、[`discussion_r3793893860`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3793893860)、[`discussion_r3793661803`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3793661803)、[`discussion_r3782248568`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3782248568) | 前HEADで addressed。今回再実装・弱体化しない |
| **（v9）** 旧 proposal / approval / route | **非流用** | v8の `#5312568119` / `#5312744438` / `#5312754424` 等は本ラウンドへ流用しない |
| **（v9）** 固定4ファイル境界 | `.cursor/rules/ai-workflow.mdc` `docs/harness/roles/cursor.md` `docs/harness/setup.md` `docs/decisions.md` | 新 helper/runtime/isolation/schema/stop reason/fixed4外が必要になった場合は別Checkpointへ分離 |
| **（v9）実装 tip** | **未確定（push後に一次確認）** | 本行更新時点では tip SHA を先書きしない |
| **（v9）ローカル検証** | **未確定（push後に一次確認）** | `git diff --check` / `git diff --name-only` は実装担当が working tree で確認 |
| **（v9）** 新HEAD / same-head CI | **push後に一次確認** | 本行更新時点では CI 結果を先書きしない |
| **（v9）** `HIGH_RISK_TECH_GATE` | **blocked** | 修正・要件レビュー・Codex技術レビュー・same-head CI 完了まで |
| **（v9）** merge / settings_apply / execution / 実cleanup | 未承認・未実施 | — |
| **（v10）** canonical proposal（route=cursor） | 固定 | [#5322502680](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5322502680) |
| **（v10）** HUMAN_APPROVAL_RECORD: v2（route=cursor, scope=implementation_start） | **approve** | [#5322556820](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5322556820) |
| **（v10）** Codex（PM）正式route確定 | `PM_VERDICT: approve risk=high route=cursor` | [#5322580929](https://github.com/kikujizo/ai-harness/issues/54#issuecomment-5322580929) |
| **（v10）実装開始時HEAD** | `db1685d986a7d35098631bf570ca32a5f46d93be` | 本ラウンドの実装起点 |
| **（v10）** 今回修正 finding | [`discussion_r3795298185`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3795298185)（fail-closed 契約と Linux/WSL 無条件 writer 成功例の矛盾）、[`discussion_r3800278015`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3800278015)（同上・`LeafContainmentCapabilityGate` 成立条件の platform 名 / lock 取得だけでは不十分） | 固定4ファイル文書契約のみ |
| **（v10）** 非再実装 finding | [`discussion_r3794446604`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3794446604)、[`discussion_r3794446609`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3794446609)、[`discussion_r3794153887`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3794153887)、[`discussion_r3794153890`](https://github.com/kikujizo/ai-harness/pull/132#discussion_r3794153890) | 前HEADで addressed。今回再実装・弱体化しない |
| **（v10）** 旧 proposal / approval / route | **非流用** | v9 の `#5313111564` / `#5313331045` / `#5313362865` 等は本ラウンドへ流用しない |
| **（v10）** 固定4ファイル境界 | `.cursor/rules/ai-workflow.mdc` `docs/harness/roles/cursor.md` `docs/harness/setup.md` `docs/decisions.md` | 新 helper/runtime/isolation/schema/stop reason/fixed4外が必要になった場合は別Checkpointへ分離 |
| **（v10）実装 tip** | **未確定（push後に一次確認）** | 本行更新時点では tip SHA を先書きしない |
| **（v10）ローカル検証** | **未確定（push後に一次確認）** | `git diff --check` / `git diff --name-only` は実装担当が working tree で確認 |
| **（v10）** 新HEAD / same-head CI | **push後に一次確認** | 本行更新時点では CI 結果を先書きしない |
| **（v10）** `HIGH_RISK_TECH_GATE` | **blocked** | 修正・要件レビュー・Codex技術レビュー・same-head CI 完了まで |
| **（v10）** merge / settings_apply / execution / 実cleanup | 未承認・未実施 | — |

## 次アクション

- [x] Codex PM 新proposal（#5263694044）
- [x] 人間 `implementation_start` approve（#5263876000 / HUMAN_APPROVAL_RECORD: v2）
- [x] Codex PM route 確定（#5263894169 / route=cursor）
- [x] Cursor による instance binding 再仕様化実装（固定4ファイル）
- [x] Codex PM: Issue #54 本文へ `issue-change-manifest:v1` を復旧（4ファイル外・`manifest_missing` 解消）
- [x] fixed HEAD `1bd64cb` で expected workflow 2本 success（manifest diff run `31580948676` / success propagation run `31578332485`）
- [x] ChatGPT 要件レビュー（fixed HEAD `1bd64cb`、#5264631720）→ **request-changes risk=high**（AC4のみ未充足）
- [x] Codex PM route再評価・新HUMAN_APPROVAL_RECORD: v2（route=claude-code、#5264680032）→ `docs/decisions.md` 最小同期をClaude Codeへ委譲確定
- [x] Claude Code による `docs/decisions.md` 最小同期（AC4解消コミット。他3ファイルは変更しない）
- [x] **（v3）** Codex独立技術レビューで新規4指摘を特定（#5276235137）→ ChatGPT再仕様化差し戻し
- [x] **（v3）** Codex PM 新canonical proposal（#5276309603）
- [x] **（v3）** 人間 `implementation_start` approve（#5276357583 / HUMAN_APPROVAL_RECORD: v2, route=claude-code）
- [x] **（v3）** Claude Code による safe create・RUN_LOCK identity binding・cleanup pre/post binding・
  `residue=present` only の固定4ファイル実装（本コミット）
- [x] v3実装tipのSHAと検証結果を `docs/decisions.md` へ別コミットで同期（`238ae78`。自己参照回避のため）
- [x] fixed HEAD `238ae78` で `git diff --name-only`/`--check`・Issue manifest diff・Fail-closed
  success propagationすべてsuccessを確認（PR #132コメント #5276545718）
- [x] Codex独立技術レビュー（fixed HEAD `238ae78`、#5276711835）→ **request-changes risk=high**
  （AC1のみ×。`docs/harness/setup.md`のWindows writer成功例が`OpenOrCreate`陽性記述のままA5と矛盾）
- [x] Claude Code による `docs/harness/setup.md` 最小修正（`OpenOrCreate`陽性記述をA5契約へ同期、fixed HEAD `0840fbd`）
- [x] fixed HEAD `0840fbd` で `git diff --name-only`/`--check`・Issue manifest diff・Fail-closed
  success propagationすべてsuccessを確認（PR #132コメント #5276786924）
- [x] **（PM補正）** Codex追加レビューで新規current thread 2件を検出、PM補正判断 `#5277162613` が
  未解決4件（A0/A7/A8/B8）を同一Checkpoint内の実装修正と判定。A1は別途wontfix/resolved済み
- [x] **（PM補正）** Claude Code による A0 trusted identity command・A7 marker safe mode・
  A8 payload安全属性・B8 child mutation binding の固定4ファイル実装（本ラウンド）
- [x] fixed HEAD `f8c8030`（decisions.md同期HEAD `6a11031`）で `git diff --name-only`/`--check`・
  Issue manifest diff・Fail-closed success propagationすべてsuccessを確認（PR #132コメント #5277328523）
- [x] **（A9/B8(9)是正）** Codex独立技術レビュー第2ラウンド（fixed HEAD `6a11031`、#5277468171）→
  **request-changes risk=high**（A9 payload保全・B8(9) content binding の2件）
- [x] **（A9/B8(9)是正）** Codex PM判断（#5277578620）が既存Checkpoint内の実装修正と判定、
  既存proposal `#5276309603`/approval `#5276357583`継続利用を確認
- [x] **（A9/B8(9)是正）** Claude Code による A9 payload保全契約・B8(9) content/child集合binding の
  固定4ファイル実装（本ラウンド）
- [x] **（advisor是正）** advisor指摘によるB8(9) directory再検証の論理矛盾是正（exact一致要求を
  空であること＋会計チェックへ書き換え）、A9の`payload_written=true`肯定記録、残留window明記
- [x] 新HEAD `0549e83` で `git diff --name-only origin/main...HEAD` が固定4ファイルのみであることを確認
- [x] 新HEAD `0549e83` で `git diff --check` success を確認
- [x] 新HEAD `0549e83` で Issue manifest diff success を確認
- [x] 新HEAD `0549e83` で Fail-closed success propagation success を確認
- [x] ChatGPT 要件レビュー（fixed HEAD `0549e83`/`334b24f`）→ `REVIEW_VERDICT: approve risk=high`
  （要件面はpass。Issue #54本文と#5278010167のChatGPT自身の記録による）
- [x] Codex 独立技術レビュー（fixed HEAD `334b24f`）→ **request-changes risk=high**（AC3 fail、
  P1-1/P1-2の2件。#5277901998）
- [x] **（v4）** Codex PM判断: P1-2をIssue正本不足としてChatGPTへ再仕様化差し戻し、既存proposal
  `#5276309603`/approval `#5276357583`は非流用（#5278028614）
- [x] **（v4）** ChatGPTによるIssue #54本文のP1-1/P1-2再仕様化（B8(6) child identity baseline・
  B8(9) OS別delete target binding）
- [x] **（v4）** Codex PM 新canonical proposal（#5278352801、Cursorトークン不足によるClaude Code
  例外委譲）
- [x] **（v4）** 人間 `implementation_start` approve（#5278387881 / HUMAN_APPROVAL_RECORD: v2,
  route=claude-code）
- [x] **（v4）** Codex PM route確定（#5278407512 / route=claude-code）
- [x] **（v4）** Claude Code によるB8(6) process-local child identity baseline・B8(9) Windows
  handle-bound disposition／Linux-WSL fail-closed の固定4ファイル実装（本コミット）
- [x] **（v4）** 実装tipのSHAと検証結果を `docs/decisions.md` へ別コミットで同期（`3d7d4e9`。自己参照回避のため）
- [x] **（v4是正）** advisor指摘（setup.md table pipe escape / ChatGPT要件レビュー記録訂正 / cursor.md
  SSOT整合）を是正し、新tip `6e71c2a` のSHAと検証結果を別コミットで同期（同期コミット自体のHEADは
  `96f1d96`）
- [x] Codex 独立技術レビュー（v4是正後 fixed HEAD `96f1d96`）→ **request-changes risk=high**
  （6 finding。#5289296528）
- [x] **（v5・superseded・非流用）** Codex（PM）6 finding判定: finding 1・3・4・5は今回修正、finding 2・6はChatGPT
  再仕様化差し戻し（`route=mixed`。#5289485250）——v5監査履歴。`implementation_start`へ非流用
- [x] **（v5・superseded・非流用）** ChatGPTによるIssue #54本文の6 finding再仕様化（`RUN_ROOT`自身のidentity baseline・
  A8 post-write residue契約を追加）——v5監査履歴
- [x] **（v5・superseded・非流用）** Codex（PM）本人による正規proposal（#5289589235、scope=固定4ファイル）
- [x] **（v5・superseded・非流用）** 人間 `implementation_start` approve（#5289615101 / HUMAN_APPROVAL_RECORD: v2,
  route=claude-code, recorded_by=ChatGPT）
- [x] **（v5・superseded・非流用）** Codex（PM）本人による正式route確定（#5289667993 / route=claude-code。route確定
  プリフライト#5289663239を経てCodex本人が投稿）
- [x] **（v5・superseded・非流用）** Claude Codeによる6 finding（Windows share条件・`RUN_ROOT` identity baseline・
  A8 B6同等rescan・directory bottom-up accounting・Windows capability unavailable観測例・
  A8 post-write residue肯定記録）の固定4ファイル実装（tip `e7b993e`/`bb3772d`。v5監査履歴）
- [x] **（v5・superseded・非流用）** 実装tipのSHAと検証結果を `docs/decisions.md` へ別コミットで同期（自己参照回避のため）
- [x] **（v6・旧ラウンド・非流用）** Codex独立技術レビュー（fixed HEAD `4c3effe`、#5291297447）→ pre-write binding P1
- [x] **（v6・旧ラウンド・非流用）** Codex（PM）P1 valid判定・ChatGPT再仕様化差し戻し（#5291492454）
- [x] **（v6・旧ラウンド・非流用）** ChatGPTによるIssue #54本文のpre-write binding再仕様化（2026-08-17）
- [x] **（v6・旧ラウンド・非流用）** 旧canonical proposal（#5311085139、route=cursor）
- [x] **（v6・旧ラウンド・非流用）** 旧人間 `implementation_start` approve（#5311256262 / HUMAN_APPROVAL_RECORD: v2,
  route=cursor）
- [x] **（v6・旧ラウンド・非流用）** 旧Codex（PM）正式route確定（#5311265605 / route=cursor）
- [x] **（v6）** CursorによるA7/A8 pre-write binding・setup否定例・fail-closed 8同期の固定4ファイル実装（tip `c9f2663`）
- [x] **（v6）** 実装tip `c9f2663` のSHAと検証結果を `docs/decisions.md` へ別コミットで同期（tip `56def48`。自己参照回避のため）
- [x] **（v6是正）** Codex PM再評価・current thread read-back（#5311506954）
- [x] **（v6是正）** 新canonical proposal（#5311558125、route=cursor）
- [x] **（v6是正）** 人間 `implementation_start` approve（#5311600611 / HUMAN_APPROVAL_RECORD: v2, route=cursor）
- [x] **（v6是正）** Codex（PM）正式route確定（#5311611273 / route=cursor）
- [x] **（v6是正）** CursorによるA7 pre-write identity照合・A7 post-write residue肯定記録・setup AC1/residue・
  decisions v5 superseded/v6実状態同期の固定4ファイル実装（本コミット）
- [x] **（v6是正）** 実装tipのSHAと検証結果を docs/decisions.md へ別コミットで同期（自己参照回避のため）
- [x] ChatGPT 要件レビュー（v6実装tip `c9f2663` / sync HEAD `56def48`）——初回approve後、訂正でrequest-changes（#4948186086 / #5311465262）
- [x] Codex 独立技術レビュー（v6実装tip `c9f2663` / sync HEAD `56def48`）——request-changes（#5311448260）
- [x] current finding read-back（v6是正着手前・HEAD `56def48`）——完了（#5311506954）。過去確定状態
- [ ] current finding read-back（v6是正後・HEAD `a1df393` 以降の再検証）——未実施（#5311506954と混同しない）
- [x] ChatGPT 要件レビュー（v6是正 fixed HEAD `a1df393`）——request-changes（#4948418881、AC4のみblocking）
- [x] **（v8）** CursorによるA8 payload directory PreDirCreateAncestorBind・A7/A8 LeafContainmentCapabilityGate・setup Case A/B・cursor.md最小同期の固定4ファイル実装（tip `e0d7609`）
- [x] **（v8）** 実装tipのSHAと検証結果を `docs/decisions.md` へ別コミットで同期（本コミット）
- [ ] **（v9）** CursorによるB8(9) verified `RUN_ROOT` handle保持・A7 marker write/flush/close/durability失敗伝播・setup Case A/B・cursor.md最小同期の固定4ファイル実装（tip 未確定）
- [ ] **（v9）** 実装tipのSHAと検証結果を `docs/decisions.md` へ別コミットで同期（未実施）
- [ ] **（v10）** Cursorによる fresh-writer `LeafContainmentCapability` 同期・setup 矛盾解消・cursor.md 最小同期・decisions v10 追記の固定4ファイル実装（tip 未確定）
- [ ] **（v10）** 実装tipのSHAと検証結果を `docs/decisions.md` へ別コミットで同期（未実施）
- [ ] Codex 独立技術レビュー（v6是正 fixed HEAD `a1df393` または本AC4同期後の新HEAD）——未実施
- [ ] `HIGH_RISK_TECH_GATE` 判定（両レビュー完了後、Codex PMが別工程として判断）
- [ ] merge scope 人間approve（`HIGH_RISK_TECH_GATE: passed` 後）
- [ ] `HIGH_RISK_TECH_GATE: passed` 後、人間による merge 判断（merge scope）
