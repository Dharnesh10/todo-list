const axios = require('axios');
const cheerio = require('cheerio');

const MOCK_BASE = process.env.MOCK_BASE || 'http://localhost:3001/mock-rfps';

function parseDueDate(text) {
  // Expect formats like 2025-11-10 or 10 Oct 2025
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) return new Date(isoMatch[1]);
  const dmy = text.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})/i);
  if (dmy) {
    const [_, d, mon, y] = dmy;
    return new Date(`${d} ${mon} ${y}`);
  }
  return null;
}

async function scanListingPage(url) {
  const { data: html } = await axios.get(url);
  const $ = cheerio.load(html);
  const rows = [];
  $('.rfp-item').each((_, el) => {
    const title = $(el).find('.title').text().trim();
    const href = $(el).find('a.details').attr('href');
    const dueText = $(el).find('.due').text().trim();
    const dueDate = parseDueDate(dueText);
    const detailsUrl = href?.startsWith('http') ? href : `${MOCK_BASE}/${href}`;
    rows.push({ title, detailsUrl, dueDate: dueDate?.toISOString() || null, dueText });
  });
  return rows;
}

async function fetchRfpDoc(url) {
  const { data } = await axios.get(url);
  return typeof data === 'string' ? data : JSON.stringify(data);
}

async function runSalesAgent({ months = 3 }) {
  const listingUrl = `${MOCK_BASE}/index.html`;
  const rfps = await scanListingPage(listingUrl);

  const horizonMs = months * 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const withinHorizon = rfps.filter(r => {
    if (!r.dueDate) return false;
    const t = new Date(r.dueDate).getTime();
    return t - now <= horizonMs && t >= now;
  });

  withinHorizon.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const selected = withinHorizon[0] || rfps[0] || null;

  let rfpText = null;
  if (selected?.detailsUrl) {
    rfpText = await fetchRfpDoc(selected.detailsUrl);
  }

  return {
    listingUrl,
    months,
    rfps,
    filtered: withinHorizon,
    selected,
    selectedRfpText: rfpText,
  };
}

module.exports = { runSalesAgent };
