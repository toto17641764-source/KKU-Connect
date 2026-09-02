/**
 * create-feedback-form.gs — สร้างแบบประเมิน KKU Connect บน Google Form โดยอัตโนมัติ
 *
 * วิธีใช้ (ทำครั้งเดียว ใช้เวลาราว 2 นาที)
 *   1. เปิด https://script.google.com แล้วกด "New project" (โปรเจกต์ใหม่)
 *   2. ลบโค้ดตัวอย่างในช่องแก้ไขทิ้งทั้งหมด แล้ววางไฟล์นี้ลงไปแทน
 *   3. เลือกฟังก์ชัน createFeedbackForm ที่แถบด้านบน แล้วกด Run
 *   4. ครั้งแรก Google จะขออนุญาต — กด Review permissions > เลือกบัญชีของคุณ >
 *      Advanced > Go to (ชื่อโปรเจกต์) (unsafe) > Allow
 *      (ที่ขึ้นว่า unsafe เพราะเป็นสคริปต์ที่เราเขียนเอง ไม่ได้ผ่านการรับรองจาก Google)
 *   5. ดูผลลัพธ์ที่ช่อง Execution log ด้านล่าง จะได้ลิงก์ 3 อัน
 *        - ลิงก์สำหรับผู้ตอบ (แบบสั้น)  <- เอาลิงก์นี้ไปใส่ในไฟล์ config.js
 *        - ลิงก์สำหรับแก้ไขฟอร์ม
 *        - ลิงก์ Google Sheets ที่เก็บคำตอบ
 *
 * รันซ้ำได้ แต่จะได้ฟอร์มใหม่ทุกครั้ง (คำตอบเก่าไม่หาย เพราะอยู่คนละไฟล์)
 */

// ชื่อแอปที่จะโชว์ในหัวฟอร์ม — แก้ตรงนี้ได้ถ้าเปลี่ยนชื่อโปรเจกต์
var APP_NAME = 'KKU Connect';

// หัวข้อที่ให้คะแนน 1-5 (เรียงตามลำดับที่จะแสดงในฟอร์ม)
var RATING_TOPICS = [
  'ความง่ายในการใช้งาน',
  'ความพึงพอใจโดยรวม',
  'ความถูกต้องของข้อมูล',
  'ความหลากหลายของข้อมูล',
  'ความสวยงามของเว็บไซต์'
];

function createFeedbackForm() {
  var form = FormApp.create('แบบประเมินการใช้งาน ' + APP_NAME);

  form.setTitle('แบบประเมินการใช้งาน ' + APP_NAME)
    .setDescription(
      'แบบสอบถามนี้จัดทำขึ้นเพื่อประเมินการใช้งานเว็บแอปพลิเคชัน ' + APP_NAME + '\n' +
      'ใช้เวลาตอบไม่เกิน 1 นาที ข้อมูลที่ได้จะนำไปใช้ปรับปรุงระบบเท่านั้น ขอบคุณครับ'
    )
    .setCollectEmail(false)          // ไม่บังคับล็อกอิน Google — ใครก็ตอบได้
    .setLimitOneResponsePerUser(false)
    .setProgressBar(true)
    .setConfirmationMessage('ส่งแบบประเมินเรียบร้อยแล้ว ขอบคุณสำหรับความคิดเห็นครับ');

  // ---------- ส่วนที่ 1: ข้อมูลผู้ประเมิน ----------

  form.addSectionHeaderItem()
    .setTitle('ข้อมูลผู้ประเมิน');

  form.addTextItem()
    .setTitle('ชื่อ - นามสกุล')
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('ชั้นปี')
    .setChoiceValues(['ชั้นปีที่ 1', 'ชั้นปีที่ 2', 'ชั้นปีที่ 3', 'ชั้นปีที่ 4'])
    .showOtherOption(true)           // เผื่อคนนอกกลุ่ม เช่น อาจารย์ หรือ ปี 5 ขึ้นไป
    .setRequired(true);

  // ---------- ส่วนที่ 2: ให้คะแนน ----------

  form.addSectionHeaderItem()
    .setTitle('ให้คะแนนการใช้งาน')
    .setHelpText('1 = น้อยที่สุด, 5 = มากที่สุด');

  // ใช้ตารางให้คะแนนแทนคำถามแยก 5 ข้อ เพื่อให้ตอบจบในหน้าจอเดียว
  form.addGridItem()
    .setTitle('กรุณาให้คะแนนในแต่ละหัวข้อ')
    .setRows(RATING_TOPICS)
    .setColumns(['1', '2', '3', '4', '5'])
    .setRequired(true);

  // ---------- ส่วนที่ 3: ข้อเสนอแนะ ----------

  form.addParagraphTextItem()
    .setTitle('ข้อเสนอแนะเพิ่มเติม')
    .setHelpText('อยากให้ปรับปรุงหรือเพิ่มอะไร บอกได้เลยครับ (ไม่บังคับ)')
    .setRequired(false);

  // ---------- ผูกไฟล์ Google Sheets สำหรับเก็บคำตอบ ----------

  var sheet = SpreadsheetApp.create('ผลประเมิน ' + APP_NAME);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  var publicUrl = form.getPublishedUrl();
  var shortUrl = form.shortenFormUrl(publicUrl);   // ลิงก์สั้นทำให้ QR code อ่านง่ายขึ้น

  Logger.log('');
  Logger.log('=========================================================');
  Logger.log('สร้างฟอร์มเรียบร้อย');
  Logger.log('---------------------------------------------------------');
  Logger.log('ลิงก์สำหรับผู้ตอบ (เอาไปใส่ config.js): ' + shortUrl);
  Logger.log('ลิงก์แบบเต็ม: ' + publicUrl);
  Logger.log('ลิงก์แก้ไขฟอร์ม: ' + form.getEditUrl());
  Logger.log('ไฟล์เก็บคำตอบ: ' + sheet.getUrl());
  Logger.log('=========================================================');

  return shortUrl;
}
