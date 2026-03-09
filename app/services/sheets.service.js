import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

// Load service account credentials from environment variable (as JSON string)
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const auth = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID; // from your sheet URL
const SHEET_NAME = 'Orders'; // name of the sheet tab

/**
 * Append a single order row to the sheet.
 * Checks for duplicate orderName before appending.
 */
export async function appendOrderToSheet(order) {
  try {
    // First, check if orderName already exists in the sheet
    const existing = await findOrderRow(order.orderName);
    if (existing) {
      console.log(`⏭️ Order ${order.orderName} already in sheet, skipping.`);
      return;
    }

    const values = [[
      new Date().toISOString().split('T')[0], // DATE
      order.orderName || '',
      formatCustomerName(order.firstName, order.lastName),
      formatProducts(order.products),
      order.totalPrice || '0',
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:E`, // adjust columns
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    console.log(`✅ Order ${order.orderName} appended to sheet.`);
  } catch (error) {
    console.error(`❌ Sheets append failed:`, error);
    throw error;
  }
}

/**
 * Helper: find if orderName exists in sheet (returns row number or null)
 */
async function findOrderRow(orderName) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!B:B`, // column B = order name
  });
  const rows = response.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === orderName) {
      return i + 1; // 1‑based row number
    }
  }
  return null;
}

function formatCustomerName(first, last) {
  return [first, last].filter(Boolean).join(' ') || '-';
}

function formatProducts(products) {
  if (!Array.isArray(products) || products.length === 0) return '-';
  return products.map(p => `${p.title} (x${p.quantity})`).join(', ');
}