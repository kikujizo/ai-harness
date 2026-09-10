# 共通テンプレート集

AI間・AIと人間の引き継ぎを、会話記憶ではなく固定フォーマットで行うためのテンプレ。
リポジトリ内の `docs/templates.md` として配置し、引き継ぎの正本にする。
**埋まらない欄は「なし」と書く（省略しない）。**

---

## 1. 実装指示書（PM → 実装AI）

```markdown
# 実装指示書

## 目的（1文）
## 関連Issue
## 対象範囲
- 変更してよいファイル:
- 変更してはいけない範囲:
## 実装内容（手順）
1.
## 受け入れ条件（5項目以内）
- [ ]
## 注意点
- 仕様判断が必要な箇所は実装せず、レビュー依頼に含めること
```

## 2. レビュー依頼（実装AI → レビューAI / 人間）

ルートの `AGENTS.md`「出力契約」の見出しをそのまま使う。

```markdown
# レビュー依頼

## 実施した作業
## 変更ファイル
## 主な変更点
## テスト結果
## 未解決事項
## リスク（不可逆4カテゴリ、および包括規則の該当有無）
## 人間が理解すべきポイント（平易な1文）
## レビュー観点
- 受け入れ条件を満たすか / 変更範囲が過剰でないか / セキュリティ問題がないか / 次に進んでよいか
```

`## レビュー観点` は出力契約7見出し＋レビュー時のみの追加見出し（8番目）。正本はルートの `AGENTS.md`
「出力契約」。

## 3. レビュー結果（レビューAI → 人間）

```markdown
# レビュー結果

## 判定: merge可能 / 修正必須 / 保留
## 受け入れ条件との照合（1項目ずつ ○/×/確認不能）
## 指摘（重要度順・場所を名指し）
| # | 場所 | 内容 | 対応: 今回修正 / 後回し（追跡Issue URL必須） / wontfix（理由1行） |
## Next Action（誰が何をするか1行）

（任意）SUBJECT_VERDICT: {pass|fail|incomplete|not-applicable}
（任意）ARTIFACT_READINESS: {ready|draft}
REVIEW_VERDICT: {approve|request-changes} [risk=high]
```

判定3値とverdict2値の対応: **merge可能=`approve`、修正必須・保留=`request-changes`**。
`REVIEW_VERDICT:` はAI間機械伝達用の最終行（保留の理由は本文に明示）。補助行（`SUBJECT_VERDICT` / `ARTIFACT_READINESS`）は任意。
書式の正本はルートの `AGENTS.md`「出力契約」の verdict 定義に従う。

### verdict 補足（route / gate / 補助行）

書式の正本はルートの `AGENTS.md` verdict 節。要点のみ:

- `route`: 次に処理を担当する主体（`cursor`・`claude-code`）。AI PMが確定して付与。
- `gate`: 満たすまで不可逆操作を実行しない停止条件。高リスク推奨: `gate=human_approval`
  （不可逆操作の発効点＝merge・設定反映での人間approve/deny。実装開始の事前承認ではなく、
  人間が作業する意味でもない）。
- `route=human`: deprecated 互換表記。意味は人間承認ゲート。今後の推奨は `gate=human_approval`。
- 補助行 (`SUBJECT_VERDICT` / `ARTIFACT_READINESS`): 評価対象の状態や成果物の準備状況を分離して報告する際に使用。詳細は `AGENTS.md` 参照。

## 4. Decision Log（既定は `docs/decisions.md` へ追記。導入先に `docs/decisions/` の日付ファイル慣行が既にあればそちらに従う）

抜本変更・ゼロベース変更・高リスク変更・方針転換に使う。

