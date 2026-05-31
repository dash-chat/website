/**
 * Dash Chat "Get involved" form backend.
 *
 * Receives POSTs from the dashchat.org contact form, verifies the Cloudflare
 * Turnstile token server-side, then appends a row to the bound Google Sheet
 * (and optionally emails a notification).
 *
 * Setup: see apps-script/README.md. In short:
 *   1. Create a Google Sheet, then Extensions -> Apps Script, and paste this in.
 *   2. Project Settings -> Script Properties:
 *        TURNSTILE_SECRET = <your Turnstile secret key>   (required)
 *        NOTIFY_EMAIL     = <where to email submissions>   (optional)
 *   3. Deploy -> New deployment -> Web app:
 *        Execute as: Me     Who has access: Anyone
 *   4. Copy the /exec URL into index.html (the form `action`).
 */

var SHEET_NAME = 'Submissions';

function doPost(e) {
  try {
    var params = (e && e.parameter) || {};
    var token = params['cf-turnstile-response'] || '';

    if (!verifyTurnstile_(token)) {
      return textOut_('captcha-failed');
    }

    getSheet_().appendRow([
      new Date(),
      params.email || '',
      params.name || '',
      params.newsletter === 'yes' ? 'yes' : '',
      params.test === 'yes' ? 'yes' : '',
      params.partner === 'yes' ? 'yes' : '',
      params.details || ''
    ]);

    notify_(params);
    return textOut_('ok');
  } catch (err) {
    return textOut_('error: ' + err);
  }
}

function verifyTurnstile_(token) {
  if (!token) return false;
  var secret = PropertiesService.getScriptProperties().getProperty('TURNSTILE_SECRET');
  if (!secret) throw new Error('TURNSTILE_SECRET script property is not set');

  var resp = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'post',
    payload: { secret: secret, response: token },
    muteHttpExceptions: true
  });
  var result = JSON.parse(resp.getContentText());
  return result.success === true;
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Timestamp', 'Email', 'Name', 'Newsletter', 'Test Dash Chat', 'Partner', 'Details']);
  }
  return sheet;
}

function notify_(params) {
  try {
    var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
    if (!to) return;
    var lines = [
      'Email: ' + (params.email || ''),
      'Name: ' + (params.name || '(none)'),
      'Newsletter: ' + (params.newsletter === 'yes' ? 'yes' : 'no'),
      'Test Dash Chat: ' + (params.test === 'yes' ? 'yes' : 'no'),
      'Explore Partnership: ' + (params.partner === 'yes' ? 'yes' : 'no'),
      '',
      'Details: ' + (params.details || '(none)')
    ];
    MailApp.sendEmail(to, 'New Dash Chat form submission', lines.join('\n'));
  } catch (err) {
    // Never let a mail failure break the submission.
  }
}

function textOut_(msg) {
  return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
}
