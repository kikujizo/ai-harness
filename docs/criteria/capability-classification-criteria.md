# 基準: capability 分類・差別化・domain vision（capability-classification-criteria）

> **これは何か**: 設計書・アーキテクチャ提案・ADR・Issue・レビュー成果物のうち、capability の種別・分類・差別化・domain vision・architecture investment を扱うものを `recursive-review` で照合するためのバイナリ基準。
> **到達状態**: technical capability を根拠なく事業上の差別化・domain vision・unique value として扱う案を検出し、完成・推奨扱いにしない。
> **較正状態**: 初回作成。最初の2〜3回は人間がAIの○×判定を確認して較正する。

**長さ中立**: 簡潔な成果物は冗長な成果物と同等以上に評価する。

## 適用対象 / 非適用対象

**適用する**（次のいずれかを扱う成果物）:

- capability kind / classification（`business_capability` / `subdomain` / `technical_capability` / `unknown`）
- `core` / `supporting` / `generic`
- differentiation / unique value / domain vision
- architecture investment の根拠

**適用しない**:

- 上記を扱わない一般文書・コードレビュー・運用手順
- business capability / subdomain の最終分類・事業価値・投資判断の承認そのもの（本基準は誤分類と架空価値の検出のみ）

## 基準（5項目・○/×）

1. **対象種別が明示されている**
   観測手順: 成果物内で capability の対象種別が `business_capability | subdomain | technical_capability | unknown` のいずれかとして**明示**されているか見る。種別の記載がない、または曖昧な比喩だけで種別が読み取れない場合は×。
   attribution: `source-derived`
   source: `inspired-mino-design-skills` commit `afd50e2ca18bb22e336a05df1c8481dbcd652b5c` — `.agents/skills/mino-architecture-quality-strategy/SKILL.md` L50–52（capability kind の先行判定）

2. **technical capability へ事業分類・価値物語を直接付与していない**
   観測手順: `kind: technical_capability`（または同等の記述）の capability に、`core | supporting | generic`、domain vision、unique value、事業上の differentiation を**直接**付与していないか見る。1つでも付与されていれば×。business capability / subdomain であることを示す Evidence へ遡れる場合のみ、対象種別の訂正後に再評価する。
   attribution: `source-derived`
   source: `inspired-mino-design-skills` commit `afd50e2` — `.agents/skills/mino-architecture-quality-strategy/SKILL.md` L66–75（core/supporting/generic を business capability / subdomain のみへ適用する Hard Gate）

3. **technical capability は技術的評価軸で扱われている**
   観測手順: `kind: technical_capability` の capability が、quality scenario・failure risk・operation・cost 等の**技術的評価軸**で記述されているか見る。技術名・新規性・「高速」「スケーラブル」等の形容だけを価値根拠にしている場合は×。`classification: not_applicable` とその理由が明示されていれば○（技術手段への core 分類回避として有効）。
   attribution: `source-derived`
   source: `inspired-mino-design-skills` commit `afd50e2` — `.agents/skills/mino-architecture-quality-strategy/references/workflow.md` L47–87（named technology を目的にしない・logging/deployment/cache 等を技術軸で評価）

4. **Evidence 不足時は unknown を維持し推測で確定していない**
   観測手順: kind または classification を Evidence から決められない記述がある場合、`unknown` が維持され、`confirmation_method` と `impact_if_unresolved` が残っているか見る。Evidence 不足なのに AI の推測で `business_capability` / `technical_capability` 等へ確定している場合は×。`unknown` 維持かつ確認方法・未解決影響が記録されていれば○。
   attribution: `operationalization`
   source:
   - 根拠原典: `inspired-mino-design-skills` commit `afd50e2` — `mino-architecture-quality-strategy/references/workflow.md` L47–87（Evidence 不足は unknown へ接続）
   - ai-harness 側解釈: Issue #113 受け入れ条件に合わせ、`confirmation_method` / `impact_if_unresolved` の記録を観測必須とした

5. **× が1つでもあれば完成・推奨扱いに接続しない**
   観測手順: 項目1〜4のいずれかが×のとき、対象成果物が「完成」「推奨」「採用可能」「レビュー合格」等の扱いになっていないか見る。×が残ったまま完成扱いなら×。×は `request-changes` または未解決事項へ接続し、`artifact_status: not_ready` 等の未完了表現が残っていれば○。
   attribution: `repository-policy`
   source: ai-harness `docs/criteria/` 運用 — バイナリ基準の×は推奨・完了へ進めない（`docs/criteria/README.md` 運用ルール）。事業価値の最終承認は人間または上位仕様の Evidence に残す

## 判定規則

- 各項目は **○ / ×** の2値。部分点・「概ねOK」は禁止
- 本基準の対象外の成果物には「**対象外**」と明記する（誤適用しない）
- ×は「項目番号 + 該当箇所（ファイル・フィールド名・行）」で名指しする
- 基準にない問題は「基準外の気づき」として分離する（reflux ゲート②）
- 項目4で `unknown` 停止が正しい場合、項目1〜3の未確定は×ではなく、**未解決として停止**が期待結果

## 照合例（静的確認用）

### 不正例（項目2・3が×）

```yaml
capability:
  name: Redisによるリアルタイムキャッシュ
  kind: technical_capability
  classification: core
  differentiation: 高速キャッシュが競争優位である
  domain_vision: データを最速で届ける企業になる
  evidence: []
```

期待: 項目2=×（core・differentiation・domain_vision の直接付与）、項目3=×（技術的評価軸なし）→ 項目5=×（not_ready へ接続すること）

### 合格例（○）

```yaml
capability:
  name: キャッシュ基盤
  kind: technical_capability
  classification: not_applicable
  classification_rationale: core分類はbusiness capability / subdomain向けのため
  evaluation:
    quality_scenario: 商品照会の応答時間要件
    failure_risk: stale data時の業務影響
    operation: invalidationと監視
    cost: 運用・移行費用
  evidence: [性能計測、障害記録、運用要件]
```

期待: 項目1=○、項目2=○、項目3=○ → 項目5=○（完成扱いは別途他基準・人間判断）

### kind 不明（項目4で unknown 停止）

```yaml
capability:
  name: 注文処理まわりの基盤
  kind: unknown
  confirmation_method: 業務オーナーへの capability 境界ヒアリング
  impact_if_unresolved: 投資判断と品質シナリオの帰属先が誤る
  evidence: []
```

期待: 項目4=○（推測確定なし）。項目1=○（unknown 明示）。完成・推奨扱いには進めない（項目5）

## ファイル全体の帰属（P3）

| 層 | 内容 |
|---|---|
| `source-derived` | capability kind 先行判定、technical capability への core/価値物語禁止、技術軸評価、Evidence 不足時の unknown |
| `operationalization` | 外部 Architecture Strategy Package 全体は輸入せず、5項目のバイナリ設計基準へ変換。`confirmation_method` / `impact_if_unresolved` を観測必須化 |
| `repository-policy` | `docs/criteria/` を運用正本とする。1ファイル10項目以内。事業価値・優先順位の承認は AI が確定しない |

外部原典: `my-take-dev/inspired-mino-design-skills` commit `afd50e2ca18bb22e336a05df1c8481dbcd652b5c`。原典の参照位置が確認できない場合は実装・照合を停止する（架空の出所を補わない）。
