/*
 * ค่าตั้งค่าของ KKU Connect — แก้ที่ไฟล์นี้ที่เดียว ทุกหน้าเปลี่ยนตาม
 * (ไฟล์นี้ชื่อเดิมว่า feedback-config.js)
 */

/* ---------- แบบประเมิน ---------- */
// ลิงก์ Google Form ที่ได้จาก create-feedback-form.gs
// ปุ่ม "ประเมินการใช้งาน" และหน้า feedback.html จะใช้ลิงก์นี้สร้าง QR
window.FEEDBACK_FORM_URL = "https://forms.gle/j7EuLjwmBfCVVFkG9";

// ชื่อที่แสดงบนโปสเตอร์ QR
window.FEEDBACK_APP_NAME = "KKU Connect";

/* ---------- บันทึกคนสมัครสมาชิกลง Google Sheets ---------- */
// Web app URL ที่ได้จากการ Deploy signup-sheet.gs (ลงท้ายด้วย /exec)
// เว้นว่างไว้ = ไม่ส่งข้อมูลออกไปไหน บัญชีเก็บอยู่ในเบราว์เซอร์เครื่องผู้ใช้อย่างเดียว
window.SIGNUP_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzl3IrXZQx0bkWkX0zmw07T2u0TYbwlMPORUhSXXJb4MQxlNu7kcACGV_0PVjodJ3JA/exec";

// ต้องตรงกับตัวแปร SIGNUP_TOKEN ในไฟล์ signup-sheet.gs
window.SIGNUP_TOKEN = "kkuconnect-2569";

/* ---------- บันทึก log การกดบันทึกข่าวลง Google Sheets ---------- */
// Web app URL ที่ได้จากการ Deploy save-log.gs (ลงท้ายด้วย /exec)
// เว้นว่างไว้ = ไม่เก็บ log ปุ่ม 🔖 ทำงานเหมือนเดิมทุกอย่าง แค่ไม่ส่งอะไรออกไป
window.SAVELOG_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycby-GmCcTXOdt1OVXOC8qzLbkYSFUkQ9pUum7ZQHhaYEZyBI4SiTTR1i0WDHmz8zgmMI/exec";

// ต้องตรงกับตัวแปร SAVELOG_TOKEN ในไฟล์ save-log.gs
window.SAVELOG_TOKEN = "kkuconnect-log-2569";
