import { useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ---------- Loader ----------
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Get all raw products
  const products = await prisma.product.findMany({
    where: { rawProductFlag: true },
    orderBy: { productName: "asc" },
  });

  // Calculate date thresholds
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  // Fetch all SALE and MANUAL_SALE transactions from last 30 days
  const transactions = await prisma.productTransaction.findMany({
    where: {
      type: { in: ["SALE", "MANUAL_SALE"] },
      timestamp: { gte: thirtyDaysAgo },
    },
  });

  // Build maps for quick aggregation
  const productMap = new Map(products.map(p => [p.productId, p]));

  // Aggregate for 30 days
  const thirtyDayTotals = new Map();
  // Aggregate for 7 days (we'll filter later)
  const sevenDayTotals = new Map();

  for (const t of transactions) {
    if (!productMap.has(t.productId)) continue; // only raw products

    // 30 days
    const current30 = thirtyDayTotals.get(t.productId) || 0;
    thirtyDayTotals.set(t.productId, current30 + t.quantity);

    // 7 days
    if (t.timestamp >= sevenDaysAgo) {
      const current7 = sevenDayTotals.get(t.productId) || 0;
      sevenDayTotals.set(t.productId, current7 + t.quantity);
    }
  }

  // Build arrays for response
  const productStats = products.map(p => ({
    productId: p.productId,
    productName: p.productName,
    sevenDayTotal: sevenDayTotals.get(p.productId) || 0,
    thirtyDayTotal: thirtyDayTotals.get(p.productId) || 0,
  }));

  // Find max values for bar scaling
  const maxSeven = Math.max(...productStats.map(s => s.sevenDayTotal), 1);
  const maxThirty = Math.max(...productStats.map(s => s.thirtyDayTotal), 1);

  return {
    productStats,
    maxSeven,
    maxThirty,
    shopDomain,
  };
}

// ---------- Helper: Bar component ----------
function ValueBar({ value, max, isAverage, days }) {
  const displayValue = isAverage ? (value / days).toFixed(1) : value;
  const barWidth = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ minWidth: "50px" }}>{displayValue}</span>
      <div
        style={{
          height: "20px",
          width: `${barWidth}%`,
          backgroundColor: "#5c6ac4",
          borderRadius: "4px",
          transition: "width 0.2s",
        }}
      />
    </div>
  );
}

// ---------- Component ----------
export default function Analysis() {
  const { productStats, maxSeven, maxThirty, shopDomain } = useLoaderData();
  const [selectedTab, setSelectedTab] = useState(0);
  const [showAverage, setShowAverage] = useState(false);

  const tabs = [
    { id: "7days", label: "Last 7 Days" },
    { id: "30days", label: "Last 30 Days" },
  ];

  const isSeven = selectedTab === 0;
  const days = isSeven ? 7 : 30;
  const max = isSeven ? maxSeven : maxThirty;
  const data = productStats.map(p => ({
    ...p,
    value: isSeven ? p.sevenDayTotal : p.thirtyDayTotal,
  }));

  return (
    <s-page heading="Inventory Analysis" inlineSize="large">
      <s-section>
        <s-stack gap="base">
          <s-text>Shop: {shopDomain}</s-text>

          {/* Custom tab navigation */}
          <s-stack direction="inline" gap="small">
            {tabs.map((tab, index) => (
              <s-button
                key={tab.id}
                onClick={() => setSelectedTab(index)}
                variant={selectedTab === index ? "primary" : "secondary"}
              >
                {tab.label}
              </s-button>
            ))}
          </s-stack>

          {/* Content for selected tab */}
          <s-stack gap="base">
            {/* Checkbox for average toggle */}
            <div style={{ margin: "1rem 0" }}>
              <label>
                <input
                  type="checkbox"
                  checked={showAverage}
                  onChange={(e) => setShowAverage(e.target.checked)}
                />{" "}
                Show average per day
              </label>
            </div>

            {/* Table */}
            <s-box background="base" border="base" borderRadius="base" padding="base">
              <s-heading>{tabs[selectedTab].label}</s-heading>
              <s-table variant="auto">
                <s-table-header-row>
                    <s-table-header style={{ width: '150px' }}>Product</s-table-header>
                    <s-table-header>Value</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {data.length === 0 ? (
                    <s-table-row>
                      <s-table-cell colSpan={2}>No data available.</s-table-cell>
                    </s-table-row>
                  ) : (
                    data.map((item) => (
                      <s-table-row key={item.productId}>
                        <s-table-cell>{item.productName}</s-table-cell>
                        <s-table-cell style={{ minWidth: '300px' }}>
                          <ValueBar
                            value={item.value}
                            max={max}
                            isAverage={showAverage}
                            days={days}
                          />
                        </s-table-cell>
                      </s-table-row>
                    ))
                  )}
                </s-table-body>
              </s-table>
            </s-box>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}