---
name: mino-model-deepening
description: >-
  LAB・明示呼び出し限定（`mino-model-deepening` を使う等の明示指定時のみ。一般依頼文だけでは発動しない）。
  既存のドメインモデルや集約候補を、フラグ・種別・例外処理の増殖などの兆候から問い直し、より説明力の高いモデル候補を提示する設計Checkpoint用Skill。
  実装中の自動再設計には使わない。
---

> このSkillの変更・修正は `.agents/skills/mino-model-deepening/SKILL.md`（正本）を編集する。リンク先を編集しない。

> **ティア**: lab（`AGENTS.md`「lab 共通規則」— Skill名または上位ワークフローによる明示指定時のみ発動）

# mino-model-deepening — 設計Checkpointでのモデル深化

明示指定された設計Checkpointで、既存モデルを支配している暗黙の前提を疑い、浅いモデルから深いモデルへ進める候補を提示する。実装中に自動発動して、承認済みIssueや実装方針を勝手に再設計してはならない。

**コア原則**: 全文複製禁止。規範的正本は [docs/mino-skills/core/mino-core-principles.md](../../../docs/mino-skills/core/mino-core-principles.md) を参照する。

## 使いどき / 使わないとき

**使う**（明示指定時）: 既存モデルにフラグ・種別コード・例外処理が増殖している／event-stormingで出た集約候補を設計Checkpointで深めたい／同名別物・別名同物の疑いがある。

**使わない**: 実装中の思いつき再設計／Issueにない仕様拡張／境界・用語の発見（→ `mino-context-discovery`）／業務時系列の発見（→ `mino-event-storming`）／コード生成（→ `mino-contract-driven-coding`）。

## ハーネス内での位置づけ

- 設計Checkpoint専用のlab Skillである。
- Cursor実装中に自動発動して設計を変えてはいけない。
- 実装中にモデル再設計が必要だと分かった場合は、実装を止め、確認事項または後続Issue候補として報告する。
- 採否判断は人間が行う。AIは候補・根拠・反証を提示するだけで、承認なしに実装へ連鎖しない。

## インプット

必要なもの: 既存ドメインモデルが分かる素材（概念定義、ER図、クラス図、API仕様、event-stormingの集約候補、関連Issue）。断片的でもよいが、概念・属性・関係・ルールのいずれかに遡れること。

足りないとき: 推測で埋めず、確認事項に回す。特に「最近気持ち悪いと感じた箇所」「既存モデルを作った経緯」「対象モデルの一次資料」を優先して聞く。

## 手順

### 前提: 対象scopeの固定

監査を開始する前に、対象scopeを明示して固定する。scopeが固定できない場合は監査を開始せず、確認事項へ戻す。

- 対象は、明示された use case、関連 requirement、評価対象モデル候補に限定する。
- 「業務全体」等の無限scopeは禁止する。
- scopeは各中間成果物（欠落監査表・destruction probe記録）に `audit_target` と `scope` として記録する。

### STEP 1: 現行モデルの棚卸し

- 概念・属性・関係・ルールを列挙する。
- 各概念について、うまく説明できていることと、フラグ・種別・例外処理・注記で逃げていることを対で記録する。
- 中心概念（参照が多い、命名議論が多い、変更頻度が高い、例外が多い）を優先対象にする。

### STEP 2: 暗黙スキーマの検出

- このモデルが何の比喩・帳票・旧システム・組織構造を踏襲しているかを列挙する。
- 「昔からそう」「なんとなく」「既存DBがそうだから」といった根拠薄の前提をマークする。
- 根拠に遡れない前提は、断定せず保留事項に入れる。

### STEP 3: 代替モデル候補の生成

- 中心概念ごとに「みんなは○○と呼んでいるが、正体は××ではないか？」という問いで代替案を出す。
- 代替案は原則3つ。ただし、素材に根拠を持って生成できる案が2つ以下の場合は水増しせず、その件数と不足理由を明記する。
- 観点例: 時間で分ける、目的で分ける、統合する、出来事として捉え直す、役割として捉え直す。
- 根拠が素材に遡れない案は「仮説」として扱い、採用候補にしない。

### STEP 4: 12観点欠落監査（screening）

対象 requirement またはモデル候補ごとに、次の **12観点** を過不足なく一度ずつ screening する。これは中間成果物の必須要素である。

