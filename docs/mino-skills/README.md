# mino-skills — 公開情報から再構築したSkillの探索実験

mino-skillsは、ミノ駆動氏の公開資料から設計上の考え方を読み取り、6つのAgent Skill（AIエージェントへ特定工程の手順と出力形式を与えるファイル）として再構築して有用性を試す実験です。
現時点では、用語と文脈の断層を整理する実例に有用な結果があります。一方、6 Skillすべての実運用効果はまだ確認できていません。

> 本スイートは公開情報からの推定再構築であり、本人の非公開Skill本文の複製や公式実装ではありません。

## 現在の結論

- **観測済み**: `mino-context-discovery`は、1件のEC題材で用語の意味の断層、境界候補、確認事項を素材へ遡れる形で整理できた。
- **観測済み**: Skillを既存ハーネスへ導入するレビューで、未導入Skillへの案内とIssueにない挙動の追加を検出し、ガードを具体化できた。
- **未確認**: 残るSkillの実タスクでの有用性、Skillを連携した場合の効果、異なるモデルや環境での再現性。
- **判断**: 6 Skillはすべてlab（実験ティア）・明示呼び出し限定のまま維持し、実例を増やしてから修正・見送り・core昇格を判断する。

詳細な証拠と判定は[検証サマリー](validation-summary.md)を参照してください。

## 6 Skillの役割と証拠状況

| Skill | 試したいこと | 現在の証拠状況 |
|---|---|---|
| [`mino-socratic-requirements`](../../.agents/skills/mino-socratic-requirements/SKILL.md) | 1問ずつの問答で要望の背後にある問題を特定できるか | **未確認**: GitHub上に実行例なし |
| [`mino-context-discovery`](../../.agents/skills/mino-context-discovery/SKILL.md) | 同じ言葉の意味・ルールの違いから境界を発見できるか | **観測済み**: EC題材の[実行例](../../.agents/skills/mino-context-discovery/references/example-ec.md)1件 |
| [`mino-event-storming`](../../.agents/skills/mino-event-storming/SKILL.md) | 業務時系列からイベント、例外、集約候補を整理できるか | **未確認**: Skill導入・レビューのみ |
| [`mino-model-deepening`](../../.agents/skills/mino-model-deepening/SKILL.md) | 暗黙の前提を疑い、説明力の高いモデル候補を出せるか | **未確認**: Skill導入・レビューのみ |
| [`mino-contract-driven-coding`](../../.agents/skills/mino-contract-driven-coding/SKILL.md) | Issueから契約を導出し、仕様を増やさず実装へ落とせるか | **一部観測済み**: 仕様上書き防止の文面ガード。実装実行は未確認 |
| [`mino-changeability-review`](../../.agents/skills/mino-changeability-review/SKILL.md) | 変更容易性の問題を補助所見として発見できるか | **未確認**: GitHub上にコード走査例なし |

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
| **観測済み** | GitHub上の入力、出力、レビュー結果へ遡れる |
| **仮説** | 公開資料や既存結果から期待できるが、実行証拠がない |
| **未確認** | 判断に必要な入力または試行が不足している |

## 次に試すこと

優先度が高いのは、既知の正解や欠陥を持つ小さな題材で各Skillを単独実行し、結果の正確性と過剰指摘を確認することです。具体的な候補は[検証サマリー](validation-summary.md#次の検証候補)に記載します。
