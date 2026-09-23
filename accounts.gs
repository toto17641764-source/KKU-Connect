/**
 * accounts.gs — ระบบสมาชิก KKU Connect (สมัคร + เข้าสู่ระบบ) เก็บข้อมูลบน Google Sheets
 *
 * ใช้แทน signup-sheet.gs ตัวเดิม ซึ่งส่งข้อมูลได้ทางเดียวและอ่านคำตอบกลับไม่ได้
 * จึงเอามาใช้ล็อกอินไม่ได้ ไฟล์นี้ตอบกลับแบบ JSONP หน้าเว็บจึงอ่านผลได้
 *
 * ตั้งค่าครั้งเดียว (ราว 3 นาที)
 *   1. เปิด https://script.google.com แล้วกด "New project"
 *   2. ลบโค้ดตัวอย่างทิ้ง แล้ววางไฟล์นี้ลงไปแทน
 *   3. เลือกฟังก์ชัน setup ที่แถบด้านบน แล้วกด Run (ครั้งแรกจะให้กดอนุญาตสิทธิ์)
 *      → ดู Execution log จะได้ลิงก์ Google Sheets ที่สร้างให้
 *   4. กด Deploy > New deployment
 *        - ชนิด (ไอคอนฟันเฟือง) = Web app
 *        - Execute as     : Me (บัญชีคุณ)
 *        - Who has access : Anyone        <- ต้องเป็น "Anyone" เท่านั้น
 *        - กด Deploy แล้วคัดลอก Web app URL (ลงท้ายด้วย /exec)
 *   5. เอา URL ไปใส่ที่ ACCOUNTS_WEBHOOK_URL ในไฟล์ config.js
 *
 * แก้โค้ดแล้วต้อง Deploy ใหม่ทุกครั้ง (Deploy > Manage deployments > ดินสอ > Version: New version)
 *
 * เรื่องรหัสผ่าน — อ่านก่อนใช้งานจริง
 *   ทำสองชั้น: หน้าเว็บแฮชรหัสผ่านด้วย SHA-256 ตั้งแต่ในเบราว์เซอร์ (รหัสจริงไม่เคยออกจากเครื่อง
 *   ผู้ใช้และไม่เคยโผล่ใน URL) แล้วฝั่งนี้เอาค่าที่ได้มาแฮชซ้ำกับค่าสุ่มประจำบัญชี (salt) ก่อนเก็บ
 *   ชีตจึงมีแต่ค่าแฮชกับ salt ไม่มีรหัสจริง และต่อให้สองคนตั้งรหัสเหมือนกันค่าที่เก็บก็ต่างกัน
 *
 *   ที่ต้องให้ฝั่งนี้เป็นคนใส่ salt เพราะผู้ใช้ล็อกอินด้วยอีเมลหรือเบอร์ก็ได้ ถ้าให้หน้าเว็บ
 *   ผูก salt กับอีเมล คนที่ล็อกอินด้วยเบอร์จะคำนวณค่าเดิมไม่ได้
 *
 *   แต่นี่ยังไม่ใช่ระบบความปลอดภัยระดับใช้งานจริง — ไม่มี bcrypt, ไม่จำกัดจำนวนครั้งที่ลองผิด
 *   และค่าแฮชจากหน้าเว็บก็ใช้ยืนยันตัวตนแทนรหัสได้ถ้าถูกดักไว้ เหมาะกับงานเรียนเท่านั้น
 *   ผู้ใช้จึงไม่ควรตั้งรหัสเดียวกับบัญชีสำคัญ — หน้าเว็บมีข้อความเตือนไว้แล้ว
 */

// ต้องตรงกับค่า ACCOUNTS_TOKEN ในไฟล์ config.js
// โทเคนนี้ฝังอยู่ในหน้าเว็บ ใครเปิดดูโค้ดก็เห็น จึงกันได้แค่บอทที่ยิงมั่ว ๆ ไม่ใช่ระบบความปลอดภัยจริง
var ACCOUNTS_TOKEN = 'kkuconnect-2569';

var SHEET_NAME = 'สมาชิก';
var PROP_KEY = 'ACCOUNTS_SPREADSHEET_ID';

var HEADERS = ['เวลาที่บันทึก', 'ชื่อ - นามสกุล', 'ชั้นปี', 'คณะ / วิทยาลัย', 'เพศ',
               'อีเมล', 'เบอร์โทร', 'รหัสผ่าน (แฮช)', 'ค่าสุ่มประกอบรหัส', 'รหัสคณะ',
               'เวลาที่สมัครในเครื่องผู้ใช้', 'สมัครจากหน้าเว็บ'];
// ตำแหน่งคอลัมน์ (เริ่มที่ 1) — แก้ HEADERS แล้วต้องแก้ตรงนี้ด้วย
var C = { time: 1, name: 2, year: 3, faculty: 4, gender: 5,
          email: 6, phone: 7, hash: 8, salt: 9, facultyId: 10, clientTime: 11, origin: 12 };

