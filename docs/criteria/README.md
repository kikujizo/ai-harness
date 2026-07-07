# criteria/ — 再帰照合ループの基準ファイル置き場

`recursive-writing` / `recursive-review` スキルがここを参照する。
開発リポジトリで使う場合は、リポジトリ内の `docs/criteria/` にコピーして使う。

## このフォルダのファイル

- [criteria-design-guide.md](criteria-design-guide.md) — **基準ファイルの作り方自体の方法論**（バイナリ化・観測手順・較正・剪定）。
- [writing-criteria.md](writing-criteria.md) — 文書・記事・報告書向けの基準。

仕様書向けの基準など、役割固有の基準はそれぞれの役割ファイル（`../../roles/`）と共用する。

## 運用ルール

- **1ファイル10項目以内**。バイナリ（○/×） + 観測手順で書く（詳細は [criteria-design-guide.md](criteria-design-guide.md)）。
- レビューで「基準外の気づき」が**3回同内容**なら、既存の基準ファイルへ項目として追記する（[../reflux.md](../reflux.md) のゲート②）。
- 新しい基準は最初の2〜3回、人間がAIの判定を確認して較正する。
- 先回りして量産しない。**使われない基準は注意力とトークンの無駄**。
