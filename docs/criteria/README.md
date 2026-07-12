# docs/criteria/ — 再帰照合ループの基準ファイル置き場（運用正本）

`recursive-writing` / `recursive-review` スキルがここを参照する。
このフォルダはこのリポジトリの**運用正本**で、日々の基準はここで育てる。

## このフォルダのファイル

- [writing-criteria.md](writing-criteria.md) — 文書・記事・報告書向けの基準（同梱の初期1枚）。
- [code-review-criteria.md](code-review-criteria.md) — コード変更（diff/PR）向けのバイナリ基準（第1層）。実測ミス由来6項目＋暫定4項目。
- [quality-lens.md](quality-lens.md) — コード向けの走査レンズ（第2層・非バイナリ）。集合知由来。発火2回で第1層へ昇格する補完層で、「1ファイル10項目以内・バイナリ」の運用ルールはこのファイルには適用しない（チェックリストではないため）。

基準ファイルの作り方自体の方法論（バイナリ化・観測手順・較正・剪定）は
[`../harness/knowledge/criteria-design-guide.md`](../harness/knowledge/criteria-design-guide.md) を参照する。
仕様書向けの基準など、役割固有の基準はそれぞれの役割ファイル（`../harness/roles/`）と共用する。

## 運用ルール

- **1ファイル10項目以内**。バイナリ（○/×） + 観測手順で書く（詳細は [`../harness/knowledge/criteria-design-guide.md`](../harness/knowledge/criteria-design-guide.md)）。
- レビューで「基準外の気づき」が**3回同内容**なら、既存の基準ファイルへ項目として追記する（[`../harness/knowledge/reflux.md`](../harness/knowledge/reflux.md) のゲート②）。
- 新しい基準は最初の2〜3回、人間がAIの判定を確認して較正する。
- 先回りして量産しない。**使われない基準は注意力とトークンの無駄**。初回運用の×から起こす。
