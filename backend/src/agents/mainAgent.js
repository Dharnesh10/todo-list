const axios = require('axios');
const { runSalesAgent } = require('./salesAgent');
const { runTechnicalAgent } = require('./technicalAgent');
const { runPricingAgent } = require('./pricingAgent');

const PY_SERVICE_URL = process.env.PY_SERVICE_URL || 'http://localhost:8001';

async function summarizeRfpText(rfpText) {
  const { data } = await axios.post(`${PY_SERVICE_URL}/summarize_rfp`, { rfp_text: rfpText });
  return data;
}

async function orchestrateMainAgent({ months = 3 }) {
  // 1) Identify RFPs
  const sales = await runSalesAgent({ months });
  const selectedText = sales.selectedRfpText || '';

  // 2) Summarize for technical and pricing context
  const summary = await summarizeRfpText(selectedText);

  // 3) Technical agent: match SKUs
  const technical = await runTechnicalAgent({ rfpSummary: summary });

  // 4) Pricing agent: compute costs
  const pricing = await runPricingAgent({ technicalResult: technical, rfpSummary: summary });

  // 5) Consolidate response
  return {
    sales,
    summary,
    technical,
    pricing,
    response: {
      scopeOfSupply: technical.finalTable,
      totals: pricing.totals,
    }
  };
}

module.exports = { orchestrateMainAgent };
