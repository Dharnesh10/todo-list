const path = require('path');
const fs = require('fs');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '../../../');
const PRODUCTS_PATH = path.join(ROOT, 'data', 'products', 'products.json');
const PY_SERVICE_URL = process.env.PY_SERVICE_URL || 'http://localhost:8001';

function loadProducts() {
  const content = fs.readFileSync(PRODUCTS_PATH, 'utf-8');
  return JSON.parse(content);
}

async function scoreCandidatesWithPython(rfpItem, candidates) {
  const { data } = await axios.post(`${PY_SERVICE_URL}/spec_match`, {
    rfp_item: rfpItem,
    candidates,
  });
  return data;
}

async function runTechnicalAgent({ rfpSummary }) {
  const products = loadProducts();
  const items = rfpSummary?.products || [];

  const perItem = [];
  for (const item of items) {
    const candidates = products.map(p => ({ sku: p.sku, specs: p.specs, description: p.description }));
    const scored = await scoreCandidatesWithPython(item, candidates);
    const top3 = scored.matches.slice(0, 3);
    const chosen = top3[0] || null;

    // Build comparison row
    perItem.push({
      rfpItem: item,
      recommendations: top3,
      chosen,
    });
  }

  // Build final table of scope of supply with chosen SKUs
  const finalTable = perItem.map(x => ({
    rfp_line_id: x?.rfpItem?.line_id,
    description: x?.rfpItem?.description,
    length_m: x?.rfpItem?.length_m,
    quantity: x?.rfpItem?.quantity,
    chosen_sku: x?.chosen?.sku,
    match_percent: x?.chosen?.match_percent,
  }));

  return { perItem, finalTable };
}

module.exports = { runTechnicalAgent };
