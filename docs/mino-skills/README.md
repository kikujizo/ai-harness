# mino-skills — 公開情報から再構築したSkillの探索実験

mino-skillsは、ミノ駆動氏の公開資料から設計上の考え方を読み取り、6つのAgent Skill（AIエージェントへ特定工程の手順と出力形式を与えるファイル）として再構築して有用性を試す実験です。
現時点で確認できるのは、`mino-context-discovery`が1件の出力を生成し、GitHub上で追跡できることまでです。6 Skillの正確性や有用性はまだ確認できていません。

> 本スイートは公開情報からの推定再構築であり、本人の非公開Skill本文の複製や公式実装ではありません。

## 現在の結論

- **観測済み**: `mino-context-discovery`は1件の出力を生成し、入力と出力をGitHub上で追跡できる。
- **未確認**: その境界候補が正しいか、人間の設計判断に役立ったか、通常プロンプトより優れるか、別案件でも再現するか。
- **未確認**: その他5 Skillの出力生成、正確性、有用性、Skillを連携した場合の効果。
- **判断**: 有用性は6 Skillすべて未確認。lab（実験ティア）・明示呼び出し限定のまま、実例を増やして判断する。

詳細な証拠と判定は[検証サマリー](validation-summary.md)を参照してください。

## 6 Skillの役割と証拠状況

| Skill | 試したいこと | 出力生成・追跡 | 有用性・正確性 |
|---|---|---|---|
| [`mino-socratic-requirements`](../../.agents/skills/mino-socratic-requirements/SKILL.md) | 1問ずつの問答で要望の背後にある問題を特定できるか | **未確認** | **未確認** |
| [`mino-context-discovery`](../../.agents/skills/mino-context-discovery/SKILL.md) | 同じ言葉の意味・ルールの違いから境界を発見できるか | **観測済み**: EC題材の[実行例](../../.agents/skills/mino-context-discovery/references/example-ec.md)1件 | **未確認** |
| [`mino-event-storming`](../../.agents/skills/mino-event-storming/SKILL.md) | 業務時系列からイベント、例外、集約候補を整理できるか | **未確認** | **未確認** |
| [`mino-model-deepening`](../../.agents/skills/mino-model-deepening/SKILL.md) | 暗黙の前提を疑い、説明力の高いモデル候補を出せるか | **未確認** | **未確認** |
| [`mino-contract-driven-coding`](../../.agents/skills/mino-contract-driven-coding/SKILL.md) | Issueから契約を導出し、仕様を増やさず実装へ落とせるか | **未確認** | **未確認** |
| [`mino-changeability-review`](../../.agents/skills/mino-changeability-review/SKILL.md) | 変更容易性の問題を補助所見として発見できるか | **未確認** | **未確認** |

## 試し方

6 Skillはすべてlabです。一般依頼から自動発動せず、Skill名を明示した場合だけ使います。

1. 解きたい問題に近いSkillを表から1つ選ぶ。
2. 「`mino-context-discovery`を使って」のようにSkill名を明示する。
3. 出力の各結論が入力素材へ遡れるか確認する。
4. 結果を[検証サマリー](validation-summary.md)の区分で記録する。

固定の6段パイプラインとして順番に実行する必要はありません。複数Skillをつなぐ場合も、人間が次のSkillを明示指定します。

## 結果の区分

| 区分 | 意味 |
|---|---|
| **観測済み** | その欄に書いた事実をGitHub上の証拠から直接確認できる |
| **仮説** | 公開資料や既存結果から期待できるが、実行証拠がない |
| **未確認** | 判断に必要な入力または試行が不足している |

## 次に試すこと

優先度が高いのは、既知の正解や欠陥を持つ小さな題材で各Skillを単独実行し、結果の正確性と過剰指摘を確認することです。具体的な候補は[検証サマリー](validation-summary.md#次の検証候補)に記載します。