| # | 観点（dimension） |
|---|---|
| 1 | term / context |
| 2 | concept |
| 3 | constraint |
| 4 | state |
| 5 | transition |
| 6 | behavior |
| 7 | relationship |
| 8 | failure |
| 9 | time |
| 10 | writer |
| 11 | reader |
| 12 | authority |

**判定規則**:

- 各観点を `applicable | not_applicable | unknown` で独立判定する。
- 各判定には `rationale` と `evidence` を記録する。
- `unknown` には `confirmation_method` と `impact_if_unresolved` も記録する。
- Evidence 不足は `unknown` とする。`not_applicable` へ丸めない。
- screening を埋めるために架空の state、failure、relationship 等を作らない。
- 同じ理由と Evidence で `not_applicable` となる観点は profile へまとめてもよいが、展開すると 12 観点が過不足なく一度ずつ現れることを必須とする。

**欠落監査表の様式**（対象ごとに1表。YAML または同等の表形式）:

```yaml
audit_target: 注文状態モデル
scope: 注文確定から出荷開始まで
screening:
  - dimension: state
    disposition: applicable
    rationale: 支払前と支払後で許可される操作が異なる
    evidence: [関連Issueの受け入れ条件]
    detail: 状態の意味と許可操作を詳細化する
  - dimension: authority
    disposition: unknown
    rationale: 状態の正本がDBか外部決済か未確定
    evidence: []
    confirmation_method: 上位仕様と運用担当へ確認
    impact_if_unresolved: 推奨モデルと移行判断を確定できない
```

### STEP 5: applicable 観点の詳細化

詳細化するのは、モデル候補の評価結果を分岐させる `applicable` な観点だけとする。

- `not_applicable` は profile または rationale で十分とし、詳細モデル化しない。
- `unknown` は詳細化せず、確認事項として残す。
- screening の穴埋めのために架空要素を追加しない。

### STEP 6: destruction probe（反証）

`applicable` な観点について、無効状態の生成経路と業務影響を反証する。probe は **思考実験** または **使い捨て fixture** を既定とし、本番データ・本番環境への破壊操作を禁止する。

- 一般的な反例の列挙で終えず、具体的な writer / entry point から無効入力または操作列、伝播、業務影響まで追跡する。
- 評価を分岐させる観点に対してのみ probe を選ぶ。架空 probe で screening を埋めない。
- 安全な思考実験または使い捨て fixture で確認できない場合は `not_executed` または `unknown` として理由と影響を残す。

**destruction probe 記録の様式**（probe ごとに1件）:

```yaml
destruction_probe:
  writer_or_entry: 管理画面の状態変更
  destructive_input_or_sequence: 支払前に出荷済みへ遷移
  propagation: [注文状態更新, 出荷処理の対象化]
  business_impact: [未入金注文の出荷]
  expected_invariant: 支払確認前は出荷開始できない
  observed_result: prevented | constructed | partially_observed | not_executed | unknown
  defense_assessment: present | absent | unknown
  gap: none | invalid_state | missing_constraint | missing_transition | missing_writer | authority_conflict | unknown
  confirmation_method: fixtureまたは既存テストで確認
  impact_if_unresolved: 候補モデルを採用可能と判定できない
```

### STEP 7: 評価

各代替案を次の4基準で評価する。

| 基準 | 問い |
|---|---|
| 説明力 | 既存の例外・フラグ・注記がどれだけ消えるか |
| 不変条件の置き場所 | ルールの責務がどの概念に属するか明確になるか |
| 言語ゲーム整合 | 現場の言葉・目的と接続できるか |
| 移行コスト | 既存データ・既存コードから移せる現実性があるか |

点数は補助にすぎない。合計点で自動採用せず、判断根拠を文章で残す。全代替案が現行モデルに劣る場合は「現行で妥当」を正式結論にしてよい。

### STEP 8: 再構成案

- 採用候補ごとに、新概念の名前・意味・ルール、旧→新の対応表、ルールの再配置を記録する。
- 実装へ進めるのではなく、承認待ちの設計候補として提示する。

## 反証ラウンド

以下すべてに明示的に答える。

