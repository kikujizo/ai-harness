---
name: mino-contract-driven-coding
description: >-
  LAB・明示呼び出し限定（`mino-contract-driven-coding` を使う等の明示指定時のみ。一般依頼文だけでは発動しない）。
  承認済みIssue・Decision Log・既存ドメインモデルから導出した契約表を使い、ドメイン層実装と契約検証テストを作るためのSkill。
  契約表は上位仕様の正本ではなく、上位仕様から導出した実装契約である。
---

> このSkillの変更・修正は `.agents/skills/mino-contract-driven-coding/SKILL.md`（正本）を編集する。リンク先を編集しない。

> **ティア**: lab（`AGENTS.md`「lab 共通規則」— Skill名または上位ワークフローによる明示指定時のみ発動）

# mino-contract-driven-coding — 承認済みIssueから導出する契約駆動実装

明示指定されたとき、承認済みIssue・Decision Log・ドメインモデルから実装契約を導出し、ドメイン層のコードと契約検証テストへ翻訳する。契約表は上位仕様を上書きする正本ではない。

**コア原則**: 全文複製禁止。規範的正本は [docs/mino-skills/core/mino-core-principles.md](../../../docs/mino-skills/core/mino-core-principles.md) を参照する。

## 実行主体

完全実行できる担当は次に限る。

- Cursor（標準の実装担当）
- 人間またはCodex PMが明示的に例外委譲したClaude Code

ChatGPTは要求・契約候補の整理までとし、実装コードを生成しない。Codexは契約表と設計の技術評価までとし、実装コードを生成しない。上位の役割分担が常に優先する。

## 使いどき / 使わないとき

**使う**（明示指定時）: 承認済みIssueとドメインモデルがあり、ドメイン層の不変条件・事前条件・事後条件をコードとテストへ落とすとき。

**使わない**: Issueが未承認／モデルが曖昧／UI・インフラ実装／ChatGPTやCodexが実装主体のとき／契約表で新仕様を発見したが人間承認がないとき。

## 契約表の位置づけ

- 契約表は、承認済みIssue・Decision Log・ドメインモデルから導出した**実装契約**である。
- 契約表は上位仕様を変更してはならない。
- 契約表に新しい制約・数値・状態遷移が必要になった場合は、実装せず仕様確認事項としてIssueへ差し戻す。
- 契約表にないテストやコードを勝手に追加しない。必要なら契約表を上位仕様へ差し戻してから翻訳する。

## インプット

必要なもの: 承認済みIssue、受け入れ条件、Decision Log、ドメインモデルまたは集約候補、対象言語・既存コードの範囲。

足りないとき: 推測で補わず、対象概念、守るべきルール、使われ方を確認事項にする。

## 手順

### STEP 1: 上位仕様の確認

- 承認済みIssue、受け入れ条件、Decision Logを読み、実装対象とスコープ外を明確にする。
- Issueにない制約・数値・状態遷移は「追加仕様候補」として分離し、実装しない。

### STEP 2: 契約表の作成

各概念・操作について、事前条件／事後条件／不変条件を表にする。

- 数値化可能な条件は、最小・最大・境界値を具体的な数値で書く。
- 数値化できない条件は、真偽判定可能な具体的述語で書く。
- 根拠のない数値を作らない。
- 範囲外の挙動は、承認済みIssueまたはDecision Logに根拠がある場合だけ明記する。根拠がなく仕様未定なら、挙動を決めずIssueへ差し戻す。

#### operation別 applicability 判定（retry / duplicate / idempotency）

契約表と併せて、各 operation について **applicability 判定表**を作成する。これは中間成果物の必須要素である。

**判定規則**:

- retry・duplicate・idempotency は**相互推定しない**。各項目を `required | not_applicable | unknown` で独立判定する。
- 各判定には `rationale` と `evidence` を記録する。
- `unknown` には `confirmation_method` と `impact_if_unresolved` も記録する。
- Evidence 不足は `unknown` として停止する。`not_applicable` へ丸めない。
- pure function および read-only operation には、上位仕様または Evidence がない限り idempotency key・deduplication 保存・mutation retry を要求しない。
- 判定不能時は実装せず、上位仕様への確認事項として Issue へ差し戻す。

**判定表の様式**（operation ごとに1行。YAML または同等の表形式）:

```yaml
operation: 注文照会
retry:
  status: unknown
  rationale: 上位仕様で retry 可否が未確定
  evidence: []
  confirmation_method: 上位仕様へ確認
  impact_if_unresolved: retry 契約を確定不可
duplicate:
  status: not_applicable
  rationale: 読取のみで重複副作用なし
  evidence: [read-only operation]
idempotency:
  status: not_applicable
  rationale: read-only で key の根拠なし
  evidence: [上位仕様に副作用なし]
```

