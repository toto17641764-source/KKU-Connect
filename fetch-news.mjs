// fetch-news.mjs — KKU Connect: ดึงข่าวมหาวิทยาลัยขอนแก่นรายคณะ แล้วบันทึกเป็น data/news.json
// รันด้วย: node fetch-news.mjs  (ไม่ต้องติดตั้ง dependency ใด ๆ)
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(ROOT, "data", "news.json");
const MAX_PER_SOURCE = 10;
const MAX_TOTAL = 400;

// เว็บ มข. และคณะส่วนใหญ่ไม่เปิด RSS — ดึงผ่าน Google News RSS แทน
// (รวมข่าวจากทุกสำนักข่าวไทย + ข่าวประชาสัมพันธ์จากเว็บ มข. เองที่ Google เก็บไว้)
const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=th&gl=TH&ceid=TH:th`;

// คำค้นของคณะใช้ชื่อคณะ + "มหาวิทยาลัยขอนแก่น" คู่กัน เพราะชื่อคณะซ้ำกับมหาวิทยาลัยอื่น
// วิทยาลัยที่ชื่อเฉพาะของ มข. อยู่แล้ว (เช่น วิทยาลัยการปกครองท้องถิ่น) ใช้ชื่อเดี่ยวได้
const kku = (faculty) => gnews(`"${faculty}" "มหาวิทยาลัยขอนแก่น"`);

// คณะ/วิทยาลัยทั้งหมดของมหาวิทยาลัยขอนแก่น — ลำดับนี้ใช้เรียงเมนูในหน้าเว็บด้วย
const FACULTIES = [
  { id: "med",   name: "คณะแพทยศาสตร์",                 icon: "🩺" },
  { id: "eng",   name: "คณะวิศวกรรมศาสตร์",             icon: "⚙️" },
  { id: "sci",   name: "คณะวิทยาศาสตร์",                icon: "🔬" },
  { id: "agri",  name: "คณะเกษตรศาสตร์",                icon: "🌾" },
  { id: "edu",   name: "คณะศึกษาศาสตร์",                icon: "📚" },
  { id: "nurse", name: "คณะพยาบาลศาสตร์",               icon: "🩹" },
  { id: "hs",    name: "คณะมนุษยศาสตร์และสังคมศาสตร์",  icon: "🌏" },
  { id: "dent",  name: "คณะทันตแพทยศาสตร์",             icon: "🦷" },
  { id: "pharm", name: "คณะเภสัชศาสตร์",                icon: "💊" },
  { id: "ams",   name: "คณะเทคนิคการแพทย์",             icon: "🧪" },
  { id: "ph",    name: "คณะสาธารณสุขศาสตร์",            icon: "🏥" },
  { id: "vet",   name: "คณะสัตวแพทยศาสตร์",             icon: "🐾" },
  { id: "tech",  name: "คณะเทคโนโลยี",                  icon: "🧫" },
  { id: "arch",  name: "คณะสถาปัตยกรรมศาสตร์",          icon: "📐" },
  { id: "kkbs",  name: "คณะบริหารธุรกิจและการบัญชี",     icon: "📊" },
  { id: "fa",    name: "คณะศิลปกรรมศาสตร์",             icon: "🎨" },
  { id: "law",   name: "คณะนิติศาสตร์",                 icon: "⚖️" },
  { id: "econ",  name: "คณะเศรษฐศาสตร์",               icon: "📈" },
  { id: "is",    name: "คณะสหวิทยาการ (หนองคาย)",       icon: "🧩", query: `"คณะสหวิทยาการ" "มหาวิทยาลัยขอนแก่น"` },
  { id: "cp",    name: "วิทยาลัยการคอมพิวเตอร์",         icon: "💻", query: `"วิทยาลัยการคอมพิวเตอร์" "ขอนแก่น"` },
  { id: "cola",  name: "วิทยาลัยการปกครองท้องถิ่น",      icon: "🏛️", query: `"วิทยาลัยการปกครองท้องถิ่น"` },
  { id: "ic",    name: "วิทยาลัยนานาชาติ",              icon: "🌐" },
  { id: "gs",    name: "บัณฑิตวิทยาลัย",                icon: "🎓" },
  { id: "cbs",   name: "วิทยาลัยบัณฑิตศึกษาการจัดการ",   icon: "💼", query: `"วิทยาลัยบัณฑิตศึกษาการจัดการ"` },
];

// หมวดหมู่ข่าว — จัดอัตโนมัติจากคำสำคัญในหัวข่าว (ลำดับนี้ใช้เรียงเมนูในหน้าเว็บ)
const TOPICS = [
  { id: "announce",    name: "ประกาศ",         icon: "📢" },
  { id: "study",       name: "การศึกษา",       icon: "📚" },
  { id: "scholarship", name: "ทุนการศึกษา",    icon: "🎓" },
  { id: "activity",    name: "กิจกรรม",        icon: "🎪" },
  { id: "job",         name: "รับสมัครงาน",    icon: "💼" },
  { id: "service",     name: "บริการนักศึกษา", icon: "🛎️" },
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
  ["service",     /หอพัก|ลงทะเบียน|บริการ|สวัสดิการ|ห้องสมุด|สุขภาพ|วัคซีน|รักษา|โรงพยาบาล|คลินิก|รถ(บัส|ราง|ไฟฟ้า|โดยสาร)|shuttle|จิตวิทยา|ให้คำปรึกษา|ประกัน/i],
  ["announce",    /ประกาศ|แต่งตั้ง|สรรหา|มาตรการ|ระเบียบ|ข้อบังคับ|แจ้ง|เตือน|กำหนดการ|ปฏิทิน|ปิดปรับปรุง|งดให้|เลื่อน|ยกเลิก/i],
];

function classifyTopic(title) {
  for (const [id, re] of TOPIC_RULES) if (re.test(title)) return id;
  return "other";
}

// แหล่งรายคณะมาก่อน เพื่อให้ข่าวที่ตรงคณะได้ป้ายคณะ (ตอน dedup ข่าวซ้ำ ตัวแรกชนะ)
// ข่าวรวมของมหาวิทยาลัยไว้ท้ายสุด
const SOURCES = [
  ...FACULTIES.map((f) => ({
    id: f.id,
    name: f.name,
    category: f.name,
    icon: f.icon,
    url: gnews(f.query ?? `"${f.name}" "มหาวิทยาลัยขอนแก่น"`),
    max: MAX_PER_SOURCE,
  })),
  {
    id: "kku",
    name: "มข.",
    category: "มข.",
    icon: "🏫",
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

function parseRss(xml, source) {
  const items = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  return items
    .map((itemXml) => {
      // description ของ Google News เป็นแค่รายการลิงก์ ไม่ใช่เนื้อข่าว — ใช้ชื่อสำนักข่าวแทน
      const outlet = stripHtml(tag(itemXml, "source"));
      const pubDate = tag(itemXml, "pubDate");
      let title = stripHtml(unwrapCdata(tag(itemXml, "title")));
      if (outlet) title = title.replace(new RegExp(`\\s*-\\s*${outlet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`), "");
      return {
        title,
        link: decodeEntities(unwrapCdata(tag(itemXml, "link"))),
        outlet: outlet || "ไม่ระบุแหล่ง",
        publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
        sourceId: source.id,
        category: source.category,
      };
    })
    .slice(0, source.max ?? MAX_PER_SOURCE);
}

async function fetchSource(source) {
  try {
    const res = await fetch(source.url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseRss(xml, source).filter((it) => it.title && it.link);
    console.log(`✓ ${source.name}: ได้ข่าว ${items.length} รายการ`);
    return items;
  } catch (err) {
    console.error(`✗ ${source.name}: ${err.message} (ข้ามแหล่งนี้)`);
    return [];
  }
}

async function main() {
  console.log("กำลังดึงข่าว มข. จากทุกคณะ...");
  const results = await Promise.all(SOURCES.map(fetchSource));

  // รวมข่าวเก่าไว้ด้วย เผื่อบางแหล่งล่มชั่วคราวข่าวจะได้ไม่หาย
  let previous = [];
  try {
    previous = JSON.parse(await readFile(OUT_FILE, "utf8")).items ?? [];
  } catch {}

  const categoryById = Object.fromEntries(SOURCES.map((s) => [s.id, s.category]));
  const seen = new Set();
  const merged = [...results.flat(), ...previous]
    .filter((it) => categoryById[it.sourceId]) // ทิ้งข่าวเก่าจากแหล่งที่เลิกใช้ (เว็บเวอร์ชันก่อน)
    // ข่าวเก่าบางรายการบันทึกชื่อสำนักข่าวไว้ในฟิลด์ source แบบเดิม
    // topic คำนวณใหม่ทุกรอบ เผื่อกติกาจัดหมวดเปลี่ยน
    .map((it) => ({
      ...it,
      category: categoryById[it.sourceId],
      outlet: it.outlet ?? it.source ?? "ไม่ระบุแหล่ง",
      topic: classifyTopic(it.title),
    }))
    .filter((it) => {
      if (seen.has(it.link)) return false;
      seen.add(it.link);
      return true;
    });

  merged.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const items = merged.slice(0, MAX_TOTAL);

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        sources: SOURCES.map(({ id, name, category, icon }) => ({ id, name, category, icon })),
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