1. 新概念は単なる改名ではないか。
2. 抽象化しすぎて現場の言葉から離れていないか。
3. 根拠が素材ではなくAIの一般知識だけになっていないか。
4. 「その他」「汎用」「共通」という逃げ概念を作っていないか。
5. 捨てた旧前提を記録したか。
6. 12観点 screening を埋めるために架空要素・架空 probe を作っていないか。
7. destruction probe が writer / entry から伝播・業務影響まで追跡できているか。

該当した場合は該当箇所を修正し、維持する場合も理由を判断根拠に残す。

## Hard Gate（欠落監査・destruction probe）

次のいずれかに該当する場合、監査・候補提示を完了扱いにせず、該当 STEP へ戻る。

1. 対象 scope が固定されていない、または無限 scope のまま監査を進めている。
2. 12 観点のいずれかが screening されていない、または `applicable | not_applicable | unknown` 以外で埋めている。
3. Evidence 不足を `unknown` とせず、`not_applicable`・`present`・既知 severity へ丸めている。
4. screening を埋めるために架空の state、failure、relationship、probe を作っている。
5. destruction probe を本番データ・本番環境で実行している、または実行が必要と判断して停止していない。
6. 公開 writer または迂回 writer（serializer・migration・admin 等）から無効状態を生成できるのに、候補モデルを採用可能・完了扱いにしている。
7. `unknown` の `confirmation_method` または `impact_if_unresolved` が欠落している。
8. destruction probe 記録に writer / entry、破壊入力または操作列、伝播、業務影響、期待する不変条件、観測結果、防御評価、gap のいずれかが欠落している。

## 出力契約（中間成果物）

1. **Before/Afterモデル対比**: 概念定義表＋可能ならMermaid図。
2. **脱構築ラウンド記録**: 中心概念／代替案／評価／推奨。
3. **12観点欠落監査表**: 対象 scope ごとに 12 観点を一度ずつ screening した表。`rationale`・`evidence` を含む。`unknown` 時は `confirmation_method`・`impact_if_unresolved` も含む。`applicable` 観点の詳細化結果を含む。
4. **destruction probe 記録**: writer / entry から無効入力・伝播・業務影響・期待する不変条件・観測結果・防御評価・gap を追跡した記録。本番データでの実行は禁止。
5. **消えた例外・フラグの一覧**: Beforeで例外だったものがAfterでどう自然に説明されるか。
6. **判断根拠・確認事項・保留事項**: 素材に遡れる根拠、確認事項、仮定、反証ラウンド記録。欠落監査表の `unknown` 行と probe の `not_executed | unknown` は確認事項へ列挙する。
7. **ネクストアクション候補**: 実装契約化が必要なら、Issue #38で導入された `mino-contract-driven-coding` を明示指定できることを候補として書く。ただし自動連鎖せず、人間承認を待つ。

## 品質基準（Doneの定義）

- 対象 scope が固定され、12 観点が過不足なく一度ずつ screening されている。
- `applicable` な観点だけが詳細化され、架空要素で screening を埋めていない。
- destruction probe が安全な思考実験または使い捨て fixture で追跡され、本番データ・本番環境では実行していない。
- 無効状態を公開 writer または迂回 writer から生成できる候補を、採用可能・完了扱いにしていない。
- 代替案の根拠が素材に遡れる。根拠がない案は水増ししない。
- 採用候補は、既存の例外・フラグ・注記を最低1つ具体的に説明できる。結論が「現行で妥当」の場合は、全代替案の評価記録が根拠になる。
- 実装中の自動再設計やIssue外の仕様追加をしていない。
- 出力契約の7点が揃っている。

## 出所・帰属（P3）

本節の 12 観点 screening と destruction probe 規則は、外部 `inspired-mino-design-skills`（commit `afd50e2`）からの部分的移植である。3層帰属の詳細は Decision Log（Issue #109）を参照する。

| 層 | 内容 |
|---|---|
| `source-derived` | 12 観点 rubric、applicability screening、destruction probe の追跡項目、本番データ禁止 |
| `operationalization` | 完全性監査 Skill 全体は輸入せず、既存モデル深化フローへ欠落監査表と反証記録として組み込む |
| `repository-policy` | lab ティア・明示発動・実装中の自動再設計禁止・採否を人間に残す既存境界を維持 |

12 観点は外部 Skill 内の suite operationalization であり、一般 DDD 理論の固定定義として扱わない。
