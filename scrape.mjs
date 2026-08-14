// 트렌드라이다 자동 스크래퍼
// 무신사 / 29CM / ZOZOTOWN 여성 랭킹을 수집해 public/data.json 으로 저장합니다.
// GitHub Actions(또는 로컬)에서 `node scrape.mjs` 로 실행됩니다.

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT_DIR = 'public';
const OUT_FILE = path.join(OUT_DIR, 'data.json');
const TOP_N = 20;

// KST 기준 날짜 (YYYYMMDD). offsetDays=-1 이면 어제.
function kstDate(offsetDays = 0) {
  const now = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function autoScroll(page, steps = 6, dy = 1400, pause = 600) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy).catch(() => {});
    await page.evaluate((y) => window.scrollBy(0, y), dy).catch(() => {});
    await page.waitForTimeout(pause);
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(400);
}

// ---------- 무신사 ----------
async function scrapeMusinsa(page) {
  // 오늘 아카이브가 비어있으면 어제로 폴백
  for (const off of [0, -1]) {
    const date = kstDate(off);
    const url = `https://www.musinsa.com/ranking/archive?tab=daily&date=${date}&categoryCode=000&gf=F`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await autoScroll(page);
    const items = await page.evaluate((TOP_N) => {
      const links = Array.from(document.querySelectorAll('a[href*="/products/"]'));
      const out = []; const seen = new Set();
      for (const a of links) {
        const id = (a.getAttribute('href') || '').match(/products\/(\d+)/)?.[1];
        if (!id || seen.has(id)) continue; seen.add(id);
        let el = a; for (let i = 0; i < 5 && el.parentElement; i++) { el = el.parentElement; if (el.innerText && el.innerText.replace(/\s+/g, '').length > 10) break; }
        let box = a; for (let i = 0; i < 6 && box.parentElement; i++) { box = box.parentElement; if (box.querySelector('img')) break; }
        const parts = el.innerText.split('\n').map(s => s.trim()).filter(Boolean);
        const rank = parseInt(parts[0]) || null;
        const cat = parts.slice(3).filter(p => /위$/.test(p)).join(', ');
        const img = box.querySelector('img'); const src = img ? (img.currentSrc || img.src || '') : '';
        out.push({ rank, brand: parts[1] || '', name: parts[2] || '', cat, img: src, url: 'https://www.musinsa.com/products/' + id });
      }
      out.sort((x, y) => (x.rank || 99) - (y.rank || 99));
      return out.slice(0, TOP_N);
    }, TOP_N);
    if (items.length) return items;
  }
  return [];
}

// ---------- 29CM (여성의류 베스트) ----------
async function scrape29cm(page) {
  const url = 'https://www.29cm.co.kr/store/best-items?category_large_code=268100100';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await autoScroll(page);
  return await page.evaluate((TOP_N) => {
    const links = Array.from(document.querySelectorAll('a[href*="/product/catalog/"]'));
    const out = []; const seen = new Set();
    for (const a of links) {
      const id = (a.getAttribute('href') || '').match(/catalog\/(\d+)/)?.[1];
      if (!id || seen.has(id)) continue; seen.add(id);
      let box = a; for (let i = 0; i < 5 && box.parentElement; i++) { box = box.parentElement; if (box.innerText && box.innerText.replace(/\s+/g, '').length > 8 && box.querySelector('img')) break; }
      let parts = box.innerText.split('\n').map(s => s.trim()).filter(Boolean);
      parts = parts.filter(p => !/^\d{1,3}%$/.test(p) && !/원$|,\d{3}|리뷰|후기|좋아요|\d+\.\d/.test(p));
      const img = box.querySelector('img'); const src = img ? (img.currentSrc || img.src || '') : '';
      out.push({ rank: out.length + 1, brand: parts[0] || '', name: parts[1] || '', cat: '', img: src, url: 'https://www.29cm.co.kr/product/catalog/' + id });
      if (out.length >= TOP_N) break;
    }
    return out;
  }, TOP_N);
}

// ---------- ZOZOTOWN (여성 인기 랭킹) ----------
// 참고: ZOZO는 봇/지연 대응을 위해 로딩을 끈질기게 처리합니다.
async function scrapeZozo(page) {
  const urls = [
    'https://zozo.jp/ranking/all-sales-women.html',
    'https://zozo.jp/ranking/',
  ];
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.5' });
  let loaded = false;
  for (const url of urls) {
    try {
      // 'commit' = 응답 시작하자마자 반환 (완전 로드까지 안 기다림)
      await page.goto(url, { waitUntil: 'commit', timeout: 90000 });
      await page.waitForTimeout(3500);
      // 상품 링크가 뜰 때까지 최대 25초 대기 (안 뜨면 넘어감)
      await page.waitForSelector('a[href*="/goods/"]', { timeout: 25000 }).catch(() => {});
      const has = await page.$('a[href*="/goods/"]');
      if (has) { loaded = true; break; }
    } catch (e) { /* 다음 URL 시도 */ }
  }
  if (!loaded) throw new Error('ZOZO page did not load product list (IP block 가능성)');
  await autoScroll(page, 6, 1400, 800);
  return await page.evaluate((TOP_N) => {
    // 상품 카드 앵커 (goods 상세로 연결)
    const links = Array.from(document.querySelectorAll('a[href*="/goods/"], a[href*="/shop/"][href*="/goods"]'));
    const out = []; const seen = new Set();
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      const key = href.split('?')[0];
      if (!/goods/.test(key) || seen.has(key)) continue; seen.add(key);
      let box = a; for (let i = 0; i < 5 && box.parentElement; i++) { box = box.parentElement; if (box.querySelector('img') && box.innerText && box.innerText.replace(/\s+/g, '').length > 4) break; }
      const parts = box.innerText.split('\n').map(s => s.trim()).filter(Boolean);
      const img = box.querySelector('img'); const src = img ? (img.currentSrc || img.src || img.getAttribute('data-src') || '') : '';
      // 브랜드/상품명 추정: 가격/할인/숫자 라인 제거 후 앞 두 줄
      const clean = parts.filter(p => !/^[\d,]+円/.test(p) && !/%|OFF|SOLD|お気に入り|レビュー/.test(p) && !/^\d+$/.test(p));
      const abs = href.startsWith('http') ? href : ('https://zozo.jp' + href);
      out.push({ rank: out.length + 1, brand: clean[0] || '', name: clean[1] || '', cat: '', img: src, url: abs });
      if (out.length >= TOP_N) break;
    }
    return out;
  }, TOP_N);
}

async function run() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 1600 },
    timezoneId: 'Asia/Seoul',
  });
  const page = await context.newPage();

  const platforms = {};
  const sites = [
    ['musinsa', '무신사', scrapeMusinsa],
    ['cm29', '29CM', scrape29cm],
    ['zozo', 'ZOZOTOWN', scrapeZozo],
  ];
  for (const [key, label, fn] of sites) {
    try {
      const items = await fn(page);
      platforms[key] = { label, items, ok: items.length > 0, error: items.length ? null : 'no items' };
      console.log(`[${label}] ${items.length} items`);
    } catch (e) {
      platforms[key] = { label, items: [], ok: false, error: String(e && e.message || e) };
      console.error(`[${label}] FAILED: ${e}`);
    }
  }

  await browser.close();

  const data = {
    generatedAt: new Date().toISOString(),
    generatedAtKST: new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' KST',
    platforms,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Wrote ${OUT_FILE}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
