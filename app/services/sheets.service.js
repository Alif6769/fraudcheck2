import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  keyFile: "google-service.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

export async function appendOrderToSheet(order) {
  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "Orders!A1",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        order.orderNumber,
        order.customerName,
        order.shippingPhone,
        order.shippingAddress,
        order.customerTotalOrders,
        order.customerFulfilledOrders,
        // order.fraudRiskScore,
        order.totalPrice,
      ]],
    },
  });
}