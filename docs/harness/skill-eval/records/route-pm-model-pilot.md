# route-pm-model パイロット evaluation record

> **パイロット記録**: 本 record は実装セッション内で `route-pm-model` 手順を case に論理適用した評価記録であり、別セッション実行の装いではない。

## 外部由来 vs ai-harness 固有（本 record）

- **外部由来**: counted run、入力ダイジェスト、fresh context、oracle 事前非開示の概念
- **ai-harness 固有**: 本ファイルの配置・フィールド名・`route-pm-model` パイロット case への適用

## Counted runs

### run-001

- run_id: run-001
- input_sha256: 90910f7e3ea51449b40c725a15ab6bb011f4259853ca04e8eb92c8b31f5125c7
- model: Composer
- workspace: ws-pilot-a
- fresh_context: true
- oracle_undisclosed_before_solve: true
- solver_summary: |
  手順1: 高リスク4カテゴリ該当なし。手順2: 一般Issue評価のため route_candidate=terra。
  手順3: Luna/Sol子未設定、Terra親継続可 → route_executed=terra_parent, parent_child=parent_only, fallback=none。
  実績: route_candidate=terra, route_executed=terra_parent, parent_child=parent_only,
  input_estimate=small, return_estimate=small, outcome=得られた成果または有効な追加発見なし,
  fallback=none, misroute=none, stop_reason=none
- evaluation: pass — oracle の route_candidate=terra, route_executed=terra_parent, ROUTE_BLOCKED なしと一致

### run-002

- run_id: run-002
- input_sha256: 90910f7e3ea51449b40c725a15ab6bb011f4259853ca04e8eb92c8b31f5125c7
- model: Composer
- workspace: ws-pilot-b
- fresh_context: true
- oracle_undisclosed_before_solve: true
- solver_summary: |
  高リスクなし。仕様矛盾・Sol条件・Luna大量処理条件いずれも非該当。
  route_candidate=terra, route_executed=terra_parent, parent_child=parent_only, fallback=none, stop_reason=none
- evaluation: pass — 期待 terra 系 route、停止・fallback なし

### run-003

- run_id: run-003
- input_sha256: 90910f7e3ea51449b40c725a15ab6bb011f4259853ca04e8eb92c8b31f5125c7
- model: Composer
- workspace: ws-pilot-c
- fresh_context: true
- oracle_undisclosed_before_solve: true
- solver_summary: |
  手順1〜2適用: ドキュメント追加Issueの通常PM評価 → route_candidate=terra。
  手順3: terra_parent継続。ROUTE_BLOCKED 出力なし。gate 不要。
- evaluation: pass — oracle 最低条件（terra / terra_parent / parent_only / fallback=none）を満たす
