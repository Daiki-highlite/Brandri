/**
 * Brandri リード受信 — Google Apps Script（スプレッドシート連携）
 * =====================================================================
 * 診断ツールのチェックリストDLフォームから送られる
 * { name, org, email, source, page, ts } を Google スプレッドシートに1行追記し、
 * 通知メールを自分宛に送る。
 *
 * ■ セットアップ（5分・すべてブラウザ上の操作）
 *   1. Google ドライブで新規スプレッドシートを作成（名前は任意、例: Brandri Leads）。
 *   2. メニュー「拡張機能」→「Apps Script」を開く。
 *   3. 既定の Code.gs の中身を全部消し、このファイルの内容を丸ごと貼り付ける。
 *   4. 下の NOTIFY_TO を自分の受信用メールアドレスに書き換える。
 *   5. 「デプロイ」→「新しいデプロイ」→ 種類の歯車で「ウェブアプリ」を選択。
 *        - 説明: brandri-lead
 *        - 次のユーザーとして実行: 自分
 *        - アクセスできるユーザー: 全員
 *      「デプロイ」を押し、初回は権限を承認する。
 *   6. 表示される「ウェブアプリの URL（https://script.google.com/macros/s/XXXX/exec）」をコピー。
 *   7. project/js/diagnostic.jsx の LEAD_ENDPOINT にその URL を貼り付け、ビルド＆デプロイ。
 *
 * ※ 項目やフォームを変えても、この受信側は payload をそのまま追記するので基本は無改修でOK。
 */

var NOTIFY_TO = "daiki.h@brand-highlite.com"; // ← 通知メールの宛先（必要に応じて変更）
var SHEET_NAME = "leads";                      // 追記先シート名（無ければ自動作成）

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); } catch (err) { data = e.parameter || {}; }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(SHEET_NAME);
      sh.appendRow(["受信日時", "名前", "所属", "メール", "経路", "ページ", "送信時刻(端末)"]);
    }

    var now = new Date();
    sh.appendRow([
      now,
      data.name || "",
      data.org || "",
      data.email || "",
      data.source || "",
      data.page || "",
      data.ts || ""
    ]);

    // 通知メール（任意）
    if (NOTIFY_TO) {
      try {
        MailApp.sendEmail(
          NOTIFY_TO,
          "【Brandri】新しいリード: " + (data.name || "") + "（" + (data.org || "") + "）",
          [
            "名前: " + (data.name || ""),
            "所属: " + (data.org || ""),
            "メール: " + (data.email || ""),
            "経路: " + (data.source || ""),
            "ページ: " + (data.page || ""),
            "受信: " + now
          ].join("\n")
        );
      } catch (mailErr) { /* 送信失敗は無視して記録は残す */ }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 動作確認用（ブラウザで /exec を開くと表示される）
function doGet() {
  return ContentService.createTextOutput("Brandri lead endpoint is running.");
}
