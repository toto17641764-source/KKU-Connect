// sw.js — service worker ของ KKU Connect
// หน้าที่ 1: ทำให้ Chrome ยอมให้ติดตั้งเป็นแอป (ต้องมี fetch handler จริง ๆ ถึงจะนับ)
// หน้าที่ 2: เก็บหน้าเว็บกับข่าวล่าสุดไว้ ให้เปิดอ่านย้อนหลังได้ตอนไม่มีเน็ต
//
// กติกาการแคช (ดูรายละเอียดในแต่ละกรณีด้านล่าง):
//   - เปิดหน้าเว็บ / ข้อมูลข่าว = network-first  → ออนไลน์ได้ของใหม่เสมอ ออฟไลน์ค่อยใช้ของเก่า
//   - รูปและไอคอนใน assets/     = cache-first    → ชื่อไฟล์รูปข่าวอิงแฮชของ URL ต้นทาง ไม่เปลี่ยนไส้ในภายหลัง
//   - ฟอนต์จาก Google Fonts     = cache-first    → ออฟไลน์แล้วตัวหนังสือไทยยังสวยเหมือนเดิม
const VERSION = "kkuconnect-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_FILES = ["./", "./index.html", "./config.js", "./qr.js", "./feedback.html", "./data/news.json"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // เก็บทีละไฟล์ ถ้าไฟล์ใดโหลดไม่ได้จะได้ไม่ทำให้ติดตั้ง service worker ล้มทั้งชุด
    await Promise.all(SHELL_FILES.map((f) => cache.add(f).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keep = [SHELL_CACHE, ASSET_CACHE];
    await Promise.all((await caches.keys()).map((k) => (keep.includes(k) ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

async function networkFirst(req, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) ?? (fallback ? await cache.match(fallback) : undefined) ?? Response.error();
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // opaque response (ฟอนต์ข้ามโดเมน) เก็บได้ แม้อ่าน status ไม่ได้
  if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // ส่ง log ไป Apps Script เป็น POST — ปล่อยผ่านไม่ยุ่ง
  const url = new URL(req.url);

  if (FONT_HOSTS.includes(url.hostname)) return e.respondWith(cacheFirst(req, ASSET_CACHE));
  if (url.origin !== self.location.origin) return; // อย่างอื่นนอกโดเมนปล่อยผ่านตามปกติ

  // เปิดหน้าเว็บ: ออฟไลน์แล้วถอยไปใช้ index.html ที่เก็บไว้ จะได้ไม่เจอหน้าไดโนเสาร์
  if (req.mode === "navigate") return e.respondWith(networkFirst(req, SHELL_CACHE, "./index.html"));
  if (url.pathname.endsWith("/data/news.json")) return e.respondWith(networkFirst(req, SHELL_CACHE));
  if (url.pathname.includes("/assets/")) return e.respondWith(cacheFirst(req, ASSET_CACHE));
  e.respondWith(networkFirst(req, SHELL_CACHE));
});
