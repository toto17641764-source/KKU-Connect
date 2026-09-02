/**
 * save-log.gs — เก็บ log ว่า "ใครกดบันทึกข่าวอะไร เมื่อไหร่" ลง Google Sheets
 *
 * เป็นคนละโปรเจกต์ / คนละไฟล์ชีต กับ signup-sheet.gs (รายชื่อสมาชิก)
 * จะได้แก้ตัวไหนก็ไม่กระทบอีกตัว
 *
 * ตั้งค่าครั้งเดียว (ราว 3 นาที)
 *   1. เปิด https://script.google.com แล้วกด "New project"
 *   2. ลบโค้ดตัวอย่างทิ้ง แล้ววางไฟล์นี้ลงไปแทน
 *   3. เลือกฟังก์ชัน setup ที่แถบด้านบน แล้วกด Run (ครั้งแรกจะให้กดอนุญาตสิทธิ์)
 *      → ดู Execution log จะได้ลิงก์ Google Sheets ที่สร้างให้
 *   4. กด Deploy > New deployment
 *        - เลือกชนิด (ไอคอนฟันเฟือง) = Web app
 *        - Execute as        : Me (บัญชีคุณ)
 *        - Who has access    : Anyone        <- ต้องเป็น "Anyone" เท่านั้น
 *          (ถ้าเลือก "Anyone with Google account" คนที่ไม่ได้ล็อกอิน Google จะส่งข้อมูลไม่ได้)
 *        - กด Deploy แล้วคัดลอก Web app URL (ลงท้ายด้วย /exec)
 *   5. เอา URL นั้นไปใส่ในไฟล์ config.js ที่ตัวแปร SAVELOG_WEBHOOK_URL
 *
 * แก้โค้ดแล้วต้อง Deploy ใหม่ทุกครั้ง (Deploy > Manage deployments > ดินสอ > Version: New version)
 * ไม่งั้นเว็บจะยังเรียกโค้ดเวอร์ชันเก่าอยู่
 */

// ต้องตรงกับค่า SAVELOG_TOKEN ในไฟล์ config.js
// หมายเหตุ: โทเคนนี้ฝังอยู่ในหน้าเว็บ ใครเปิดดูโค้ดหน้าเว็บก็เห็นได้ จึงกันได้แค่บอทที่ยิงมั่ว ๆ
// ไม่ใช่ระบบความปลอดภัยจริง — ถ้าเจอสแปม ให้เปลี่ยนโทเคนทั้งสองไฟล์แล้ว Deploy ใหม่
var SAVELOG_TOKEN = 'kkuconnect-log-2569';

var SHEET_NAME = 'บันทึกข่าว';
var PROP_KEY = 'SAVELOG_SPREADSHEET_ID';

var HEADERS = [
  'เวลาที่บันทึก',        // A เวลาฝั่งเซิร์ฟเวอร์ ใช้เป็นหลัก แก้ไม่ได้
  'ผู้บันทึก',            // B ชื่อสมาชิก หรือ "ผู้ไม่ระบุตัวตน"
  'สถานะผู้ใช้',          // C สมาชิก / ไม่ระบุตัวตน
  'อีเมล',                // D
  'ชั้นปี',               // E
  'คณะของผู้บันทึก',      // F
  'รหัสเครื่อง',          // G แยกได้ว่าคนละคนกัน แม้ไม่รู้ว่าเป็นใคร
  'หัวข้อข่าว',           // H
  'คณะ / แหล่งข่าว',      // I
  'หมวดหมู่',             // J
  'วันที่ของข่าว',        // K
  'ลิงก์ข่าว',            // L
  'เวลาในเครื่องผู้ใช้',  // M
  'บันทึกจากหน้าเว็บ',    // N
  'รหัสรายการ'            // O กันข้อมูลซ้ำตอนเว็บส่งใหม่เพราะเน็ตหลุด
];

// จำนวนแถวล่าสุดที่ย้อนไปเช็ค "รหัสรายการ" ซ้ำ (พอสำหรับการส่งซ้ำจากคิวในเครื่องผู้ใช้)
var DEDUPE_LOOKBACK = 500;

