# AI ONEインスタ部門ポータル

まとめ・月報・実績・管理者の4画面と、その取得・集計・判定・認証をNext.jsで実行します。稼働時にGASを呼びません。元のスプシ、入力先、既存GAS版、通知・トリガーは残します。

確認用の公開コードと運営への引き継ぎ条件は [docs/HANDOFF.md](docs/HANDOFF.md) を参照してください。11月26日の単体44件・ブラウザ14件・ビルド、現行GASとの実データ照合、月報保存・重複防止・原状復帰を確認済みです。運営環境への配置・継続認証・本番切替は未実施です。

## 起動

Node.js 22以上。標準パスは `/aione-instagram` と、その配下の `/monthly-report`、`/results`、`/admin`。公開先候補は `https://tools.aione.co.jp/aione-instagram` ですが、本番公開は未実施です。

```sh
npm ci
cp .env.example .env.local
# Google接続、私有設定、PWハッシュ、永続ストアを設定
npm test
npm run build
npm run start -- --port 3467
npm run test:e2e
```

ローカルの `PORTAL_PUBLIC_ORIGIN` は `http://127.0.0.1:3467`。配置パス変更時は `NEXT_PUBLIC_BASE_PATH` を設定して再ビルドします。秘密値は `.env.local`、私有設定は `.local/` または公開領域外の秘密ファイル・永続ボリュームへ置き、Gitへ入れません。

## データの流れ

```text
同じスプシ（名簿・過去実績・収益・登録元データ・限定LINEリンク）
  → Next.js（名寄せ・重複除外・集計・判定・認証）
  → 同一オリジンの /api/rpc → 画面
```

- 移行開始月以降のリスト数はNext.jsで登録元データから計算します。読者ID指定→登録経路→確定LINE補完の優先順位、最初の登録日時、メール・LINE識別子の重複除外を移植しています。
- 移行前の月別実績、収益、同名行の合算、2026年以降の月・年・全期間の集計を保持します。`PORTAL_NATIVE_START_MONTH` は移行時に固定し、翌月も変更しません。
- 月報は日本時間の前月・前々月のみ。列不足・不正値・取得失敗を0円へ置き換えません。
- 月報・実績は60秒ごととタブ復帰時に再取得します。実績の選択・期間と、月報の入力途中の文章を保持します。読取キャッシュは標準30秒で、期限切れの結果へフォールバックしません。初回は登録元全体の取得・解析に時間がかかります。
- 同じ管理者PWハッシュと現在のNG設定を移行し、認証・期限・ログイン制限・保存競合・永続保存をNext.jsで実行します。以後の新旧NG設定は独立し、GAS版の設定を変更しません。
- 入力途中の月報はページ内メモリのみ。再読み込み・終了で消える従来仕様を維持します。
- 現行GAS v11と同じく、アウトプットを押した時だけ共有シートの月報ログへ保存します。権限・15列・サーバー実績の確認、保存直前の権限再検査、UUIDの重複防止、案内・再試行を移植しています。LINE本文の投稿は本人が行います。設定と受入は [docs/MONTHLY_OUTPUT.md](docs/MONTHLY_OUTPUT.md) を参照してください。

## Googleへの直接接続

`PORTAL_SOURCE_CONFIG_FILE` は、同じスプシID・タブ名・名寄せの私有設定を含むJSONの絶対パスです。このファイルはGit・依頼文へ含めません。

- `PORTAL_SHEETS_TRANSPORT=api`：Sheets API。Google ADCを使い、`GOOGLE_APPLICATION_CREDENTIALS` または配置基盤のIDに対象スプシの読取権限を用意します。11月26日に認証済みAPI経路でも実データを現行GASと照合しました。
- `PORTAL_SHEETS_TRANSPORT=xlsx`：既存のアクセス状態で取得できるスプシのExcelエクスポートをメモリ内で読みます。初回のローカル確認はこちらで、11月26日はAPI経路も照合しました。共有設定は変更しません。型推測で値を落とさず、数値・エラー・数式を区別します。

接続方式は明示し、失敗時に別の方式へ切り替えません。Google資格情報はブラウザへ渡しません。

## 保守・照合

- `tools/check-native-connection.mjs`：旧GASとの読取比較専用。全員・全月の表示値、元の重複除外・名寄せ、NG設定、月報を比較し、真偽と件数だけを出力します。旧GASの接続情報はこの検証用です。
- `tools/prepare-native-migration.mjs`：一回限りの設定移行。既存GAS・スプシ・トリガーは変更せず、私有設定を無視対象のパスへ保存します。
- `tools/native-maintenance.mjs`：現行の月列追加・リスト更新・累計更新の計画を作ります。標準は書込みなし。`--apply` と定期実行は別の本番切替承認後だけです。同じGAS更新トリガーと重複起動しません。
- LINE通知（朝夕リスト・収益・面談・前月確定）と定期更新は `lib/notifications/`、保護された `/api/jobs/[job]`、`tools/notification-worker.mjs` に移植済み。送信履歴を永続保存し、再実行・並列実行・再起動後の二重送信を抑止します。結果不明時は自動再送しません。
- 専用TOP5画像は `/results?ranking_image=<秘密キー>` でも作成できます。`PORTAL_TOP5_DOWNLOAD_KEY` をサーバーへ設定します。元のGAS専用URLとキーは変更しません。
- 既存GASはそのまま残します。現在の通知はGAS側で継続し、新版の配信は既定で無効です。公開先へコードを配置し、私有設定・永続領域・実行時刻・配信担当の切替を確定してから有効化します。GitHubへの保存だけでは本番配信は開始されません。

## 通知・定期実行

面談通知の対象外は私有設定 `interviewHiddenNames`、管理画面の対象外は `hiddenNames` で分離します。現行GASの「通知だけ表示対象を変える」条件を保持し、管理アプリ共通の設定へ戻しません。

実行方法・安全な切替・秘密設定は [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) を参照してください。`node --env-file=.env.local tools/preview-notifications.mjs` は全種類を集計し、件数だけを表示します。LINE送信・スプシ書込みは行いません。

配置は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)、移植範囲は [docs/MIGRATION_INVENTORY.md](docs/MIGRATION_INVENTORY.md)、実施状態は [STATUS.md](STATUS.md) を参照。

接続仕様：[Sheets API](https://developers.google.com/workspace/sheets/api/guides/values)、[Google認証ライブラリ](https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest)。