`required` のときだけ mechanism（key scope・duplicate result 等）を定義する。Evidence がない mechanism は発明しない。

**承認ゲートG1**: 契約表と applicability 判定表を提示し、上位仕様から導出されたことを確認する。新制約がある場合、または applicability が `unknown` のまま残る場合はここで停止する。

### STEP 3: 公開インターフェイス設計

- 1インターフェイス＝1目的にする。
- 目的が違うなら処理が似ていても分ける。
- 命名は実装手段ではなく、何のための操作かが伝わる名前にする。

### STEP 4: 実装生成

実装担当がCursorまたは例外委譲Claude Codeである場合のみ実装する。

- 不変条件はコンストラクタ／ファクトリで強制する。
- setter禁止・不変優先。変更は新インスタンス返却で表現する。
- ロジックはデータを持つクラスの中に置く。
- 集約内部の変更は集約ルート経由にする。
- ドメイン値は必要に応じて値オブジェクトに包む。

### STEP 5: 契約検証テスト

- 契約表の行からテストを導出する。
- 境界値は契約表に根拠がある場合だけテストする。
- テスト検討中に契約表にない懸念を発見したら、テストを勝手に足さず契約表へ差し戻す。

### STEP 6: 突合

契約表の各行について、実装箇所とテスト箇所を突合する。未担保行は確認事項として残し、完了扱いにしない。

## Hard Gate（applicability 判定）

次のいずれかに該当する場合、契約表・applicability 判定表を完成扱いにせず STEP 2 へ戻る。

1. retry・duplicate・idempotency を互いから推定している（例: retry 可能なら idempotency も required、duplicate を key の有無だけで決める）。
2. pure function または read-only operation へ、上位仕様・Evidence のない idempotency key・deduplication 保存・mutation retry を要求している。
3. `unknown` を `not_applicable` へ丸めている、または Evidence 不足を空欄・N/A で埋めている。
4. `unknown` の `confirmation_method` または `impact_if_unresolved` が欠落している。

## 反証ラウンド

1. 契約表に書けない要件がコードだけに残っていないか。
2. プリミティブ型執着がないか。
3. getterで取り出して外側で判断していないか。
4. 集約ルートを迂回していないか。
5. 目的の違う処理を似ているだけで混ぜていないか。
6. retry・duplicate・idempotency の applicability を一括推定していないか。

該当した場合は契約表または設計へ戻る。戻った過程は判断根拠に記録する。

## 出力契約（中間成果物）

1. **契約表**: 概念・操作／事前条件／事後条件／不変条件／根拠Issue。
2. **operation別 applicability 判定表**: 各 operation の retry・duplicate・idempotency を独立判定した表。`rationale`・`evidence` を含む。`unknown` 時は `confirmation_method`・`impact_if_unresolved` も含む。
3. **公開インターフェイス定義**: 目的駆動の名前。実装前に提示する。
4. **実装コード**: 実装権限がある担当のみ生成する。ChatGPT/Codexはここを「生成不可」と書く。
5. **契約検証テスト**: 契約表の行と対応するテスト。
6. **突合表＋判断根拠・確認事項・保留事項**: 契約表行／実装箇所／テスト箇所、未担保行、確認事項、保留事項。applicability 判定表の `unknown` 行は確認事項へ列挙する。

最終報告は `handoff-report` およびルート `AGENTS.md` の出力契約に従う。このSkillの出力契約は中間成果物である。

## 品質基準（Doneの定義）

- 契約表の全行が承認済みIssueまたはDecision Logに遡れる。
- operation別 applicability 判定表で retry・duplicate・idempotency が相互推定なく独立判定されている。
- pure function・read-only operation へ根拠のない idempotency key 等を要求していない。
- `unknown` は上位仕様への確認事項として残され、実装に進んでいない。
- 新しい制約・数値・状態遷移を勝手に作っていない。
- 実装コード生成は許可された担当だけが行っている。
- 契約表、実装、テストの突合に空欄がない。空欄は確認事項として明示されている。

## 出所・帰属（P3）

本節の applicability 判定規則は、外部 `inspired-mino-design-skills`（commit `afd50e2`）からの部分的移植である。3層帰属の詳細は Decision Log（Issue #103）を参照する。

| 層 | 内容 |
|---|---|
| `source-derived` | 相互推定禁止、Evidence 付き applicability、pure/read-only への架空 mechanism 禁止 |
| `operationalization` | ai-harness 既存契約表へ operation 別 applicability 判定表として組み込む |
| `repository-policy` | lab ティア・明示発動・実装主体・上位仕様優先の既存境界を維持 |
