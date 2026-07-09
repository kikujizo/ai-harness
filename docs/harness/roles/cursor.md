# Cursor ロール定義の解説（メイン実装担当）

Cursorの実効ルールはリポジトリに実在する。このファイルは**解説**であり、実物（`.mdc`）を複製しない
（SSOT: 実物が正本、ここは解説）。

## 実効ファイルの場所

- 実効ルール → `.cursor/rules/ai-workflow.mdc`（実装者差分。`alwaysApply: true`）
- 実効ルール → `.cursor/rules/orchestration.mdc`（同一ホスト内の委譲。正本は `../ops/orchestration.md`）
- 実効ルール → `.cursor/rules/multi-repo-shell.mdc`（複数repoの Shell 誤操作防止）
- 全AI共通の正本 → ルートの `AGENTS.md`（実効ルール。`CLAUDE.md` と整合させる）

## 標準フローでの位置づけ

Cursorはメイン実装担当。実装後の既定レビューは ChatGPT（要件）＋ Codex（技術）。
Claude Codeは通常フローの既定レビュアーではない（例外委譲時のみ関与）。
対話で最上位モデルを選んだときは、同一ホスト内の指揮者としても動く（`orchestration.md` §7）。

## 設計解説

- `.mdc` にはCursor固有の差分だけを置く。安全・独立・出力契約の正本はAGENTS.mdにあり、複製しない
  （重複すると毎ターン多重に読み込みトークンを浪費する）。
- 委譲ラダーの全文は `orchestration.mdc` に書かず、正本への参照と判定基準だけを置く。
- 実装前にタスクを1文で言い直し、変更ファイルと触らない範囲を宣言させるのは、差分を小さく保つための型。
- 「2敗で自走を止めhandoff-reportで上位へ引き継ぐ」はリトライ浪費を止めるエスカレーション規律の実装。
- 文書生成タスクではrecursive-writingを使う。`.env`・secretの秘匿とmain直push禁止は、
  指示だけでなくブランチ保護を最終防衛に置く。
