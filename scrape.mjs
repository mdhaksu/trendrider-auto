// 트렌드라이다 자동 스크래퍼 v2
// 라이브: 무신사 / 29CM / W컨셉 / 라쿠텐(브랜드애비뉴)
// 파일: ZOZOTOWN (zozo.pptx 를 파싱)
// 실행: node scrape.mjs   (헤드풀: set HEADFUL=1 && node scrape.mjs)

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const OUT_DIR = 'public';
const OUT_FILE = path.join(OUT_DIR, 'data.json');
const TOP_N = 20;
const HEADFUL = process.env.HEADFUL === '1';

function kstDate(offsetDays = 0) {
  const now = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function autoScroll(page, steps = 6, dy = 1400, pause = 600) {
  for (let i = 0; i < steps; i++) {
    await page.evaluate((y) => window.scrollBy(0, y), dy).catch(() => {});
    await page.waitForTimeout(pause);
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(400);
}

// 진단 파일 저장 (사이트별)
async function dumpDebug(page, tag) {
  try { await page.screenshot({ path: `debug-${tag}.png`, fullPage: false }); } catch (e) {}
  try { fs.writeFileSync(`debug-${tag}.html`, await page.content()); } catch (e) {}
  try {
    const info = await page.evaluate(() => ({
      title: document.title, url: location.href,
      allLinks: document.querySelectorAll('a').length,
      bodyLen: document.body ? document.body.innerText.length : 0,
      sampleHrefs: Array.from(document.querySelectorAll('a')).slice(0, 40).map(a => a.getAttribute('href')).filter(Boolean),
    }));
    fs.writeFileSync(`debug-${tag}.json`, JSON.stringify(info, null, 2));
  } catch (e) {}
}

// ---------- 무신사 ----------
async function scrapeMusinsa(page) {
  for (const off of [0, -1]) {
    const url = `https://www.musinsa.com/ranking/archive?tab=daily&date=${kstDate(off)}&categoryCode=000&gf=F`;
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
        const cat = parts.slice(3).filter(p => /위$/.test(p)).join(', ');
        const img = box.querySelector('img'); const src = img ? (img.currentSrc || img.src || '') : '';
        out.push({ rank: parseInt(parts[0]) || null, brand: parts[1] || '', name: parts[2] || '', price: '', cat, img: src, url: 'https://www.musinsa.com/products/' + id });
      }
      out.sort((x, y) => (x.rank || 99) - (y.rank || 99));
      return out.slice(0, TOP_N);
    }, TOP_N);
    if (items.length) return items;
  }
  return [];
}

// ---------- 29CM ----------
async function scrape29cm(page) {
  await page.goto('https://www.29cm.co.kr/store/best-items?category_large_code=268100100', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
      out.push({ rank: out.length + 1, brand: parts[0] || '', name: parts[1] || '', price: '', cat: '', img: src, url: 'https://www.29cm.co.kr/product/catalog/' + id });
      if (out.length >= TOP_N) break;
    }
    return out;
  }, TOP_N);
}

// ---------- W컨셉 (여성 베스트) — 라이브 시도 ----------
async function scrapeWconcept(page) {
  const urls = [
    'https://display.wconcept.co.kr/category/women/001001012',
    'https://display.wconcept.co.kr/rn/best?displayCategoryType=10101',
  ];
  let loaded = false;
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: 90000 });
      await page.waitForTimeout(3500);
      await page.waitForSelector('a[href*="/product/"]', { timeout: 25000 }).catch(() => {});
      if (await page.$('a[href*="/product/"]')) { loaded = true; break; }
    } catch (e) {}
  }
  await dumpDebug(page, 'wconcept');
  if (!loaded) throw new Error('W컨셉 상품 목록 로드 실패 (셀렉터/차단 확인)');
  await autoScroll(page);
  return await page.evaluate((TOP_N) => {
    const links = Array.from(document.querySelectorAll('a[href*="/product/"]'));
    const out = []; const seen = new Set();
    for (const a of links) {
      const href = a.getAttribute('href') || ''; const id = href.match(/product\/(\d+)/)?.[1];
      if (!id || seen.has(id)) continue; seen.add(id);
      let box = a; for (let i = 0; i < 5 && box.parentElement; i++) { box = box.parentElement; if (box.querySelector('img') && box.innerText.replace(/\s+/g, '').length > 6) break; }
      const parts = box.innerText.split('\n').map(s => s.trim()).filter(Boolean).filter(p => !/^\d{1,3}%$/.test(p) && !/원$|,\d{3}|리뷰|찜/.test(p));
      const img = box.querySelector('img'); const src = img ? (img.currentSrc || img.src || '') : '';
      const abs = href.startsWith('http') ? href : ('https://www.wconcept.co.kr' + href);
      out.push({ rank: out.length + 1, brand: parts[0] || '', name: parts[1] || '', price: '', cat: '', img: src, url: abs });
      if (out.length >= TOP_N) break;
    }
    return out;
  }, TOP_N);
}