/** รันครั้งเดียวตอนติดตั้ง — สร้างไฟล์ Google Sheets แล้วจำ id ไว้ */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_KEY);
  var ss;

  if (id) {
    ss = SpreadsheetApp.openById(id);   // มีไฟล์อยู่แล้ว ใช้ของเดิม ไม่สร้างซ้ำ
  } else {
    ss = SpreadsheetApp.create('บันทึกข่าว KKU Connect');
    props.setProperty(PROP_KEY, ss.getId());
  }

  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0].setName(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150);   // เวลาที่บันทึก
    sheet.setColumnWidth(2, 170);   // ผู้บันทึก
    sheet.setColumnWidth(6, 200);   // คณะของผู้บันทึก
    sheet.setColumnWidth(8, 420);   // หัวข้อข่าว
    sheet.setColumnWidth(9, 200);   // คณะ / แหล่งข่าว
    sheet.setColumnWidth(12, 260);  // ลิงก์ข่าว
  }

  Logger.log('');
  Logger.log('=========================================================');
  Logger.log('พร้อมใช้งานแล้ว');
  Logger.log('ไฟล์เก็บ log การบันทึกข่าว: ' + ss.getUrl());
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

function str_(v) { return String(v == null ? '' : v).trim(); }

/** แปลงเวลา ISO ที่เว็บส่งมาเป็นวันที่จริง ชีตจะได้เรียง/กรองตามเวลาได้ ไม่ใช่ข้อความ */
function date_(v) {
  var s = str_(v);
  if (!s) return '';
  var d = new Date(s);
  return isNaN(d.getTime()) ? s : d;
}

/** เปิด URL ในเบราว์เซอร์ตรง ๆ จะเจอข้อความนี้ ใช้เช็คว่า deploy สำเร็จหรือยัง */
function doGet() {
  var ok = false, rows = 0;
  try {
    var sheet = getSheet_();
    ok = true;
    rows = Math.max(0, sheet.getLastRow() - 1);
  } catch (err) {}
  return jsonOut_({
    ok: ok,
    service: 'KKU Connect save log',
    rows: rows,
    message: ok ? 'พร้อมรับ log การบันทึกข่าว' : 'ยังไม่ได้รันฟังก์ชัน setup'
  });
}

/** เช็คว่ารหัสรายการนี้เคยบันทึกไปแล้วหรือยัง (ดูเฉพาะแถวท้าย ๆ พอ) */
function isDuplicate_(sheet, eventId) {
  if (!eventId) return false;
  var last = sheet.getLastRow();
  if (last < 2) return false;

  var start = Math.max(2, last - DEDUPE_LOOKBACK + 1);
  var ids = sheet.getRange(start, HEADERS.length, last - start + 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === eventId) return true;
  }
  return false;
}

/** เว็บส่งข้อมูลการกดบันทึกข่าวมาที่นี่ */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return jsonOut_({ ok: false, error: 'ไม่มีข้อมูลส่งมา' });

    var data = JSON.parse(e.postData.contents);
    if (SAVELOG_TOKEN && data.token !== SAVELOG_TOKEN) return jsonOut_({ ok: false, error: 'โทเคนไม่ถูกต้อง' });

    var link = str_(data.link);
    var title = str_(data.title);
    if (!link || !title) return jsonOut_({ ok: false, error: 'ข้อมูลข่าวไม่ครบ' });

    var email = str_(data.email).toLowerCase();
    var name = str_(data.name);
    var isMember = !!(name && email);

    // กันหลายคนกดพร้อมกันแล้วเขียนทับแถวเดียวกัน
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sheet = getSheet_();
      var eventId = str_(data.eventId);
      if (isDuplicate_(sheet, eventId)) return jsonOut_({ ok: true, duplicated: true });

      sheet.appendRow([
        new Date(),
        isMember ? name : 'ผู้ไม่ระบุตัวตน',
        isMember ? 'สมาชิก' : 'ไม่ระบุตัวตน',
        email,
        str_(data.year),
        str_(data.userFaculty),
        str_(data.device),
        title,
        str_(data.newsFaculty),
        str_(data.topic),
        date_(data.publishedAt),
        link,
        date_(data.savedAt),
        str_(data.origin),
        eventId
      ]);
    } finally {
      lock.releaseLock();
    }

    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}
