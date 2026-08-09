// fetch-news.mjs — KKU Connect: ดึงข่าวมหาวิทยาลัยขอนแก่นรายคณะ แล้วบันทึกเป็น data/news.json
// รันด้วย: node fetch-news.mjs  (ไม่ต้องติดตั้ง dependency ใด ๆ)
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(ROOT, "data", "news.json");
const MAX_PER_SOURCE = 10;
const MAX_TOTAL = 400;

// เว็บ มข. และคณะส่วนใหญ่ไม่เปิด RSS — ดึงผ่าน Google News RSS แทน
// (รวมข่าวจากทุกสำนักข่าวไทย + ข่าวประชาสัมพันธ์จากเว็บ มข. เองที่ Google เก็บไว้)
// คณะที่เว็บทางการเปิด RSS (WordPress /feed/) จะดึงตรงจากเว็บคณะเพิ่มอีกทาง — ได้ทั้งข่าวเร็วกว่าและรูปประกอบ
const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=th&gl=TH&ceid=TH:th`;

// คณะ/วิทยาลัยทั้งหมดของมหาวิทยาลัยขอนแก่น — ลำดับนี้ใช้เรียงเมนูในหน้าเว็บด้วย
// web = เว็บไซต์ทางการ, fb = เพจ Facebook ทางการ (รวบรวมจากลิงก์ในเว็บคณะ/การค้นหา ส.ค. 2569)
// feed = RSS ทางการ (เฉพาะคณะที่เปิดใช้และมีข่าวจริง)
const FACULTIES = [
  { id: "med",   name: "คณะแพทยศาสตร์",                 icon: "🩺", web: "https://md.kku.ac.th",         fb: "https://www.facebook.com/medkku" },
  { id: "eng",   name: "คณะวิศวกรรมศาสตร์",             icon: "⚙️", web: "https://en.kku.ac.th",         fb: "https://www.facebook.com/EngineeringKKU" },
  { id: "sci",   name: "คณะวิทยาศาสตร์",                icon: "🔬", web: "https://sc.kku.ac.th",         fb: "https://www.facebook.com/SCiKKU",
    feed: "https://sc.kku.ac.th/feed/" },
  { id: "agri",  name: "คณะเกษตรศาสตร์",                icon: "🌾", web: "https://ag.kku.ac.th",         fb: "https://www.facebook.com/ag.kku.ac.th" },
  { id: "edu",   name: "คณะศึกษาศาสตร์",                icon: "📚", web: "https://ednet.kku.ac.th",      fb: "https://www.facebook.com/EDKKU",
    feed: "https://ednet.kku.ac.th/feed/" },
  { id: "nurse", name: "คณะพยาบาลศาสตร์",               icon: "🩹", web: "https://nu.kku.ac.th",         fb: "https://www.facebook.com/fonkku" },
  { id: "hs",    name: "คณะมนุษยศาสตร์และสังคมศาสตร์",  icon: "🌏", web: "https://hs.kku.ac.th",         fb: "https://www.facebook.com/husokkuwhite" },
  { id: "dent",  name: "คณะทันตแพทยศาสตร์",             icon: "🦷", web: "https://dentistry.kku.ac.th",  fb: "https://www.facebook.com/dentistrykku",
    feed: "https://dentistry.kku.ac.th/feed/" },
  { id: "pharm", name: "คณะเภสัชศาสตร์",                icon: "💊", web: "https://pharm.kku.ac.th",      fb: "https://www.facebook.com/pharmkkuth" },
  { id: "ams",   name: "คณะเทคนิคการแพทย์",             icon: "🧪", web: "https://ams.kku.ac.th",        fb: "https://www.facebook.com/AMSatKKU" },
  { id: "ph",    name: "คณะสาธารณสุขศาสตร์",            icon: "🏥", web: "https://ph.kku.ac.th",         fb: "https://www.facebook.com/ph.kku.ac.th" },
  { id: "vet",   name: "คณะสัตวแพทยศาสตร์",             icon: "🐾", web: "https://vet.kku.ac.th",        fb: "https://www.facebook.com/vetmedkku" },
  { id: "tech",  name: "คณะเทคโนโลยี",                  icon: "🧫", web: "https://te.kku.ac.th",         fb: "https://www.facebook.com/TechnologyKKU" },
  { id: "arch",  name: "คณะสถาปัตยกรรมศาสตร์",          icon: "📐", web: "https://arch.kku.ac.th",       fb: "https://www.facebook.com/apdsxkku",
    feed: "https://arch.kku.ac.th/feed/" },
  { id: "kkbs",  name: "คณะบริหารธุรกิจและการบัญชี",     icon: "📊", web: "https://kkbs.kku.ac.th",       fb: "https://www.facebook.com/kkbskku",
    feed: "https://kkbs.kku.ac.th/feed/" },
  { id: "fa",    name: "คณะศิลปกรรมศาสตร์",             icon: "🎨", web: "https://fa.kku.ac.th",         fb: "https://www.facebook.com/FAKKUofficial",
    feed: "https://fa.kku.ac.th/feed/" },
  { id: "law",   name: "คณะนิติศาสตร์",                 icon: "⚖️", web: "https://law.kku.ac.th",        fb: "https://www.facebook.com/facultyoflawkku" },
  { id: "econ",  name: "คณะเศรษฐศาสตร์",               icon: "📈", web: "https://econ.kku.ac.th",       fb: "https://www.facebook.com/EconKKUofficial" },
  { id: "is",    name: "คณะสหวิทยาการ (หนองคาย)",       icon: "🧩", web: "https://nkc.kku.ac.th",        fb: "https://www.facebook.com/PRNKC",
    query: `"คณะสหวิทยาการ" "มหาวิทยาลัยขอนแก่น"` },
  { id: "cp",    name: "วิทยาลัยการคอมพิวเตอร์",         icon: "💻", web: "https://computing.kku.ac.th",  fb: "https://www.facebook.com/computing.kku",
    query: `"วิทยาลัยการคอมพิวเตอร์" "ขอนแก่น"` },
  { id: "cola",  name: "วิทยาลัยการปกครองท้องถิ่น",      icon: "🏛️", web: "https://cola.kku.ac.th",       fb: "https://www.facebook.com/cola.kku",
    query: `"วิทยาลัยการปกครองท้องถิ่น"`, feed: "https://cola.kku.ac.th/feed/" },
  { id: "ic",    name: "วิทยาลัยนานาชาติ",              icon: "🌐", web: "https://ic.kku.ac.th",         fb: "https://www.facebook.com/KKUIC" },
  { id: "gs",    name: "บัณฑิตวิทยาลัย",                icon: "🎓", web: "https://gs.kku.ac.th",         fb: "https://www.facebook.com/graduateschoolkku" },
  { id: "cbs",   name: "วิทยาลัยบัณฑิตศึกษาการจัดการ",   icon: "💼", web: "https://mba.kku.ac.th",        fb: "https://www.facebook.com/mbakkupage",
    query: `"วิทยาลัยบัณฑิตศึกษาการจัดการ"` },
];

const KKU_MAIN = {
  id: "kku", name: "มข.", icon: "🏫",
  web: "https://www.kku.ac.th", fb: "https://www.facebook.com/kkuthailand",
};

// รูปตราคณะใน assets/logos/ (โหลดจากเว็บ/เพจทางการของแต่ละคณะ ส.ค. 2569)
// หน้าเว็บใช้แสดงแทนอีโมจิ — คณะไหนไม่มีไฟล์จะถอยไปใช้อีโมจิเดิม
const LOGO_FILES = {
  med: "med.svg", eng: "eng.jpg", sci: "sci.png", agri: "agri.webp", edu: "edu.png",
  nurse: "nurse.png", hs: "hs.jpg", dent: "dent.png", pharm: "pharm.png", ams: "ams.png",
  ph: "ph.png", vet: "vet.jpg", tech: "tech.png", arch: "arch.png", kkbs: "kkbs.png",
  fa: "fa.webp", law: "law.webp", econ: "econ.png", is: "is.jpg", cp: "cp.png",
  cola: "cola.png", ic: "ic.jpg", gs: "gs.png", cbs: "cbs.png", kku: "kku.jpg",
};

// หมวดหมู่ข่าว — จัดอัตโนมัติจากคำสำคัญในหัวข่าว (ลำดับนี้ใช้เรียงเมนูในหน้าเว็บ)
const TOPICS = [
  { id: "announce",    name: "ประกาศ",         icon: "📢" },
  { id: "study",       name: "การศึกษา",       icon: "📚" },
  { id: "scholarship", name: "ทุนการศึกษา",    icon: "🎓" },
  { id: "activity",    name: "กิจกรรม",        icon: "🎪" },
  { id: "job",         name: "รับสมัครงาน",    icon: "💼" },
  { id: "research",    name: "วิจัย",          icon: "🔬" },
  { id: "other",       name: "อื่นๆ",          icon: "📰" },
];

// กติกาจับคำ — เรียงจากหมวดที่คำเฉพาะเจาะจงสุดก่อน (เช่น "ประกาศรับสมัครทุน" ต้องได้หมวดทุน ไม่ใช่ประกาศ)
const TOPIC_RULES = [
  ["scholarship", /ทุนการศึกษา|ทุนเรียน|มอบทุน|ให้ทุน|รับสมัครทุน|ทุนสนับสนุน|ทุนวิจัย|ทุนแลกเปลี่ยน|scholarship/i],
  ["job",         /รับสมัคร(งาน|บุคคล|พนักงาน|อาจารย์|ลูกจ้าง|เจ้าหน้าที่)|สมัครงาน|jobfair|job\s?fair|ตำแหน่งงาน|หางาน|ฝึกงาน|สหกิจ/i],
  ["research",    /วิจัย|นวัตกรรม|สิทธิบัตร|ตีพิมพ์|ค้นพบ|วารสาร|ผลงานวิชาการ|ทดลอง|สิ่งประดิษฐ์/i],
  ["study",       /TCAS|ทีแคส|รับเข้า|เข้าศึกษา|หลักสูตร|ปริญญา|โควตา|portfolio|แฟ้มสะสม|admission|รอบ\s?\d|รับตรง|รับสมัครนัก(ศึกษา|เรียน)|เปิดรับสมัคร|สอบ|เกณฑ์|การเรียนการสอน|เปิดเทอม|ปิดเทอม|ที่นั่ง|ป\.ตรี|ป\.โท|ป\.เอก/i],
  ["activity",    /กิจกรรม|ค่าย|อบรม|สัมมนา|เสวนา|workshop|เวิร์ก?ช[็อ]?ป|ประกวด|แข่งขัน|open\s?house|โอเพ่นเฮาส์|นิทรรศการ|เทศกาล|ประเพณี|วิ่ง|คอนเสิร์ต|ครบรอบ|พิธี|มหกรรม|จัดงาน|ต้อนรับ|เยือน|ลงนาม|MOU|ความร่วมมือ|รางวัล|คว้า|ชนะเลิศ|บริจาค|จิตอาสา|volunteer/i],
  ["announce",    /ประกาศ|แต่งตั้ง|สรรหา|มาตรการ|ระเบียบ|ข้อบังคับ|แจ้ง|เตือน|กำหนดการ|ปฏิทิน|ปิดปรับปรุง|งดให้|เลื่อน|ยกเลิก/i],
];

function classifyTopic(title) {
  for (const [id, re] of TOPIC_RULES) if (re.test(title)) return id;
  return "other";
}

// ---------- ตัวกรองข่าวที่ไม่เกี่ยวกับนักศึกษา ----------
// ตัดทิ้ง 4 กลุ่ม: คดี/อุบัติเหตุ · การเมือง/โพล · ข่าวภายในองค์กร/บุคลากร · กีฬาอาชีพ
// ใช้กับทั้งข่าวใหม่และข่าวเก่าที่เก็บไว้ (กรองซ้ำทุกรอบ ปรับกติกาแล้วมีผลย้อนหลัง)
const EXCLUDE_RULES = [
  ["คดี/อุบัติเหตุ", /ศาลฎีกา|ศาลอุทธรณ์|ศาลสั่ง|จำคุก|ติดคุก|คดี|ฆาตกรรม|ฆ่า(?!เชื้อ)|เสียชีวิต|บูลลี่|กลั่นแกล้ง|คุกคามทางเพศ|ล่วงละเมิด|ข่มขืน|ยาเสพติด|จับกุม|ถูกจับ|อุบัติเหตุ|รถชน|เฉี่ยวชน|ชนแล้วหนี|ไฟไหม้|เพลิงไหม้|ปล้น|ลักทรัพย์|ฉ้อโกง|หลอกลวง|คอลเซ็นเตอร์|มิจฉาชีพ/],
  ["การเมือง/โพล", /โพล(?!ิเมอร์)|นายกรัฐมนตรี|นายกฯ|การเมือง|พรรคเพื่อไทย|พรรคประชาชน|พรรคภูมิใจไทย|เลือกตั้ง|รัฐสภา|ยุบสภา|กอ\.?\s?รมน|รัฐประหาร|ม็อบ|ประท้วง|ครม\.|คณะรัฐมนตรี/],
  ["ภายในองค์กร", /ดำรงตำแหน่ง|ผู้ช่วยศาสตราจารย์|รองศาสตราจารย์|แต่งตั้ง|โปรดเกล้า|ตรวจประเมิน|peer\s?evaluation|ซ้อมแผน|ซ้อมอพยพ|อัคคีภัย|บันทึกเทป|ร่วมรายการสด|(ร่วม|ออก)รายการ\s?["“']|(อบรม|พัฒนา|เตรียมความพร้อม|สมรรถนะ|ศักยภาพ).{0,12}บุคลากร|บุคลากรสาย|รับมอบ(อาคาร|อุปกรณ์|ครุภัณฑ์)|ส่งมอบ.{0,20}อาคาร|สนับสนุนอุปกรณ์|มอบครุภัณฑ์|สรรหา(คณบดี|อธิการบดี|ผู้อำนวยการ)|ประชุมสภามหาวิทยาลัย|ประเมินคุณธรรม|\bITA\b/i],
  ["กีฬาอาชีพ", /มอดินแดง\s?(เอฟ\.?\s?ซี|f\.?c)|(เอฟ\.?\s?ซี|f\.?c)\.?\s?มอดินแดง|ขอนแก่น\s?(เอฟ\.?\s?ซี|f\.?c|ยูไนเต็ด)|ไทยลีก|ฟุตบอลอาชีพ|นักเตะ/i],
];

function excludeReason(title) {
  for (const [reason, re] of EXCLUDE_RULES) if (re.test(title)) return reason;
  return null;
}

// ---------- กรองเข้ม: เก็บเฉพาะข่าวที่มีประโยชน์ต่อนักศึกษา ----------
// หัวข่าวต้องเอ่ยถึงอย่างน้อยหนึ่งอย่าง: ตัวนักศึกษา/นักเรียน · ทุน · การรับเข้า/หลักสูตร/การสอบ
// · ค่าย/อบรม/ประกวด/กิจกรรม · ฝึกงาน/สายอาชีพ · บริการที่ นศ. ใช้ (หอพัก ห้องสมุด รถราง ฯลฯ)
// · คำเชิญเข้าร่วมงาน — นอกนั้นถือว่าเป็นข่าวองค์กร/ประชาสัมพันธ์ทั่วไป ตัดทิ้ง
// ผลพลอยได้: ข่าววิจัย/รางวัลจะเหลือเฉพาะที่นักศึกษามีส่วนร่วม (หัวข่าวเอ่ยถึง นศ.)
const STUDENT_KEEP = new RegExp(
  [
    // ตัวนักศึกษาเอง (รวมว่าที่ นศ. และบัณฑิตจบใหม่)
    "นักศึกษา|นักเรียน|นศ\\.|น้องใหม่|เฟรชชี่|freshmen|บัณฑิต|รับปริญญา|ผู้สำเร็จการศึกษา",
    // ทุนการศึกษา
    "ทุนการศึกษา|ทุนเรียน|มอบทุน|ให้ทุน|รับสมัครทุน|ทุนแลกเปลี่ยน|scholarship",
    // การรับเข้า / หลักสูตร / การเรียนการสอน
    "TCAS|ทีแคส|รับเข้า|เข้าศึกษา|โควตา|portfolio|แฟ้มสะสม|admission|(?<!ครบ)รอบ\\s?\\d|รับตรง|รับสมัคร|เกณฑ์|ที่นั่ง|หลักสูตร|ปริญญา|ป\\.ตรี|ป\\.โท|ป\\.เอก|เปิดเทอม|ปิดเทอม|ปฏิทินการศึกษา|ลงทะเบียน|การเรียนการสอน|งดการเรียน|เลื่อนสอบ|(?<!ตรวจ)สอบ(?!สวน)|แนะแนว|แนะนำคณะ|แนะนำหลักสูตร",
    // กิจกรรม ค่าย การแข่งขัน งานต่าง ๆ
    "กิจกรรม|ค่าย|อบรม|สัมมนา|เสวนา|workshop|เวิร์ก?ช[็อ]?ป|ประกวด|แข่งขัน|รอบชิง|ชิงชนะเลิศ|ชิงแชมป์|open\\s?house|โอเพ่นเฮาส์|เปิดบ้าน|นิทรรศการ|มหกรรม|สัปดาห์วิทยาศาสตร์|เทศกาล|คอนเสิร์ต|กีฬา|ไหว้ครู|รับน้อง|ปฐมนิเทศ|วิ่ง|จิตอาสา|volunteer|ขอเชิญ|เชิญชวน|ชวน(คุณ|มา|ร่วม|ดู)|ห้ามพลาด",
    // ฝึกงาน / สายอาชีพ
    "ฝึกงาน|สหกิจ|job\\s?fair|jobfair|สมัครงาน|ตำแหน่งงาน|หางาน|อาชีพ|career|ผู้ประกอบการ|startup|intern",
    // บริการที่นักศึกษาใช้
    "หอพัก|ห้องสมุด|shuttle|รถราง|รถบัส|สวัสดิการ|ค่าเทอม|ค่าธรรมเนียม|วัคซีน",
  ].join("|"),
  "i"
);

// ลำดับแหล่ง: feed ทางการของคณะมาก่อน (ข่าวเร็ว มีรูป และตอน dedup ตัวแรกชนะ)
// ตามด้วย Google News รายคณะ แล้วปิดท้ายด้วยข่าวรวมของมหาวิทยาลัย
const SOURCES = [
  ...FACULTIES.filter((f) => f.feed).map((f) => ({
    id: f.id,
    name: `${f.name} (เว็บคณะ)`,
    category: f.name,
    url: f.feed,
    official: true,
    max: MAX_PER_SOURCE,
  })),
  ...FACULTIES.map((f) => ({
    id: f.id,
    name: f.name,
    category: f.name,
    url: gnews(f.query ?? `"${f.name}" "มหาวิทยาลัยขอนแก่น"`),
    max: MAX_PER_SOURCE,
  })),
  {
    id: "kku",
    name: "มข.",
    category: "มข.",
    url: gnews(`"มหาวิทยาลัยขอนแก่น"`),
    max: 20,
  },
];

// ---------- ตัวช่วยแกะ XML แบบเบา ๆ (พอเพียงสำหรับ RSS 2.0) ----------
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : "";
}
function unwrapCdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}
function stripHtml(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// หารูปประกอบข่าวใน item (feed WordPress ฝังรูปไว้ใน content:encoded) — ข้ามโลโก้/ไอคอนเว็บ
function findImage(itemXml) {
  const urls = itemXml.match(/https?:\/\/[^"'<>\s\\]+\.(?:jpe?g|png|webp)/gi) ?? [];
  return urls.find((u) => !/logo|favicon|icon|cropped|emoji|avatar|-\d{2,3}x\d{2,3}\./i.test(u)) ?? null;
}

function parseRss(xml, source) {
  const items = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  return items
    .map((itemXml) => {
      // description ของ Google News เป็นแค่รายการลิงก์ ไม่ใช่เนื้อข่าว — ใช้ชื่อสำนักข่าวแทน
      const outlet = source.official ? "เว็บไซต์คณะ" : stripHtml(tag(itemXml, "source"));
      const pubDate = tag(itemXml, "pubDate");
      let title = stripHtml(unwrapCdata(tag(itemXml, "title")));
      if (!source.official && outlet)
        title = title.replace(new RegExp(`\\s*-\\s*${outlet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`), "");
      return {
        title,
        link: decodeEntities(unwrapCdata(tag(itemXml, "link"))),
        outlet: outlet || "ไม่ระบุแหล่ง",
        publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
        sourceId: source.id,
        category: source.category,
        image: source.official ? findImage(itemXml) : null,
      };
    })
    .slice(0, source.max ?? MAX_PER_SOURCE);
}

// เซิร์ฟเวอร์บางคณะตั้ง TLS ไม่ครบ chain ทำให้ node ตรวจใบรับรองไม่ผ่าน (เบราว์เซอร์/curl เปิดได้ปกติ)
// เฉพาะโดเมน *.kku.ac.th ที่เรากำหนดเองเท่านั้น ยอม fallback ดึงแบบไม่ตรวจใบรับรอง
function fetchInsecure(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" },
        timeout: 20000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return fetchInsecure(new URL(res.headers.location, url).href).then(resolve, reject);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(body));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function fetchXml(source) {
  try {
    const res = await fetch(source.url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    const cert = /certificate|UNABLE_TO_VERIFY|CERT_/i.test(String(err.cause?.code ?? err.cause?.message ?? ""));
    if (cert && source.official && new URL(source.url).hostname.endsWith(".kku.ac.th")) {
      return fetchInsecure(source.url);
    }
    throw err;
  }
}

async function fetchSource(source) {
  try {
    const xml = await fetchXml(source);
    const items = parseRss(xml, source).filter((it) => it.title && it.link);
    console.log(`✓ ${source.name}: ได้ข่าว ${items.length} รายการ`);
    return items;
  } catch (err) {
    console.error(`✗ ${source.name}: ${err.message} (ข้ามแหล่งนี้)`);
    return [];
  }
}

async function main() {
  console.log("กำลังดึงข่าว มข. จากเว็บคณะและทุกแหล่ง...");
  const results = await Promise.all(SOURCES.map(fetchSource));

  // รวมข่าวเก่าไว้ด้วย เผื่อบางแหล่งล่มชั่วคราวข่าวจะได้ไม่หาย
  let previous = [];
  try {
    previous = JSON.parse(await readFile(OUT_FILE, "utf8")).items ?? [];
  } catch {}

  const categoryById = Object.fromEntries(SOURCES.map((s) => [s.id, s.category]));
  // ข่าวจาก Google News บางครั้งหลุดมาทั้งที่ไม่พูดถึง มข. เลย (เช่น ข่าวมหาวิทยาลัยอื่น)
  // หัวข่าวต้องเอ่ยถึง มข./ขอนแก่น/KKU หรือชื่อคณะของแหล่งนั้นเอง จึงจะนับว่าเกี่ยวข้อง
  // ยกเว้นข่าวที่ดึงตรงจากเว็บคณะ — เกี่ยวข้องแน่นอนแม้หัวข่าวไม่ใส่ชื่อมหาลัย (เช่น "KKBS จัดค่าย...")
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const relevantById = Object.fromEntries(
    SOURCES.map((s) => {
      const core = s.category.replace(/^คณะ\s*/, "").replace(/\s*\(.*\)\s*$/, "");
      return [s.id, new RegExp(`ขอนแก่น|มข|kku|${esc(core)}`, "i")];
    })
  );
  const excludeCount = {};
  const seenLink = new Set();
  const seenTitle = new Set(); // ข่าวเดียวกันอาจมาทั้งจากเว็บคณะและ Google News — ตัดซ้ำด้วยหัวข่าว
  const merged = [...results.flat(), ...previous]
    .filter((it) => categoryById[it.sourceId]) // ทิ้งข่าวเก่าจากแหล่งที่เลิกใช้ (เว็บเวอร์ชันก่อน)
    // ข่าวเก่าบางรายการบันทึกชื่อสำนักข่าวไว้ในฟิลด์ source แบบเดิม
    // topic คำนวณใหม่ทุกรอบ เผื่อกติกาจัดหมวดเปลี่ยน
    .map((it) => ({
      ...it,
      category: categoryById[it.sourceId],
      outlet: it.outlet ?? it.source ?? "ไม่ระบุแหล่ง",
      topic: classifyTopic(it.title),
      image: it.image ?? null,
    }))
    .filter((it) => {
      const fromFacultySite = it.outlet === "เว็บไซต์คณะ";
      const reason = excludeReason(it.title) ??
        (!fromFacultySite && !relevantById[it.sourceId].test(it.title) ? "ไม่เอ่ยถึง มข." : null) ??
        (!STUDENT_KEEP.test(it.title) ? "ไม่ใช่ข่าวนักศึกษา" : null);
      if (reason) {
        excludeCount[reason] = (excludeCount[reason] ?? 0) + 1;
        return false;
      }
      // ตัดหัวข่าวเหลือ 60 ตัวอักษรแรกก่อนเทียบ — ข่าวเดียวกันจากคนละแหล่งมักต่างกันแค่ท้ายหัวข่าว
      const titleKey = it.title.toLowerCase().replace(/\s+/g, "").slice(0, 60);
      if (seenLink.has(it.link) || seenTitle.has(titleKey)) return false;
      seenLink.add(it.link);
      seenTitle.add(titleKey);
      return true;
    });

  if (Object.keys(excludeCount).length)
    console.log("\nคัดข่าวไม่เกี่ยวกับนักศึกษาออก:", Object.entries(excludeCount).map(([k, v]) => `${k} ${v}`).join(" · "));

  merged.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const items = merged.slice(0, MAX_TOTAL);

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        sources: [...FACULTIES, KKU_MAIN].map(({ id, name, icon, web, fb }) => ({
          id, name, category: id === "kku" ? "มข." : name, icon, web, fb,
          logo: LOGO_FILES[id] ? `assets/logos/${LOGO_FILES[id]}` : null,
        })),
        topics: TOPICS,
        items,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`\nบันทึกแล้ว ${items.length} ข่าว → ${OUT_FILE}`);
}

main();
