/**
 * signup-sheet.gs — รับข้อมูลคนสมัครสมาชิก KKU Connect มาบันทึกลง Google Sheets
 *
 * ตั้งค่าครั้งเดียว (ราว 3 นาที)
 *   1. เปิด https://script.google.com แล้วกด "New project" (คนละโปรเจกต์กับ create-feedback-form.gs ก็ได้)
 *   2. ลบโค้ดตัวอย่างทิ้ง แล้ววางไฟล์นี้ลงไปแทน
 *   3. เลือกฟังก์ชัน setup ที่แถบด้านบน แล้วกด Run (ครั้งแรกจะให้กดอนุญาตสิทธิ์)
 *      → ดู Execution log จะได้ลิงก์ Google Sheets ที่สร้างให้
 *   4. กด Deploy > New deployment
 *        - เลือกชนิด (ไอคอนฟันเฟือง) = Web app
 *        - Execute as        : Me (บัญชีคุณ)
 *        - Who has access    : Anyone        <- ต้องเป็น "Anyone" เท่านั้น
 *          (ถ้าเลือก "Anyone with Google account" คนที่ไม่ได้ล็อกอิน Google จะส่งข้อมูลไม่ได้)
 *        - กด Deploy แล้วคัดลอก Web app URL (ลงท้ายด้วย /exec)
 *   5. เอา URL นั้นไปใส่ในไฟล์ config.js ที่ตัวแปร SIGNUP_WEBHOOK_URL
 *
 * แก้โค้ดแล้วต้อง Deploy ใหม่ทุกครั้ง (Deploy > Manage deployments > ดินสอ > Version: New version)
 * ไม่งั้นเว็บจะยังเรียกโค้ดเวอร์ชันเก่าอยู่
 */

// ต้องตรงกับค่า SIGNUP_TOKEN ในไฟล์ config.js
// หมายเหตุ: โทเคนนี้ฝังอยู่ในหน้าเว็บ ใครเปิดดูโค้ดหน้าเว็บก็เห็นได้ จึงกันได้แค่บอทที่ยิงมั่ว ๆ
// ไม่ใช่ระบบความปลอดภัยจริง — ถ้าเจอสแปม ให้เปลี่ยนโทเคนทั้งสองไฟล์แล้ว Deploy ใหม่
var SIGNUP_TOKEN = 'kkuconnect-2569';

var SHEET_NAME = 'สมาชิก';
var PROP_KEY = 'SIGNUP_SPREADSHEET_ID';

var HEADERS = ['เวลาที่บันทึก', 'ชื่อ - นามสกุล', 'ชั้นปี', 'คณะ / วิทยาลัย', 'เพศ', 'อีเมล', 'เวลาที่สมัครในเครื่องผู้ใช้', 'สมัครจากหน้าเว็บ'];

/** รันครั้งเดียวตอนติดตั้ง — สร้างไฟล์ Google Sheets แล้วจำ id ไว้ */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_KEY);
  var ss;

  if (id) {
    ss = SpreadsheetApp.openById(id);   // มีไฟล์อยู่แล้ว ใช้ของเดิม ไม่สร้างซ้ำ
  } else {
    ss = SpreadsheetApp.create('สมาชิก KKU Connect');
    props.setProperty(PROP_KEY, ss.getId());
  }

  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0].setName(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(4, 220);
    sheet.setColumnWidth(6, 220);
  }

  Logger.log('');
  Logger.log('=========================================================');
  Logger.log('พร้อมใช้งานแล้ว');
  Logger.log('ไฟล์เก็บรายชื่อสมาชิก: ' + ss.getUrl());
  Logger.log('ขั้นต่อไป: Deploy > New deployment > Web app (Anyone) แล้วเอา URL ไปใส่ config.js');
  Logger.log('=========================================================');
  return ss.getUrl();
}

function getSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_KEY);
  if (!id) throw new Error('ยังไม่ได้ติดตั้ง — ให้รันฟังก์ชัน setup ก่อน');
  var ss = SpreadsheetApp.openById(id);
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** เปิด URL ในเบราว์เซอร์ตรง ๆ จะเจอข้อความนี้ ใช้เช็คว่า deploy สำเร็จหรือยัง */
function doGet() {
  var ok = false;
  try { getSheet_(); ok = true; } catch (err) {}
  return jsonOut_({ ok: ok, service: 'KKU Connect signup', message: ok ? 'พร้อมรับข้อมูลสมัครสมาชิก' : 'ยังไม่ได้รันฟังก์ชัน setup' });
}

/** เว็บส่งข้อมูลคนสมัครมาที่นี่ */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return jsonOut_({ ok: false, error: 'ไม่มีข้อมูลส่งมา' });

    var data = JSON.parse(e.postData.contents);
    if (SIGNUP_TOKEN && data.token !== SIGNUP_TOKEN) return jsonOut_({ ok: false, error: 'โทเคนไม่ถูกต้อง' });

    var email = String(data.email || '').trim().toLowerCase();
    var name = String(data.name || '').trim();
    if (!name || !email) return jsonOut_({ ok: false, error: 'ข้อมูลไม่ครบ' });

    var sheet = getSheet_();

    // กันข้อมูลซ้ำ กรณีเว็บส่งซ้ำเพราะเน็ตหลุดแล้วลองใหม่
    var emails = sheet.getLastRow() > 1
      ? sheet.getRange(2, 6, sheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim().toLowerCase(); })
      : [];
    if (emails.indexOf(email) !== -1) return jsonOut_({ ok: true, duplicated: true });

    sheet.appendRow([
      new Date(),
      name,
      String(data.year || ''),
      String(data.faculty || ''),
      String(data.gender || ''),
      email,
      String(data.createdAt || ''),
      String(data.origin || '')
    ]);

    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}
