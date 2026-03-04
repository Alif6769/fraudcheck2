// app/services/fraudspy.service.js
const FRAUDSPY_API_URL = 'https://fraudspy.com.bd/api/v1/search';
const FRAUDSPY_API_KEY = process.env.FRAUDSPY_API_KEY; // add to Railway env

/**
 * Normalize a phone number to 11-digit format starting with 0.
 * Examples: +8801404139939 → 01404139939, 8801404139939 → 01404139939, 01404139939 stays.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('880') && digits.length > 3) {
    return '0' + digits.slice(3);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits;
  }
  if (digits.length === 13 && digits.startsWith('880')) {
    return '0' + digits.slice(3);
  }
  if (digits.length === 10) {
    return '0' + digits;
  }
  // if it starts with 01 but length != 11, treat as invalid
  return null;
}

/**
 * Call FraudSpy API and return the full report text.
 * Throws an error if the API call fails.
 */
export async function fetchFraudReport(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    throw new Error(`Invalid phone number: ${phone}`);
  }

  const response = await fetch(FRAUDSPY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FRAUDSPY_API_KEY}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify({ phone: normalized }),
  });

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData.message) errorMsg += `: ${errorData.message}`;
      if (errorData.error) errorMsg += `: ${JSON.stringify(errorData.error)}`;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  if (!data || data.ok !== true) {
    throw new Error('FraudSpy returned error or ok=false');
  }

  // Build the report text (same logic as in the Apps Script)
  return buildReportText(data);
}

/**
 * Construct the plain‑text report from the API response.
 * This mimics the Apps Script's buildTextAndStyles but returns only the text.
 */
function buildReportText(data) {
  const lines = [];

  // Overall stats
  if (data.overall) {
    const o = data.overall;
    const total = Number(o.total || 0);
    const delivered = Number(o.delivered || 0);
    const returned = Number(o.returned || 0);
    const successRatio = (Number(o.success_ratio || 0) * 100).toFixed(2) + '%';
    lines.push('OVERALL:');
    lines.push(` • Total: ${total}`);
    lines.push(` • Delivered: ${delivered}`);
    lines.push(` • Returned: ${returned}`);
    lines.push(` • Success ratio: ${successRatio}`);
  } else {
    lines.push('OVERALL: (no data)');
  }

  // Couriers with deliveries
  const courierLines = [];
  if (data.couriers && typeof data.couriers === 'object') {
    for (const [key, c] of Object.entries(data.couriers)) {
      if (!c) continue;
      if (c.skipped) continue; // we'll list skipped separately if needed
      const total = Number(c.total || 0);
      if (total > 0) {
        const successful = Number(c.successful || 0);
        const returned = Number(c.returned || 0);
        courierLines.push(` • ${humanize(key)} — Total: ${total} (Successful: ${successful}, Returned: ${returned})`);
      }
    }
  }
  if (courierLines.length) {
    lines.push('', 'Couriers with deliveries:');
    lines.push(...courierLines);
  } else {
    lines.push('', 'Couriers with deliveries: none (all totals are 0)');
  }

  // Frauds
  if (Array.isArray(data.frauds) && data.frauds.length) {
    lines.push('', 'Fraud reports:');
    for (const f of data.frauds) {
      const parts = [];
      if (f.name) parts.push(`name: ${f.name}`);
      if (f.mobile) parts.push(`mobile: ${f.mobile}`);
      if (f.description) parts.push(`desc: ${f.description}`);
      if (f.reported_on) parts.push(`reported: ${f.reported_on}`);
      lines.push(` • ${humanize(f.source || 'unknown')} — ${parts.join(' | ') || '(no details)'}`);
    }
  }

  return lines.join('\n');
}

function humanize(key) {
  const map = {
    bahok: 'Bahok',
    delivery_tiger: 'Delivery Tiger',
    parceldex: 'ParcelDex',
    pathao: 'Pathao',
    redx: 'RedX',
    steadfast: 'Steadfast',
    carrybee: 'CarryBee',
  };
  return map[key] || String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}