# mino-skills（ドラフト・検証中）

ミノ駆動氏（仙塲大也氏、『良いコード/悪いコードで学ぶ設計入門』著者）の公開講演・ポストから推定再構築したagent skill群。**本人非公認のオマージュ**であり、氏の社内スキル（DMM社）の複製ではない。出典は `core/mino-core-principles.md` 末尾を参照。

- **状態**: パイロット検証中（2026-07-12〜）。検証合意後に `kikujizo/ai-harness` へPRで移送予定
- **設計原理**: コア哲学×工程別モジュール（モディフィウス型）。1スキル=1区分、区分内は出力契約で均質化（氏の均質性制御論）
- **互換性**: Agent Skillsオープン標準（agentskills.io）準拠。frontmatterは name/description のみ使用（Cursor / Codex / Claude Code 互換）。ChatGPTはアダプタ（`adapters/chatgpt/`）を使用

## スイート構成（6本）

| # | スキル | 工程 | 状態（2026-07-12時点） |
|---|---|---|---|
| 1 | `mino-socratic-requirements` | 要求定義（ソクラテス問答×目的の言語化） | 検証済み・FB反映済み |
| 2 | `mino-context-discovery` | 境界発見（言語ゲーム×四つ組） | 検証済み・実行例同梱 |
| 3 | `mino-event-storming` | イベントストーミング→ドメインモデリング | 検証済み・FB反映済み |
| 4 | `mino-model-deepening` | モデル深化（脱構築×スキーマ理論） | 検証済み・FB反映済み |
| 5 | `mino-contract-driven-coding` | 実装（契約による設計×ドメインモデル完全性） | 検証済み・FB反映済み |
| 6 | `mino-changeability-review` | レビュー（バグサーチャー＋DbCテスト） | 検証済み（欠陥埋め込みコードの6観点走査で全該当を検出・偽陽性は保留処理）・FB反映済み |

検証記録は `validation/`（socratic-run / ec-run / game-run / es-run / deepening-run / coding-run / review-run）。deepening→coding は連鎖実行で工程間の受け渡しも検証済み。

## 導入

**今すぐ試す（配置不要・全環境共通）**: 使いたいスキルの `SKILL.md` 本文をコピーしてチャットの最初のメッセージに貼り、続けて対象の素材・要望を書く。references/ が手元にない環境では本文の出力契約のみに従えばよい。

環境別の常設導入（リポジトリ移送後）:

- **Cursor / Codex**: リポジトリの `.agents/skills/` を自動検出（追加設定不要）
- **Claude Code**: リポジトリルートで `mkdir .claude` の後 `cmd /c mklink /J .claude\skills .agents\skills` を実行（ジャンクション＝管理者権限不要。PowerShellからは `cmd /c` の前置が必須）。確認は `dir .claude\skills` でSKILL.mdフォルダが見えること。このコマンドの実行はClaude Code自身に頼んでよい。OneDrive配下などリンクが不安定な場所では、リンクせず実体コピーでもよい
- **ChatGPT**: `adapters/chatgpt/<スキル名>.md` の本文をProjectsのカスタム指示 or カスタムGPTのInstructionsへ貼る（個人プランはSkills機能非対応のため）
- **動作確認**: 導入後に「使えるスキルを一覧して」と聞き、mino-* が挙がればOK。挙がらなければ配置パスを確認する

## 運用ノート

- **正準実行順**: socratic-requirements → context-discovery → event-storming → model-deepening → contract-driven-coding → changeability-review。ネクストアクションの逆方向参照（例: deepening→context-discovery再実行）は**人間の明示指示があるときのみ**。自動連鎖では戻らない（スキル間ピンポン防止）
- **軽量実行**: 対象が小さいとき（目安: 用語5個未満・イベント5個未満・コード100行未満）は各出力項目を短縮してよい。ただし項目の省略と反証ラウンドのスキップは不可
- **分量分割**: 出力契約が長大になる場合はSTEP単位で分割出力してよい（先に全体の目次を提示する）
- **単体利用**: スキルを1本だけ導入した環境では、ネクストアクションの他スキル指名は「次に検討すべきテーマの参考」として読む
- **出力契約の構成差（意図的な例外）**: 上流4本は項目4=判断根拠・確認事項・保留事項／項目5=ネクストアクション。実装・レビューの2本（contract-driven-coding / changeability-review）は工程の性質上、確認事項を最終項目に統合し、独立のネクストアクション項目を持たない
- **既知のトレードオフ**: 設計規律（DbC・カプセル化等）が contract-driven-coding と changeability-review に別文言で重複している。スキル自己完結原則を優先した意図的な二重化であり、規律を改訂する際は両方を同時に更新すること

## フォルダ構造（ai-harnessリポジトリ内の配置）

```
ai-harness/
├── .agents/skills/
│   └── mino-<6スキル>/
│       ├── SKILL.md          ← スキル本体（正本。Cursor/Codexが自動検出）
│       └── references/       ← 検証済みの実行例（現状context-discoveryのみ同梱）
└── docs/mino-skills/
    ├── README.md             ← 本ファイル
    ├── core/mino-core-principles.md  ← コア原則のSSOT（各SKILL.mdへ複製）
    ├── adapters/chatgpt/     ← ChatGPT用単一ファイル版（6本）
    └── philosophy.md         ← 設計思想の解説（出典付き・人間向け）
```

検証の生出力（validation/ 7本）はVault側 `02_References/LLMOutputs/mino-skills-draft/validation/` に保全（移送対象外）。
