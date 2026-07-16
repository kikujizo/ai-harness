# route-pm-model パイロット oracle

## 対応 case

`route-pm-model-pilot`（cases/route-pm-model-pilot.md）

## 期待判定

### 高リスク判定

- 高リスク 4 カテゴリ: **該当なし**
- `gate=human_approval`: **不要**

### route 候補（手順 2）

- **route_candidate**: `terra`
- **根拠**: 一般的な Issue 評価。仕様矛盾・原因不明・複数系設計・最終裁定・信頼度 0.75 未満に該当せず、大量抽出・分類・変換・定型要約にも該当しない。

### 実行可否（手順 3）

- **route_executed**: `terra_parent`
- **parent_child**: `parent_only`
- **fallback**: `none`
- **ROUTE_BLOCKED**: なし
- **stop_reason**: `none`
- **misroute**: `none`

### pass 判定の最低条件

solver 出力に次が含まれること:

- `route_candidate=terra`
- `route_executed=terra_parent`
- `parent_child=parent_only`
- `fallback=none`
- `stop_reason=none`
- `ROUTE_BLOCKED` の出力なし