// ---------- 라쿠텐 브랜드애비뉴 (여성 랭킹 sex=1) ----------
async function scrapeRakuten(page) {
  const urls = [
    'https://brandavenue.rakuten.co.jp/ranking/?sale=0&sex=1',
    'https://brandavenue.rakuten.co.jp/ranking/?sex=1',
  ];
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.5' });
  let loaded = false;
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: 90000 });
      await page.waitForTimeout(3500);
      await page.waitForSelector('[class*="brand-text-inline"]', { timeout: 25000 }).catch(() => {});
      if (await page.$('[class*="brand-text-inline"]')) { loaded = true; break; }
    } catch (e) {}
  }
  await dumpDebug(page, 'rakuten');
  if (!loaded) throw new Error('라쿠텐 상품 목록 로드 실패 (셀렉터/차단 확인)');
  await autoScroll(page);
  return await page.evaluate((TOP_N) => {
    // 랭킹 상품 = s-id=brn_ranking_list 가 붙은 /item/ 링크
    const anchors = Array.from(document.querySelectorAll('a[href*="/item/"]'))
      .filter(a => /brn_ranking/.test(a.getAttribute('href') || ''));
    const out = []; const seen = new Set();
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const code = href.match(/\/item\/([\w-]+)/)?.[1];
      if (!code || seen.has(code)) continue; seen.add(code);
      // 카드 컨테이너: 브랜드/가격을 포함하는 상위로 climb
      let box = a;
      for (let i = 0; i < 6 && box.parentElement; i++) { box = box.parentElement; if (box.querySelector('[class*="brand-text-inline"]') && box.querySelector('[class*="price-text--"]')) break; }
      const brand = (box.querySelector('[class*="brand-text-inline"]')?.innerText || '').trim();
      const price = (box.querySelector('[class*="price-text--"]')?.innerText || '').trim().replace(/(円).*/, '$1');
      const im = box.querySelector('img[class*="image--"]') || box.querySelector('img');
      const src = im ? (im.currentSrc || im.src || im.getAttribute('data-src') || '') : '';
      if (!brand) continue;
      const abs = href.startsWith('http') ? href.split('?')[0] : ('https://brandavenue.rakuten.co.jp' + href.split('?')[0]);
      out.push({ rank: out.length + 1, brand, name: '', price, cat: '', img: src, url: abs });
      if (out.length >= TOP_N) break;
    }
    return out;
  }, TOP_N);
}

// ---------- ZOZOTOWN (zozo.pptx 파싱) ----------
function parseZozoPptx() {
  const candidates = ['zozo.pptx', 'public/zozo.pptx'];
  const pptxPath = candidates.find(p => fs.existsSync(p));
  if (!pptxPath) throw new Error('zozo.pptx 파일이 없습니다 (저장소에 zozo.pptx 업로드 필요)');
  const zip = new AdmZip(pptxPath);
  const slides = zip.getEntries()
    .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => (+a.entryName.match(/slide(\d+)/)[1]) - (+b.entryName.match(/slide(\d+)/)[1]));
  const texts = [];
  for (const e of slides) {
    const xml = e.getData().toString('utf8');
    const m = xml.match(/<a:t>[^<]*<\/a:t>/g) || [];
    for (const t of m) {
      texts.push(t.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim());
    }
  }
  const RB = {}, RP = {};
  let rank = null, state = 0, brand = '';
  for (const line of texts) {
    if (/^\d{1,2}$/.test(line) && +line >= 1 && +line <= 50) { rank = +line; state = 1; brand = ''; continue; }
    if (state === 1) { if (/^[¥￥]/.test(line)) continue; brand = line; state = 2; continue; }
    if (state === 2) { if (/^[¥￥]/.test(line)) { if (!(rank in RB)) { RB[rank] = brand; RP[rank] = line; } state = 0; } else { brand = line; } continue; }
  }
  const items = [];
  for (let r = 1; r <= 50; r++) if (RB[r]) items.push({ rank: r, brand: RB[r], name: '', price: RP[r], cat: '', img: '', url: 'https://zozo.jp/ranking/all-sales-women.html' });
  if (!items.length) throw new Error('zozo.pptx 파싱 결과 0개 (형식 확인)');
  return items;
}

async function run() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: !HEADFUL });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR', viewport: { width: 1280, height: 1600 }, timezoneId: 'Asia/Seoul',
  });
  const page = await context.newPage();

  const platforms = {};
  const liveSites = [
    ['musinsa', '무신사', scrapeMusinsa],
    ['cm29', '29CM', scrape29cm],
    ['rakuten', '라쿠텐 패션', scrapeRakuten],
    // ['wconcept', 'W컨셉', scrapeWconcept], // RN 앱이라 상품이 링크가 아님 → 보류 (뉴스동향 유지)
  ];
  for (const [key, label, fn] of liveSites) {
    try {
      const items = await fn(page);
      platforms[key] = { label, items, ok: items.length > 0, error: items.length ? null : 'no items', source: 'live' };
      console.log(`[${label}] ${items.length} items`);
    } catch (e) {
      platforms[key] = { label, items: [], ok: false, error: String(e && e.message || e), source: 'live' };
      console.error(`[${label}] FAILED: ${e && e.message || e}`);
    }
  }
  await browser.close();

  // ZOZO (PPTX)
  try {
    const items = parseZozoPptx();
    platforms.zozo = { label: 'ZOZOTOWN', items, ok: true, error: null, source: 'pptx (weekly)' };
    console.log(`[ZOZOTOWN] ${items.length} items (pptx)`);
  } catch (e) {
    platforms.zozo = { label: 'ZOZOTOWN', items: [], ok: false, error: String(e && e.message || e), source: 'pptx (weekly)' };
    console.error(`[ZOZOTOWN] ${e && e.message || e}`);
  }

  const data = {
    generatedAt: new Date().toISOString(),
    generatedAtKST: new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' KST',
    platforms,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Wrote ${OUT_FILE}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
