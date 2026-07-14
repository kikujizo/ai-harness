---
name: route-pm-model
description: PM作業の開始時に、Terra・Luna・Solの候補route、安全停止、実績記録を判定するlab Skill。Issue評価、PRレビュー、GitHub確認、明示的・反復的・大量の抽出/分類/変換/定型要約、仕様矛盾、原因不明、複数系設計、最終裁定、高リスク4カテゴリの分析で使う。モデル切替や子エージェント起動を実行せず、候補と安全なフォールバックまたは停止を記録する。
---

> **ティア**: lab（`AGENTS.md`「lab 共通規則」に従う。AI判断で発動する場合は発動宣言と実績記録を必須とする）

# route-pm-model: 安全なルーティング候補と実績記録

このSkillは**候補routeの判定・安全停止・実績記録だけ**を扱う。`.codex/`設定、実モデル切替、名前付きカスタムエージェントの起動、tokenの実測は行わない。

## 手順

1. **高リスクを先に判定する**
   秘匿・個人情報、課金、権限・パイプライン自己変更、不可逆データ操作のいずれかなら、`route_candidate=sol` と `gate=human_approval` を出す。分析はできても、人間承認まで不可逆な実行を停止する。
2. **通常の候補routeを判定する**
   - 明示的・反復的・大量の抽出、分類、変換、定型要約: `route_candidate=luna`
   - 仕様矛盾、原因不明、複数系設計、最終裁定、または信頼度が0.75未満: `route_candidate=sol`
   - 一般的なIssue評価、PRレビュー、GitHub確認: `route_candidate=terra`
3. **実行可否を偽装せず処理する**
   名前付きカスタムエージェントを利用できない場合:
   - `terra`: Terra親で継続し、`route_executed=terra_parent` とする。
   - `luna`: `fallback=terra_parent` を記録してTerra親で継続する。無名子への代替委譲、自動再試行、Lunaを実行したという表明はしない。
   - `sol`: Solが必須の判断は `ROUTE_BLOCKED` として停止する。Terraによる最終裁定の代替完了を表明しない。
4. **将来の子起動にも適用する制約を確認する**
   LunaまたはSolの子を起動できる状態になった場合も、子は1体・1回、再委譲禁止、read-only、返却600 token以下とする。Luna委譲は、親に大量コンテキストを保持させるより明確に低コストと説明できる場合だけ候補にする。
5. **実績を記録する**
   使用後、関連Issue・PRコメントまたはhandoffへ次の形式を記録する。

```text
route_candidate=<terra|luna|sol>
route_executed=<terra_parent|luna_child|sol_child|blocked>
parent_child=<parent_only|parent_plus_one_child>
input_estimate=<概算tokenまたはsmall|medium|large>
return_estimate=<概算tokenまたはsmall|medium|large>
outcome=<得られた成果または有効な追加発見なし>
fallback=<none|terra_parent|blocked>
misroute=<none|内容>
stop_reason=<none|理由>
```

## `ROUTE_BLOCKED`の出力

Sol必須の判断を停止するときは、候補route、停止理由、未完了の判断、解除条件を明記する。

```text
ROUTE_BLOCKED
route_candidate=sol
stop_reason=<Sol必須だが利用不能>
unfinished_decision=<未完了の判断>
unblock_condition=<名前付きSolエージェントを利用可能にする、または人間が判断する>
```

## 例

- 一般的なIssueのPM評価: `route_candidate=terra`、`route_executed=terra_parent`、`parent_child=parent_only`
- 形式固定の大量分類だがLuna未対応: `route_candidate=luna`、`route_executed=terra_parent`、`fallback=terra_parent`
- 仕様矛盾を含む最終裁定でSol未対応: `ROUTE_BLOCKED`。対象判断を停止する。
- 権限・パイプライン自己変更: `route_candidate=sol`、`gate=human_approval`。不可逆な実行を停止する。

## 禁止事項

- `.codex/`設定、モデル名、設定キー、子エージェント起動機構を変更しない。
- 無名子への代替委譲、自動再試行、未実行モデルへの切替済み表明をしない。
- `ROUTE_BLOCKED`のSol必須判断をTerraで最終裁定しない。
- core昇格、lab継続、Archiveを自動決定しない。

実案件2回以上の記録が蓄積した時点で、成果、呼び出し回数、入出力量概算、誤ルーティング、停止、節約仮説をまとめる。core昇格・lab継続・Archiveの最終判断は人間が行う。
