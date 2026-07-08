# GitHub 連携（Cursor / Cloud Agent）

本ハーネスは `AGENTS.md`「GitHubドリヴン記録」により、レビュー・判断・verdict を Issue/PR へ
残す前提で設計されている。GitHub の読み書きは **2系統** あり、用途ごとに設定する。

| 系統 | 用途 | 設定場所 |
|---|---|---|
| **Cursor GitHub App** | clone / branch / push / PR 作成（Cloud Agent 標準） | [Cursor Dashboard → Integrations → GitHub](https://cursor.com/dashboard/integrations) |
| **GitHub MCP** | Issue/PR の API 操作（コメント投稿・Issue 更新・検索等） | Dashboard の MCP 設定、または `.cursor/mcp.json` |

どちらか一方だけでは不十分な場合がある（下記「診断」参照）。

## 1. Cursor GitHub App（git 操作・PR 作成）

Cloud Agent がリポジトリを clone し、feature branch へ push し、PR を開くにはこちらが必要。

1. [Cursor Dashboard → Integrations → GitHub](https://cursor.com/dashboard/integrations) で GitHub を接続する
2. 対象 org / リポジトリへ [Cursor GitHub App](https://github.com/apps/cursor) をインストールする
3. **Repository access** で対象リポジトリ（または All repositories）を選択する
4. プライベート org リポジトリの場合、インストールには org admin 権限が必要なことがある

App が付与する主な権限（概要）:

- Repository access（clone / push）
- Pull requests（PR 作成・レビューコメント）
- Issues（Issue 参照・更新）
- Checks / Actions（CI 状態の参照）

## 2. GitHub MCP（Issue/PR API・コメント投稿）

`gh` CLI や git だけでは足りない操作（Issue への structured コメント、Issue 検索・更新等）向け。
Cloud Agent では **Dashboard → Integrations & MCP** から HTTP MCP を追加するのが推奨。

### 2a. Cloud Agent（推奨）

1. [Cloud Agents → Environments](https://cursor.com/dashboard/cloud-agents#environments) で対象リポジトリ用 Environment を用意する
2. **Secrets** に `GITHUB_PERSONAL_ACCESS_TOKEN` を登録する（値は commit しない）
3. Dashboard の MCP 設定で GitHub MCP（HTTP）を有効化する

HTTP MCP の例（Secrets にトークンを置いたうえで Dashboard 側で設定）:

```json
{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${env:GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

### 2b. ローカル IDE / リポジトリテンプレート

`.cursor/mcp.json.example` を `.cursor/mcp.json` にコピーし、トークンは環境変数または
`~/.cursor/mcp.json`（グローバル）側で設定する。**トークン本体を commit しない。**

## 3. Personal Access Token（MCP 用）

MCP の Issue/PR ツールは classic PAT では **`repo` スコープ**、fine-grained PAT では
対象リポジトリへの **Issues / Pull requests / Contents の Read and write** が必要。

| 方式 | 必要な権限 |
|---|---|
| Classic PAT | `repo`（private リポジトリ必須）。org で SSO 利用時はトークンを SSO authorize する |
| Fine-grained PAT | Resource owner を org に、対象 repo を選択、Issues / Pull requests / Contents を Read and write |

org の fine-grained token ポリシーで承認が必要な場合がある。

## 4. 診断（`scripts/check-github-access.sh`）

リポジトリルートで実行:

```sh
sh scripts/check-github-access.sh
```

| 結果 | 意味 | 対処 |
|---|---|---|
| git fetch OK | Cursor App による git 読み取りは有効 | — |
| git push dry-run OK | push 権限あり | — |
| gh repo view OK | リポジトリ API 参照可 | — |
| gh issue list OK | Issue API 読み取り可 | — |
| gh issue create → 403 | Issue API 書き込み不可 | App 権限または MCP + PAT を確認 |
| MCP github ツール未検出 | MCP 未設定 | §2 を実施 |

### よくある 403: `Resource not accessible by integration`

`gh` が GitHub App インストールトークン（`ghs_`）で動いているが、Issue/PR API への権限が
不足している状態。git push は成功しても Issue 一覧・コメント投稿は失敗する。

**対処（いずれか）:**

1. Cursor Dashboard で GitHub App のリポジトリアクセスを再確認し、Issues / Pull requests 権限を含めて再インストールする
2. MCP 用 PAT を Secrets に登録し、GitHub MCP を有効化する（§2）
3. 書き込めない間は `AGENTS.md` に従い、人間への転記依頼で代替する

## 5. 本ハーネスとの関係

- **GitHubドリヴン記録**: verdict・レビュー結果は Issue/PR コメントへ残す。書き込み不可時はチャットのみに留めず、
  転記依頼をコメントに明記する
- **MCP 棚卸し**: 使わない MCP は無効化する（`docs/harness/ops/token-discipline.md` §10）
- **main 直 push 禁止**: feature branch + PR が前提（`AGENTS.md` 安全ルール）

## 6. 導入後チェック

- [ ] `sh scripts/check-github-access.sh` が git / Issue 読み取りで `[OK]`
- [ ] Cloud Agent から feature branch への push と PR 作成ができる
- [ ] Issue/PR へのコメント投稿ができる（MCP または gh）
- [ ] トークン・secret がリポジトリに commit されていない
