// fetch-news.mjs — ดึงข่าวจาก RSS ของแหล่งที่เชื่อถือได้ แล้วบันทึกเป็น data/news.json
// รันด้วย: node fetch-news.mjs  (ไม่ต้องติดตั้ง dependency ใด ๆ)
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(ROOT, "data", "news.json");
const MAX_PER_SOURCE = 15;
const MAX_TOTAL = 120;

// Google News RSS — ใช้กับมหาวิทยาลัยที่เว็บทางการไม่เปิด RSS
// (รวมข่าวจากสำนักข่าวไทยทุกเจ้าที่กล่าวถึงมหาวิทยาลัยนั้น)
const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`"${q}"`)}&hl=th&gl=TH&ceid=TH:th`;

const SOURCES = [
  {
    id: "eduzones",
    name: "Eduzones",
    category: "ข่าวรับสมัคร / TCAS",
    url: "https://www.eduzones.com/feed/",
  },
  {
    id: "camphub",
    name: "CampHub",
    category: "ค่าย / กิจกรรม",
    url: "https://www.camphub.in.th/feed/",
  },
  // ข่าวมหาวิทยาลัย — แยกหมวดตามชื่อมหาวิทยาลัย เพื่อให้หน้าเว็บกรองรายแห่งได้
  {
    id: "tu",
    name: "ม.ธรรมศาสตร์",
    category: "ม.ธรรมศาสตร์",
    url: "https://tu.ac.th/feed",
  },
  {
    id: "chula",
    name: "จุฬาฯ",
    category: "จุฬาฯ",
    url: "https://www.chula.ac.th/feed/?post_type=news",
  },
  {
    id: "mahidol",
    name: "ม.มหิดล",
    category: "ม.มหิดล",
    url: "https://op.mahidol.ac.th/sa/feed/",
  },
  {
    id: "buu",
    name: "ม.บูรพา",
    category: "ม.บูรพา",
    url: "https://www.buu.ac.th/feed",
    // feed ของบูรพาปนประกาศจัดซื้อจัดจ้าง — กรองออก
    exclude: /จัดซื้อ|จัดจ้าง|ประกวดราคา|สาระสำคัญในสัญญา|ผู้ชนะการเสนอราคา|เชิญชวน.*เสนอราคา|ราคากลาง/,
  },
  {
    id: "nu",
    name: "ม.นเรศวร",
    category: "ม.นเรศวร",
    url: "https://www.nu.ac.th/?feed=rss2",
  },
  // 6 แห่งนี้เว็บทางการไม่เปิด RSS → ดึงผ่าน Google News แทน
  { id: "ku", name: "ม.เกษตรศาสตร์", category: "ม.เกษตรศาสตร์", url: gnews("มหาวิทยาลัยเกษตรศาสตร์"), max: 6 },
  { id: "swu", name: "มศว", category: "มศว", url: gnews("มหาวิทยาลัยศรีนครินทรวิโรฒ"), max: 6 },
  { id: "kku", name: "ม.ขอนแก่น", category: "ม.ขอนแก่น", url: gnews("มหาวิทยาลัยขอนแก่น"), max: 6 },
  { id: "cmu", name: "ม.เชียงใหม่", category: "ม.เชียงใหม่", url: gnews("มหาวิทยาลัยเชียงใหม่"), max: 6 },
  { id: "su", name: "ม.ศิลปากร", category: "ม.ศิลปากร", url: gnews("มหาวิทยาลัยศิลปากร"), max: 6 },
  { id: "up", name: "ม.พะเยา", category: "ม.พะเยา", url: gnews("มหาวิทยาลัยพะเยา"), max: 6 },
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
function firstImage(itemXml) {
  const enc = itemXml.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image\/[^"]*"/i);
  if (enc) return enc[1];
  const media = itemXml.match(/<media:content[^>]*url="([^"]+)"/i);
  if (media) return media[1];
  const img = itemXml.match(/<img[^>]*src="([^"]+)"/i);
  if (img) return decodeEntities(img[1]);
  return null;
}

function parseRss(xml, source) {
  const isGnews = source.url.includes("news.google.com");
  const items = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  return items
    .map((itemXml) => {
      const rawDesc = unwrapCdata(tag(itemXml, "description")) || unwrapCdata(tag(itemXml, "content:encoded"));
      // description ของ Google News เป็นแค่รายการลิงก์ ไม่ใช่เนื้อข่าว — ใช้ชื่อสำนักข่าวแทน
      const outlet = isGnews ? stripHtml(tag(itemXml, "source")) : "";
      const summary = isGnews ? (outlet ? `รายงานโดย ${outlet}` : "") : stripHtml(rawDesc).slice(0, 220);
      const pubDate = tag(itemXml, "pubDate");
      let title = stripHtml(unwrapCdata(tag(itemXml, "title")));
      if (isGnews && outlet) title = title.replace(new RegExp(`\\s*-\\s*${outlet}\\s*$`), "");
      return {
        title,
        link: decodeEntities(unwrapCdata(tag(itemXml, "link"))),
        summary: summary + (!isGnews && summary.length >= 220 ? "…" : ""),
        image: firstImage(itemXml),
        publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
        source: source.name,
        sourceId: source.id,
        category: source.category,
      };
    })
    .filter((it) => !(source.exclude && source.exclude.test(it.title)))
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
  console.log("กำลังดึงข่าวจากทุกแหล่ง...");
  const results = await Promise.all(SOURCES.map(fetchSource));

  // รวมข่าวเก่าไว้ด้วย เผื่อบางแหล่งล่มชั่วคราวข่าวจะได้ไม่หาย
  let previous = [];
  try {
    previous = JSON.parse(await readFile(OUT_FILE, "utf8")).items ?? [];
  } catch {}

  // ข่าวเก่าอาจบันทึกด้วยหมวดแบบเดิม ("ข่าวมหาวิทยาลัย") — ปรับให้ตรงหมวดปัจจุบันของแหล่งนั้น
  const categoryById = Object.fromEntries(SOURCES.map((s) => [s.id, s.category]));
  const seen = new Set();
  const merged = [...results.flat(), ...previous]
    .map((it) => ({ ...it, category: categoryById[it.sourceId] ?? it.category }))
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
    JSON.stringify({ updatedAt: new Date().toISOString(), sources: SOURCES.map(({ id, name, category }) => ({ id, name, category })), items }, null, 2),
    "utf8"
  );
  console.log(`\nบันทึกแล้ว ${items.length} ข่าว → ${OUT_FILE}`);
}

main();
