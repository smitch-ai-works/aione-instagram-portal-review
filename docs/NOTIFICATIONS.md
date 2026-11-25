# LINE通知と定期処理の移行

2026-11-12の本人指示により、既存GASの通知・定期処理もNode/Next.jsへ移した。旧GASのコード・トリガー・公開URLは変更しない。本番配信を二重にしないため、移植コードの配信は既定で無効。

## 対応するジョブ

| ジョブ | 処理 | 通知内容・条件 |
| --- | --- | --- |
| list-morning / list-evening | 当月リスト数 | 元の帰属・重複除外、同順位、3区分・Flex分割を保持。0名は送信しない。取得失敗の警告も同じLINEへ1期間1回に制限して送る |
| revenue | 当月収益 | 同名行合算、既存の対象外、正の収益のみ。画面の5,000円超しきい値をLINEへ流用しない |
| interviews | 当月面談予定 | 既存の2タブ、キャンセル/辞退/テスト/重複/帰属/除外条件。本人の最新指示に従いワンコインも合算し種別名・注釈は出さない |
| previous-month | 前月確定リスト | 日本時間の前月、月単位の送信履歴。空の月にも元と同じ確定カードを用意 |
| maintenance | スプシの月列・当月リスト・累計更新 | 同じスプシへ直接Sheets APIで更新。LINE送信なし |

実際の送信先とトークンは元GASの関数からローカルの無視対象ファイルへ移行し、ソースコード・ログへ保存しない。配信本文・Flexの組立ては現行GASの純粋関数を移植している。

## 設定ファイル

- `PORTAL_NOTIFICATION_CONFIG_FILE`: 秘密のJSON絶対パス。`token`、`recipient`、`revenueHiddenNames`、`interviewHiddenNames`、`minakoOwner`、`appointments.minako/textbook` のスプシ指定を持つ。スプシ指定は `id/tab/gid/byId/range/dateColumns`。値は別途安全に受け渡す。通知専用の対象外は現行GASに合わせ、管理アプリのhiddenNamesから独立させる。
- `PORTAL_NOTIFICATION_STATE_FILE`: 永続的な配信台帳の絶対パス。初期JSONは `{"settings":{"revision":0,"words":[]},"sessions":{},"deliveries":{}}`。管理者設定とは別ファイル。公開領域・Gitへ置かない。
- `PORTAL_SCHEDULES_FILE`: 確定した日本時間の予定。書式は `deployment/schedules.example.json`。この例の朝夕時刻は過去の運用希望を基にした候補であり、他ユーザー所有のGASトリガーの現在の厳密な時刻は未取得。運営が実際の設定と照合して確定する。面談8:30・収益9:00・月初0:01・更新30分も含め配信開始前に確認する。
- `PORTAL_SCHEDULER_SECRET`: 32文字以上のランダム秘密値。HTTP起動用。ブラウザへ渡さない。
- `PORTAL_JOBS_ENABLED=true` と `PORTAL_JOB_OWNER=next` の両方、および `PORTAL_JOBS_NOT_BEFORE` の明示したISO切替時刻が必要。未設定・無効の状態では送信しない。

## 定期実行の選択肢

1. Next.jsと同じNodeホストのサービスとして `node --env-file=.env.local tools/notification-worker.mjs` を起動する。`--once` はその時刻の対象だけ実行する。5分以内の起動遅延を拾い、同一期間の再実行は台帳で抑止する。1ホストの永続台帳・ロックを共有する。プロセスの常駐・再起動・監視は配置基盤で設定する。
2. 公開先のスケジューラーから `GET` または `POST /aione-instagram/api/jobs/<job>` を実行する。`Authorization: Bearer <PORTAL_SCHEDULER_SECRET>` が必須。任意関数名は受け付けない。HTTP起動と同じ時間帯のワーカーを重ねる必要はない。複数ホストならファイル台帳を共有トランザクションDBへ置換する。

## 切替と重複防止

GitHubへコードを置いても配信は開始しない。現在のGASは動かしたまま、Next版ではまず `preview-notifications.mjs` で送らない照合を行う。本文・対象者・送信先・時刻と、永続領域・Google認証・LINE資格情報を運営環境で確認する。

本番でNextを配信担当にする際は、旧GAS側の該当スケジュールが同じ期間に送らないことと、切替時刻を別途確定する。旧GASのコードやアプリの削除は不要。旧GASのトリガーまでそのまま稼働させる間は、新版の配信を有効にしない。GASとNextで台帳を共有していないため、両方を有効化すると二重送信になる。

送信前に台帳へintentと各メッセージのUUIDを永続化し、LINEの `X-Line-Retry-Key` に同じUUIDを使う。成功した分を記録し、並列・再実行・再起動後の同じ通知を拒否する。送信結果が不明、または途中失敗の場合は `outcome_uncertain` として保留し、自動再送しない。運営がLINE受信・台帳のaccepted件数を確認する。台帳を消して再実行しない。

既存GASのプロパティにある送信済みフラグは自動移行していない。同日途中・月初途中の切替では既に送った期間を再配信しないよう、次の未送信期間を切替時刻として選び、運営が照合する。

## 実送信しない受入検査（11/23本人指定）

今回の目的は機能の再現・検証であり、配信の切替は行わない。本人指定によりLINEの実送信・受信確認は今回の受入対象に含めない。

`node --env-file=.env.local tools/validate-line-notifications.mjs --validate` は、架空データから5種類の通知と空データ・取得失敗を組み立て、通常の送信関数を捕捉専用の通信処理で検査する。その後、LINE公式の `POST /v2/bot/message/validate/push` に架空のメッセージだけを渡して形式を検査する。Bot情報と設定済み送信先の読取で認証・アクセスも確認する。実際の配信エンドポイントは呼ばず、実名・収益・実際の送信先IDを検査本文へ含めない。`--validate` なしは完全にオフライン。

11/23の結果は、11ケースで生成された9件すべてがLINE公式検査に合格、既存のBot資格情報と送信先アクセスも成功。実データはローカルの送信不能サンドボックスで現行GASと照合し、5種類すべての本文・Flexが一致した。並列・再起動・失敗時の重複防止とJST起動は単体テストで確認済み。検証中の実送信は0件。

この検査は実受信を保証するものではない。運営環境の継続起動・切替時刻は今回の検証とは分ける。仕様は [LINEのメッセージ検査API](https://developers.line.biz/en/reference/messaging-api/#validate-message-objects-of-push-message) と [再試行キー](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/) を参照。
