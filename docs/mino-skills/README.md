# mino-skills — 公開情報から再構築したSkillの探索実験

mino-skillsは、ミノ駆動氏の公開資料から設計上の考え方を読み取り、6つのAgent Skill（AIエージェントへ特定工程の手順と出力形式を与えるファイル）として再構築して有用性を試す実験です。
現時点では`mino-context-discovery`の出力生成と、`mino-socratic-requirements`の1件の問答・人間評価を観測済みです。6 Skillの一般的な正確性・有用性・再現性は確認できていません。

> 本スイートは公開情報からの推定再構築であり、本人の非公開Skill本文の複製や公式実装ではありません。

## 現在の結論

- **観測済み**: `mino-context-discovery`は1件の出力を生成し、入力と出力をGitHub上で追跡できる。
- **観測済み**: `mino-socratic-requirements`は1件の問答出力を生成したが、人間は約15分を要する現行方式を再利用しないと判断した。
- **未確認**: その境界候補が正しいか、人間の設計判断に役立ったか、通常プロンプトより優れるか、別案件でも再現するか。
- **未確認**: socraticの一般的優位性・再現性、その他4 Skillの出力生成・正確性・有用性、Skillを連携した場合の効果。
- **判断**: socraticはlabのまま凍結し、通常業務では提案・実行しない。その他5 Skillはlab・明示呼び出し限定を維持する。

詳細な証拠と判定は[検証サマリー](validation-summary.md)を参照してください。

## 6 Skillの役割と証拠状況

| Skill | 試したいこと | 出力生成・追跡 | 有用性・正確性 |
|---|---|---|---|
| [`mino-socratic-requirements`](../../.agents/skills/mino-socratic-requirements/SKILL.md) | 1問ずつの問答で要望の背後にある問題を特定できるか | **観測済み**: [Issue #46の問答](experiments/issue-46-socratic.md)1件 | **観測済み**: 人間は[現行方式を再利用しないと判断](experiments/issue-46-comparison.md)。一般的優位性・再現性は**未確認** |
| [`mino-context-discovery`](../../.agents/skills/mino-context-discovery/SKILL.md) | 同じ言葉の意味・ルールの違いから境界を発見できるか | **観測済み**: EC題材の[実行例](../../.agents/skills/mino-context-discovery/references/example-ec.md)1件 | **未確認** |
| [`mino-event-storming`](../../.agents/skills/mino-event-storming/SKILL.md) | 業務時系列からイベント、例外、集約候補を整理できるか | **未確認** | **未確認** |
| [`mino-model-deepening`](../../.agents/skills/mino-model-deepening/SKILL.md) | 暗黙の前提を疑い、説明力の高いモデル候補を出せるか | **未確認** | **未確認** |
| [`mino-contract-driven-coding`](../../.agents/skills/mino-contract-driven-coding/SKILL.md) | Issueから契約を導出し、仕様を増やさず実装へ落とせるか | **未確認** | **未確認** |
| [`mino-changeability-review`](../../.agents/skills/mino-changeability-review/SKILL.md) | 変更容易性の問題を補助所見として発見できるか | **未確認** | **未確認** |

## 凍結していないSkillの試し方

6 Skillはすべてlabです。`mino-socratic-requirements`は凍結済みのため通常業務では提案・実行しません。その他のSkillは、一般依頼から自動発動せず、Skill名を明示した場合だけ候補になります。

1. 凍結済みの`mino-socratic-requirements`を除き、解きたい問題に近いSkillを表から1つ選ぶ。
2. 「`mino-context-discovery`を使って」のようにSkill名を明示する。
3. 出力の各結論が入力素材へ遡れるか確認する。
4. 結果を[検証サマリー](validation-summary.md)の区分で記録する。

固定の6段パイプラインとして順番に実行する必要はありません。複数の凍結していないSkillをつなぐ場合も、人間が次のSkillを明示指定します。

実案件でsocraticと同種の要求整理ニーズが再発した場合は、現行Skillを実行せず、ChatGPTがAI推論・少数質問・選択式の軽量案を提案します。人間が採用した場合に限り、別Issueで再設計します。

## 結果の区分

| 区分 | 意味 |
|---|---|
| **観測済み** | その欄に書いた事実をGitHub上の証拠から直接確認できる |
| **仮説** | 公開資料や既存結果から期待できるが、実行証拠がない |
| **未確認** | 判断に必要な入力または試行が不足している |

## 次に試すこと

優先度が高いのは、凍結していないSkillを既知の正解や欠陥を持つ小さな題材へ単独適用し、結果の正確性と過剰指摘を確認することです。具体的な候補は[検証サマリー](validation-summary.md#次の検証候補)に記載します。
