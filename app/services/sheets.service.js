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

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Orders';

/**
 * Append a single order row to the sheet.
 * Checks for duplicate orderName before appending.
 */
export async function appendOrderToSheet(order) {
  try {
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
      range: `${SHEET_NAME}!A:E`,
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
    range: `${SHEET_NAME}!B:B`,
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
  // Each product on a new line for better readability
  return products.map(p => `${p.title} (x${p.quantity})`).join('\n');
}

/**
 * Clear all data rows (keep header row) from the sheet.
 */
export async function clearSheet() {
  try {
    // Get sheet metadata to find the last row
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      ranges: [],
      includeGridData: false,
    });
    const sheet = spreadsheet.data.sheets.find(s => s.properties.title === SHEET_NAME);
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAME}" not found`);
    }
    const rowCount = sheet.properties.gridProperties.rowCount;
    if (rowCount <= 1) {
      console.log('Sheet has no data rows, nothing to clear.');
      return;
    }

    // Delete rows 2 to rowCount (0‑based: delete dimension startIndex 1, endIndex rowCount)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheet.properties.sheetId,
                dimension: 'ROWS',
                startIndex: 1,    // 0‑based, so row 2 = index 1
                endIndex: rowCount,
              },
            },
          },
        ],
      },
    });
    console.log(`✅ Cleared rows 2–${rowCount} from sheet.`);
  } catch (error) {
    console.error('❌ Failed to clear sheet:', error);
    throw error;
  }
}