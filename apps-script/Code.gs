// ============================================================
//  Revenue & Sales Performance Dashboard
//  Google Apps Script — Code.gs
//  Northwind Consulting — Creator & Ecommerce
// ============================================================

const DATA_SHEET_ID = '1XojNK4GrGY6j7JeP47fWOep4Iv-S42-D-7dY9OUJ3CA';
const REVENUE_TAB   = 'db_revenue';
const CACHE_KEY     = 'rev_dash_v1';
const CACHE_TTL     = 21600; // 6 hours


// ── Entry point (API / web app mode) ──────────────────────────────────────────
function doGet() {
  try {
    return ContentService
      .createTextOutput(JSON.stringify(getRevenueData()))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ── Called from client via google.script.run ──────────────────────────────────
// Returns compact raw rows + filter options so the client can
// filter and aggregate instantly without a round-trip per filter change.
function getRevenueData() {
  const cache  = CacheService.getScriptCache();
  const cached = _getChunks(cache);
  if (cached) return JSON.parse(cached);

  const ss    = SpreadsheetApp.openById(DATA_SHEET_ID);
  const sheet = ss.getSheetByName(REVENUE_TAB);
  if (!sheet) throw new Error('Tab not found: ' + REVENUE_TAB);

  const vals    = sheet.getDataRange().getValues();
  const headers = vals[0].map(String);

  function col(name) { return headers.indexOf(name); }

  const iOrderDate  = col('order_date');
  const iFinStatus  = col('financial_status');
  const iFulStatus  = col('fulfillment_status');
  const iTotal      = col('total_price');
  const iSubtotal   = col('subtotal_price');
  const iDiscounts  = col('total_discounts');
  const iNetSales   = col('net_sales');
  const iRefund     = col('refund_amount');
  const iUtmSource  = col('utm_source');
  const iUtmCampaign= col('utm_campaign');

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                       'Jul','Aug','Sep','Oct','Nov','Dec'];

  const rows    = [];
  const years   = new Set();
  const months  = new Set();
  const statuses= new Set();
  const sources = new Set();

  for (let i = 1; i < vals.length; i++) {
    const row    = vals[i];
    const orderId = row[col('order_id')];
    if (!orderId) continue;

    const rawDate = row[iOrderDate];
    const d       = rawDate ? new Date(rawDate) : null;
    const yr      = d ? String(d.getFullYear())             : '';
    const mo      = d ? String(d.getMonth() + 1).padStart(2,'0') : '';
    const mKey    = yr && mo ? `${yr}-${mo}` : '';
    const mLabel  = d ? `${MONTH_NAMES[d.getMonth()]} ${yr}` : '';

    const finStatus = String(row[iFinStatus]   || '').trim() || 'unknown';
    const fulStatus = String(row[iFulStatus]   || '').trim() || 'unknown';
    const src       = String(row[iUtmSource]   || '').trim() || 'direct';
    const camp      = String(row[iUtmCampaign] || '').trim() || '(none)';

    const total   = parseFloat(row[iTotal])    || 0;
    const net     = parseFloat(row[iNetSales]) || 0;
    const disc    = parseFloat(row[iDiscounts])|| 0;
    const ref     = parseFloat(row[iRefund])   || 0;

    rows.push({ yr, mo, mKey, mLabel, finStatus, fulStatus, src, camp, total, net, disc, ref });

    if (yr) years.add(yr);
    if (mo) months.add(mo);
    statuses.add(finStatus);
    sources.add(src);
  }

  const MONTH_ORDER = ['01','02','03','04','05','06','07','08','09','10','11','12'];

  const result = {
    rows,
    fo: {
      years:    [...years].sort().reverse(),
      months:   MONTH_ORDER.filter(m => months.has(m))
                  .map(m => ({ value: m, label: MONTH_NAMES[parseInt(m) - 1] })),
      statuses: [...statuses].sort(),
      sources:  [...sources].sort(),
    },
  };

  _putChunks(cache, JSON.stringify(result));
  return result;
}


// ── Cache helpers ──────────────────────────────────────────────────────────────
function _putChunks(cache, json) {
  try {
    const CHUNK = 90000;
    const total = Math.ceil(json.length / CHUNK);
    const pairs = { '__rev_chunks__': String(total) };
    for (let i = 0; i < total; i++) {
      pairs[CACHE_KEY + '_' + i] = json.slice(i * CHUNK, (i + 1) * CHUNK);
    }
    cache.putAll(pairs, CACHE_TTL);
  } catch (e) { console.log('Cache write failed:', e); }
}

function _getChunks(cache) {
  try {
    const meta = cache.get('__rev_chunks__');
    if (!meta) return null;
    const total  = parseInt(meta);
    const keys   = Array.from({ length: total }, (_, i) => CACHE_KEY + '_' + i);
    const stored = cache.getAll(keys);
    if (Object.keys(stored).length !== total) return null;
    return keys.map(k => stored[k]).join('');
  } catch (e) { return null; }
}


// ── Utilities (run from Script Editor) ────────────────────────────────────────
function clearCache() {
  CacheService.getScriptCache().remove('__rev_chunks__');
  Logger.log('Cache cleared.');
}

function warmCache() {
  clearCache();
  getRevenueData();
  Logger.log('Cache warmed at ' + new Date().toLocaleString());
}

function createWarmCacheTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'warmCache')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('warmCache').timeBased().everyHours(4).create();
  Logger.log('Warm-cache trigger created.');
}

function testDataAccess() {
  clearCache();
  const data = getRevenueData();
  Logger.log('Rows: ' + data.rows.length);
  Logger.log('Filter options: ' + JSON.stringify(data.fo));
}
