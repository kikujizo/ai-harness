# Claude Code ロール定義の解説（技術スーパーバイザ）

Claude Codeの実効ファイルはリポジトリに実在する。このファイルは**解説**であり、実物を複製しない
（SSOT: 実物が正本、ここは解説）。

## 実効ファイルの場所

- 行動ルール本体 → ルートの `CLAUDE.md`（役割・オーケストレーション規律・トークン規律・絶対ルール）
- 権限設定 → `.claude/settings.json`（読み取り許可・破壊/秘匿denyの実JSON）
- Skill → `.agents/skills/`（業界規約のSSOT。Claude Code向けは `setup-links` がセットアップ時に
  `.claude/skills` ジャンクションを張る。リンクはコミットしない）
- 全AI共通の正本 → ルートの `AGENTS.md`

## settings.json の設計解説

方針: 読み取り系は許可して確認プロンプトを減らし、破壊系・秘匿系は明示的に拒否する。
プロジェクトの `.claude/settings.json` に置けばチーム共有され、設定が個人PCに依存しない（再現性）。

- **権限パターンの構文**: Bashの前方一致は `Bash(コマンド:*)`（`:*` が公式構文。`git diff*` のような
  裸の後置ワイルドカードは一致しない）。Read/Edit/Write のパスはgitignore形式で、相対は `./` 始まりが確実
- `Edit/Write(./.github/workflows/**)`・`./.codex/**`・`./.cursor/**`・`./.claude/**`・`./.agents/**`・
  `AGENTS.md`・`CLAUDE.md` のdenyは**高リスクカテゴリ③（権限・パイプライン自己変更）の機械的な裏付け**
  （ルートの `AGENTS.md` のリスク分類参照）。`./.agents/**` はSkillの正本置き場でありAI設定ディレクトリに含まれる。
  AIは通常フローでこれらのパスを変更できず、変更が必要なタスクでは停止して人間の承認を求める。
  承認後は人間が用意した専用ブランチ・環境で実装できる（実装AIと独立したレビュー＋人間merge＋
  Decision Log記録を必須）。denyの機械壁は常設のまま外さない
- `Bash(gh pr merge:*)` のdenyはAGENTS.md「mergeは人間」の、`Bash(gh repo edit:*)` は「リポジトリ設定変更禁止」
  （カテゴリ③）の機械的な裏付け。`Read(./**/.env)`・`Read(./**/.env.*)` はサブディレクトリの `.env` も塞ぐ
- `deny` の `Read(./.env)` はCLAUDE.mdの禁止ルールの**機械的な裏付け**。
  「CLAUDE.mdに書いても徹底されない」問題への対策は、指示ではなく権限で塞ぐこと
- denyパターンはコマンド表現の差異で迂回されうる。最終防衛はGitHubのブランチ保護
  （mainへのpush禁止・レビュー必須）に置く
- pre-commitでのsecretスキャン・main保護・`--no-verify`禁止は、プロジェクトに合うフック実装を別途用意する
- 許可リストを増やしたくなったら、Claude Codeの `/fewer-permission-prompts` で
  実際の利用履歴から安全な候補を提案させると手作業より正確