/** SHA-256 เป็นข้อความฐานสิบหก — Utilities.computeDigest คืนไบต์แบบมีเครื่องหมาย จึงต้อง & 0xff */
function sha256Hex_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  var out = '';
  for (var i = 0; i < bytes.length; i++) out += ((bytes[i] & 0xff) + 0x100).toString(16).slice(1);
  return out;
}

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
    sheet.setColumnWidth(C.name, 180);
    sheet.setColumnWidth(C.faculty, 220);
    sheet.setColumnWidth(C.email, 220);
    sheet.setColumnWidth(C.hash, 120);
    // เก็บเบอร์เป็นข้อความ ไม่งั้น Sheets จะตัดเลข 0 ข้างหน้าทิ้ง
    sheet.getRange(2, C.phone, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  }

  Logger.log('');
  Logger.log('=========================================================');
  Logger.log('พร้อมใช้งานแล้ว');
  Logger.log('ไฟล์เก็บรายชื่อสมาชิก: ' + ss.getUrl());
  Logger.log('ขั้นต่อไป: Deploy > New deployment > Web app (Anyone) แล้วเอา URL ไปใส่ config.js');
  Logger.log('=========================================================');
  return ss.getUrl();
}

function sheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_KEY);
  if (!id) throw new Error('ยังไม่ได้รันฟังก์ชัน setup');
  var ss = SpreadsheetApp.openById(id);
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function normEmail_(s) { return String(s || '').trim().toLowerCase(); }
function normPhone_(s) { return String(s || '').replace(/\D/g, ''); }

/** อ่านสมาชิกทั้งหมดเป็น array ของ object */
function readAll_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var rows = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  return rows.map(function (r) {
    return {
      name: r[C.name - 1],
      year: r[C.year - 1],
      faculty: r[C.faculty - 1],
      gender: r[C.gender - 1],
      email: normEmail_(r[C.email - 1]),
      phone: normPhone_(r[C.phone - 1]),
      hash: String(r[C.hash - 1] || '').trim(),
      salt: String(r[C.salt - 1] || '').trim(),
      facultyId: String(r[C.facultyId - 1] || '').trim()
    };
  });
}

/** ข้อมูลที่ส่งกลับให้หน้าเว็บ — ไม่มีค่าแฮชติดไปด้วย */
function publicUser_(a) {
  return {
    name: a.name, year: a.year, gender: a.gender,
    facultyId: a.facultyId, email: a.email, phone: a.phone
  };
}

function signup_(p) {
  var email = normEmail_(p.email);
  var phone = normPhone_(p.phone);
  var hash = String(p.hash || '').trim();

  if (!p.name || !p.year || !p.gender || !p.facultyId) return { ok: false, error: 'missing' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'bad-email' };
  if (!/^0\d{8,9}$/.test(phone)) return { ok: false, error: 'bad-phone' };
  if (hash.length !== 64) return { ok: false, error: 'bad-hash' };

  // ล็อกกันคนสองคนสมัครพร้อมกันแล้วได้อีเมล/เบอร์ซ้ำ
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var all = readAll_();
    for (var i = 0; i < all.length; i++) {
      if (all[i].email === email) return { ok: false, error: 'email-taken' };
      if (all[i].phone === phone) return { ok: false, error: 'phone-taken' };
    }
    var sh = sheet_();
    var salt = Utilities.getUuid();
    var row = [];
    row[C.time - 1] = new Date();
    row[C.name - 1] = String(p.name).trim();
    row[C.year - 1] = String(p.year).trim();
    row[C.faculty - 1] = String(p.facultyName || p.facultyId).trim();
    row[C.gender - 1] = String(p.gender).trim();
    row[C.email - 1] = email;
    row[C.phone - 1] = phone;
    row[C.hash - 1] = sha256Hex_(salt + '|' + hash);
    row[C.salt - 1] = salt;
    row[C.facultyId - 1] = String(p.facultyId).trim();
    row[C.clientTime - 1] = String(p.clientTime || '');
    row[C.origin - 1] = String(p.origin || '');
    sh.appendRow(row);
    sh.getRange(sh.getLastRow(), C.phone).setNumberFormat('@').setValue(phone);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, user: {
    name: String(p.name).trim(), year: String(p.year), gender: String(p.gender),
    facultyId: String(p.facultyId), email: email, phone: phone
  } };
}

function login_(p) {
  var id = String(p.id || '').trim();
  var hash = String(p.hash || '').trim();
  var byEmail = id.indexOf('@') >= 0;
  var key = byEmail ? normEmail_(id) : normPhone_(id);
  if (!key || hash.length !== 64) return { ok: false, error: 'missing' };

  var all = readAll_();
  var found = null;
  for (var i = 0; i < all.length; i++) {
    if (byEmail ? all[i].email === key : all[i].phone === key) { found = all[i]; break; }
  }
  if (!found) return { ok: false, error: 'no-account' };
  // แถวเก่าที่สมัครไว้ก่อนมีระบบรหัสผ่าน จะไม่มีทั้งแฮชและ salt
  if (!found.hash || !found.salt) return { ok: false, error: 'no-password' };
  if (found.hash !== sha256Hex_(found.salt + '|' + hash)) return { ok: false, error: 'wrong-pass' };
  return { ok: true, user: publicUser_(found) };
}

/**
 * หน้าเว็บเรียกผ่าน <script src="...?callback=ชื่อฟังก์ชัน"> (JSONP)
 * เพราะ Apps Script ไม่ส่ง CORS header ให้ fetch ข้ามโดเมนอ่านคำตอบได้
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    if (p.token !== ACCOUNTS_TOKEN) out = { ok: false, error: 'token' };
    else if (p.action === 'signup') out = signup_(p);
    else if (p.action === 'login') out = login_(p);
    else if (p.action === 'ping') out = { ok: true, pong: true };
    else out = { ok: false, error: 'bad-action' };
  } catch (err) {
    out = { ok: false, error: 'server', detail: String(err) };
  }

  var json = JSON.stringify(out);
  if (p.callback) {
    return ContentService.createTextOutput(p.callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