```markdown
# Decision: {title}

Date: YYYY-MM-DD
Status: Proposed / Accepted / Rejected / Superseded
Related Issues: #
Related PRs: #

## 決定事項
何を決めたか（1〜3文）。

## 背景・課題
なぜこの判断が必要になったか。

## 採用する方針
-

## 採用しない方針 / 却下した代替案
- {案}: メリット / デメリット / 却下理由

## 判断理由
-

## リスク（不可逆4カテゴリ、および包括規則の該当有無）
-

## 影響範囲
-

## 取り消し手順
この決定を撤回する場合、何をどう戻すか。不可逆な部分があれば「不可逆」と明記し、人間承認を記録する。
-

## 見直す条件
どうなったら再検討するか。

## 次アクション
- [ ]
```

作成基準: セキュリティ/権限/データ保持の変更、複数案から却下したものがある、
技術スタックの大きな変更、「半年後に理由の説明が必要になりそう」のいずれか。

## 5. Session Note（`docs/session-notes/YYYY-MM-DD-{topic}.md`）

1回の作業セッションの記録。次の担当（AI・人間）が会話記憶なしで再開できることを目的にする。

````markdown
# Session Note: {title}

Date: YYYY-MM-DD
Related Issue: #
Related PR: #

## 目的
この作業で達成したかったこと。

## 実施したこと
-

## 変更内容
-

## 確認したこと
- [ ]

## テスト結果
```text
{実行コマンドと結果}
```

## リスク（不可逆4カテゴリ、および包括規則の該当有無）
-

## 未確認事項
-

## 判断したこと
-

## 次にやること
-

## 学んだこと
-

## 人間向け1行説明
{この変更を1行で説明}
````

## 6. 昇格提案（knowledge-reflux → 人間承認）

P3（Issue #73）マージ後の新規昇格提案に使う。帰属区分の正本は `docs/harness/knowledge/reflux.md` §3層帰属区分。

```markdown
# 昇格提案: {知見の短いタイトル}

## 知見
{何を昇格させるか（1〜3文）}

## 提案する昇格先
- [ ] docs/（読み物として構造化）
- [ ] docs/criteria/（新規基準ファイル）
- [ ] docs/criteria/（既存基準への項目追記: {ファイル名}）
- [ ] AGENTS.md

## 根拠（数値ゲート）
- 参照回数 / ×の実績: {ゲート①②③のどれに該当するか}

## 帰属（必須）
attribution: {source-derived | operationalization | repository-policy}
source:
- source-derived の場合: 原典URLまたは識別可能な出所
- operationalization の場合: 根拠原典（または上位知見）と、ai-harness側で加えた解釈を分けて記載
- repository-policy の場合: 採用理由と適用範囲（外部URLは不要）

## 出所不明時
attribution または source を埋められない場合は本提案を出さず、docs/ または生メモに留める。
```

## 7. 基準ファイル（`docs/criteria/{対象}.md`）

再帰的推論ループ（ルートの `AGENTS.md`「品質ループ」）で使い回す基準。1ファイル10項目以内。
P3（Issue #73）マージ後に新規作成・新規昇格する項目には帰属欄を必須とする（既存 criteria への遡及適用はしない）。

```markdown
# 基準: {対象。例: 良い仕様書 / 良いPRレビュー / 読みやすい社内文書}
1. {検証可能な形で書く。例:「受け入れ条件がすべて観測可能な事象で書かれている」}
   attribution: {source-derived | operationalization | repository-policy}
   source:
   - source-derived: 原典URLまたは識別可能な出所
   - operationalization: 根拠原典（または上位知見）と ai-harness 側の追加解釈を分離
   - repository-policy: 採用理由と適用範囲
2. {2項目目}
   attribution:
   source:
...
```

## 8. 実行計測ログ（ループの計測を機械的に残す）

`docs/loop-ledger.md` が要求する最小計測と、ルートの `AGENTS.md`「品質ループ」の無進展検知を、
タスク単位で1件ずつ残す形式。人間が毎回手で書く運用ではなく、ワークフロー側が機械的に追記できる項目にする。
マージ要約コメント等への追記を想定する。

