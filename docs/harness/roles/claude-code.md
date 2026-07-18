# Claude Code ロール定義の解説（フェールセーフ・例外要員）

Claude Codeの実効ファイルはリポジトリに実在する。このファイルは**解説・同期対象**であり、実物を複製しない
（SSOT: ルートの `CLAUDE.md` が実効ルール、ここは解説）。

## 標準フローでの位置づけ

Claude Codeは標準フロー（ChatGPT/Codex/Cursor中心）に**常駐しない**。
「技術スーパーバイザ」「Cursor実装の既定レビュアー」ではなく、**全役割の代理が可能な例外要員**である。
対話レーンでは指揮者（オーケストレーター）として動ける。

## 参加条件（例外委譲のみ）

次のいずれかに該当するとき、Codex PMが `route=claude-code` で起動する:

1. Codex / Cursor / ChatGPT のいずれかがレートリミット・停止・環境制約で行動不能
2. Cursor実装が停滞し、Codex PMが例外委譲を判断
3. 原因不明のエラー・複雑な設計判断・緊急復旧などで、Codex PMがClaude Code起動を明示

代理参加時は、**代理した役割・理由をGitHubコメントに明記**する（`AGENTS.md`「GitHubドリヴン記録」）。

Claude Codeが実装した場合のレビューは Codex ＋ ChatGPT（不可なら人間）。

## 実効ファイルの場所

- 行動ルール本体 → ルートの `CLAUDE.md`（役割・オーケストレーション規律・トークン規律・絶対ルール）
- 権限設定 → `.claude/settings.json`（読み取り許可・破壊/秘匿denyの実JSON）
- Skill → `.agents/skills/`（業界規約のSSOT。Claude Code向けは `setup-links` がセットアップ時に
  `.claude/skills` ジャンクション（macOS/Linuxはシンボリックリンク）を張る。リンクはコミットしない）
- 全AI共通の正本 → ルートの `AGENTS.md`

## settings.json の設計解説

方針: 読み取り系は許可して確認プロンプトを減らし、破壊系・秘匿系は明示的に拒否する。
プロジェクトの `.claude/settings.json` に置けばチーム共有され、設定が個人PCに依存しない（再現性）。

- **権限パターンの構文**: Bashの前方一致は `Bash(コマンド:*)`（`:*` が公式構文。`git diff*` のような
  裸の後置ワイルドカードは一致しない）。Read/Edit/Write のパスはgitignore形式で、相対は `./` 始まりが確実
- `Edit/Write(./.github/workflows/**)`・`./.codex/**`・`./.cursor/**`・`./.claude/**`・`./.agents/**`・
  `AGENTS.md`・`CLAUDE.md` の**ask**は**高リスクカテゴリ③（権限・パイプライン自己変更）の機械的な裏付け**
  （ルートの `AGENTS.md` のリスク分類参照）。`./.agents/**` はSkillの正本置き場でありAI設定ディレクトリに含まれる。
  これらは作業ツリー上の編集が即時に効く「生きたガードレール」のため、編集の瞬間が発効点になる—
  askプロンプトがその発効点の人間approve/denyを機械化する（責務境界の再定義 2026-07-18。
  非対話実行では拒否として振る舞う）。実装AIと独立したレビュー＋発効点の人間approve＋
  Decision Log記録は引き続き必須。機械壁は撤廃せずask化して常設する
- `Bash(gh pr merge:*)` の**ask**は、merge＝発効点の人間ゲートの機械的な裏付け。
  通常リスクPRは自動マージ条件（AGENTS.md）充足時にmergeでき、高リスクPRは人間approve後に
  AIがmergeを実行する—どちらもaskプロンプトが最終確認になる
  （下流リポジトリへの適用は人間がdeny/ask設定込みで個別判断）。
  `Bash(gh repo edit:*)` は「リポジトリ設定変更禁止」（カテゴリ③のうちdiffで観測できない変更）の
  denyによる機械的な裏付け。`Read(./**/.env)`・`Read(./**/.env.*)` はサブディレクトリの `.env` も塞ぐ
- `deny` の `Read(./.env)` はCLAUDE.mdの禁止ルールの**機械的な裏付け**。
  「CLAUDE.mdに書いても徹底されない」問題への対策は、指示ではなく権限で塞ぐこと
- denyパターンはコマンド表現の差異で迂回されうる。最終防衛はGitHubのブランチ保護
  （mainへのpush禁止・レビュー必須）に置く
- pre-commitでのsecretスキャン・main保護・`--no-verify`禁止は、プロジェクトに合うフック実装を別途用意する
- 許可リストを増やしたくなったら、Claude Codeの `/fewer-permission-prompts` で
  実際の利用履歴から安全な候補を提案させると手作業より正確
