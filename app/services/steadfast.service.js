import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

// Credentials from environment variables
const EMAIL = process.env.STEADFAST_EMAIL;
const PASSWORD = process.env.STEADFAST_PASSWORD;
const LOGIN_URL = 'https://steadfast.com.bd/moderator/login';
const FRAUD_CHECK_URL = 'https://steadfast.com.bd/user/frauds/check/';

if (!EMAIL || !PASSWORD) {
  throw new Error('STEADFAST_EMAIL and STEADFAST_PASSWORD must be set in environment');
}

// Create a session with cookie jar
const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

async function loginAndGetSession() {
  // 1. Get login page to extract CSRF token
  const loginPage = await client.get(LOGIN_URL);
  const $ = cheerio.load(loginPage.data);
  const csrfToken = $('input[name="_token"]').val();
  if (!csrfToken) throw new Error('Could not find CSRF token');

  // 2. Post login credentials
  const loginPayload = {
    _token: csrfToken,
    email: EMAIL,
    password: PASSWORD,
  };
  const loginResponse = await client.post(LOGIN_URL, loginPayload, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  // 3. Check success (redirected away from login page)
  if (loginResponse.request.res.responseUrl === LOGIN_URL) {
    throw new Error('Login failed – check credentials');
  }

  // 4. Extract XSRF token from cookies
  const cookies = await jar.getCookies(LOGIN_URL);
  const xsrfCookie = cookies.find(c => c.key === 'XSRF-TOKEN');
  const xsrfToken = xsrfCookie ? xsrfCookie.value : null;

  return { client, csrfToken, xsrfToken };
}

/**
 * Normalize phone number: keep only last 11 digits.
 */
function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.slice(-11);
}

/**
 * Fetch fraud report from Steadfast for a given phone number.
 * Returns a formatted string with totals, success rate, and any fraud reports.
 */
export async function fetchSteadfastReport(phone) {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 11) {
    throw new Error(`Invalid phone number: ${phone}`);
  }

  // Login each time (you could cache the session, but for simplicity we do it per call)
  const { client, csrfToken, xsrfToken } = await loginAndGetSession();

  const url = FRAUD_CHECK_URL + normalized;
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'X-CSRF-TOKEN': csrfToken,
    'X-XSRF-TOKEN': xsrfToken,
    'Accept': 'application/json',
    'Referer': 'https://steadfast.com.bd/user/frauds/check',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };

  const response = await client.get(url, { headers });
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status}: ${response.data}`);
  }

  const data = response.data;
  const totalDelivered = data.total_delivered || 0;
  const totalCancelled = data.total_cancelled || 0;
  const total = totalDelivered + totalCancelled;

  let report = `Total Delivered: ${totalDelivered}\nTotal Cancelled: ${totalCancelled}\n`;
  if (total > 0) {
    const successRate = ((totalDelivered / total) * 100).toFixed(2);
    report += `Success Rate: ${successRate}%\n`;
  } else {
    report += 'Success Rate: N/A (no orders)\n';
  }

  if (data.frauds && data.frauds.length > 0) {
    report += 'Fraud Reports:\n';
    data.frauds.forEach((fraud, idx) => {
      const created = fraud.created_at || 'N/A';
      const details = fraud.details || 'N/A';
      report += `  ${idx + 1}. Created: ${created}\n     Details: ${details}\n`;
    });
  } else {
    report += 'No fraud reports.\n';
  }

  return report;
}