const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../../../');
const PRODUCT_PRICES = path.join(ROOT, 'data', 'pricing', 'product_prices.json');
const TEST_PRICES = path.join(ROOT, 'data', 'pricing', 'test_prices.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function priceLine(chosen, rfpItem, productPrices, testPrices, tests) {
  const sku = chosen?.sku;
  const unitPrice = productPrices[sku] ?? 0;
  const length = Number(rfpItem?.length_m ?? 0);
  const quantity = Number(rfpItem?.quantity ?? 1);
  const materialCost = unitPrice * length * quantity;
  const services = (tests || []).map(t => ({ name: t, price: testPrices[t] ?? 0 }));
  const servicesTotal = services.reduce((a, b) => a + b.price, 0);
  return { sku, unitPrice, length_m: length, quantity, materialCost, services, servicesTotal, lineTotal: materialCost + servicesTotal };
}

async function runPricingAgent({ technicalResult, rfpSummary }) {
  const productPrices = loadJson(PRODUCT_PRICES);
  const testPrices = loadJson(TEST_PRICES);
  const tests = rfpSummary?.tests || [];

  const pricedItems = technicalResult.perItem.map(row => {
    const priced = priceLine(row.chosen, row.rfpItem, productPrices, testPrices, tests);
    return { rfp_line_id: row.rfpItem?.line_id, description: row.rfpItem?.description, ...priced };
  });

  const totals = pricedItems.reduce((acc, x) => {
    acc.material += x.materialCost;
    acc.services += x.servicesTotal;
    acc.grandTotal += x.lineTotal;
    return acc;
  }, { material: 0, services: 0, grandTotal: 0 });

  return { pricedItems, totals };
}

module.exports = { runPricingAgent };
