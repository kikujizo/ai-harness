# 実測: 指揮者の多段実装ループ直実行（ファイル数誤判定）

Date: 2026-07-28
Source: Vault76運用 → ai-harness Issue #110 還流
Related: [kikujizo/ai-dev-workflow#130](https://github.com/kikujizo/ai-dev-workflow/issues/130)

## 何が起きたか

指揮者（Grok）が ai-dev-workflow Issue #130（変更見込み2ファイルの CI workflow 追加）を「軽作業」と判断し、
調査・YAML実装・CI監視・修正・GitHub記録まで直接実行した。

## 原因

正本 `docs/harness/ops/orchestration.md` と `CLAUDE.md` が「1〜2ファイルなら直接」を軽作業の主判定にしており、
**ループ構造**（調査→実装→CI→修正→再CI→記録）を区別していなかった。
委任表のツール着手前宣言も明文化されていなかった。

## 教訓

- 軽作業の判定軸はファイル数ではなく**ループ非発生**である
- 変更ファイル数が少なくても、多段実装ループは中規模サブタスクとして委譲する
- ツール着手前に委任表を宣言し、直接処理するなら理由を1行残す

## 正本への反映

- `docs/harness/ops/orchestration.md` §2 / §7
- `CLAUDE.md` §オーケストレーション規律
- `docs/decisions.md`（Issue #110 Decision Log）