```markdown
# 実行計測ログ
- タスク/Issue:
- ループ種別（`docs/harness/loops/principles.md` 参照）:
- 反復回数:
- 無進展検知: 発生した（何周目か） / しなかった
- フォールバック発動: あり（理由） / なし
- 所要時間（開始〜終了）:
- 最終ステータス: 正常終了 / 自動停止 / 人間エスカレーション
```

## 9. 高リスク scope=merge 監査証跡テンプレ

起点 commit `08c6c7fb0a42b637bceea9edbe0aeb0b8e2816fc`（PR #135 merge 自身を含む）以降に merged された PR について、
high-risk かつ `scope=merge` 発効点が成立した対象のみを監査する。通常リスクの自動マージは対象外。
証跡不足を推測で `pass` にしない。`verdict` は `pass` / `incident` / `unknown` のみ。

**G1 該当パス（漏れ防止の正本）**: 起点以降 merged の PR について `gh api pulls/{n}/files` で変更ファイルを確認し、
次のいずれかを変更していれば監査候補とする — `AGENTS.md` / `CLAUDE.md` / `.agents/` / `.github/workflows/` /
`.claude/` / `.codex/`。候補から外す場合は「対象外」節に理由と files URL を残す（表から消して忘れない）。
Decision Log 単独 PR（`docs/decisions.md` のみ）は G1 非該当として対象外にできる。

```markdown
# 高リスク scope=merge 限定監査

起点commit: 08c6c7fb0a42b637bceea9edbe0aeb0b8e2816fc
検索条件: 起点以降に merged された PR のうち、risk=high かつ APPROVAL_SCOPE: merge 発効点が成立したもの

## 対象PR: #{N}

- canonical_proposal_url: {merge前 canonical proposal の exact GitHub comment URL}
- canonical_proposal_created_at: {ISO-8601}
- human_approval_source: {人間の明示 approve|deny の観測根拠 URL または「なし」}
- approval_record_url: {merge前 active HUMAN_APPROVAL_RECORD: v2 の exact URL または「なし」}
- v2_approval_record_created_at: {ISO-8601 または「なし」}
- readback_evidence_url: {merge前 readback・完全一致照合結果を記録した GitHub exact comment URL または「なし」}
- readback_at: {readback完了時刻 ISO-8601 または「なし」}
- head_at_readback: {照合時 40-hex HEAD または「なし」}
- field_match: passed|failed|なし
- subject: {record subject または「なし」}
- scope: merge
- human_decision: approve|deny|なし
- proposed_route: none
- merge_allowed: true|false|なし
- stop_reason: {approval_record_missing|approval_record_unverified_before_effect|approval_record_mismatch|approval_record_ambiguous|なし}
- merge_created_at: {PR merge 時刻 ISO-8601}
- verdict: pass|incident|unknown

判定基準:
- merge前に有効record + readback証跡 + HEAD一致 + field_match=passed → pass
- recordがmerge後、または readback_at >= merged_at → incident
- recordはmerge前だが readback証跡不足 / readback_at不明 / HEAD・field一致確認不能 → unknown
- 対象特定不能 → unknown
```

**readback 4field 定義（本節が正本）**:

- `readback_evidence_url`: merge 前に readback・完全一致照合結果を記録した GitHub exact comment URL
- `readback_at`: readback 完了時刻（ISO-8601）
- `head_at_readback`: 照合時の 40-hex HEAD
- `field_match`: 必須field＋復唱確認の完全一致結果（`passed|failed`）

`HUMAN_APPROVAL_RECORD: v2` の既存 field 定義（`subject` / `scope` / `proposal_url` / `proposed_route` /
`decision` / `approval_source` / `recorded_by` / `supersedes` 等）はルート `AGENTS.md` 正本の意味を変更しない。
本テンプレは監査追跡用の追加 field を定義するのみである。
