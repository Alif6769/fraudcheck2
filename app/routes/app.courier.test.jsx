import { useState } from "react";
import { useLoaderData } from "react-router";               // ✅ added
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../../utils/encryption.js";
import axios from "axios";

// ---------- Loader: fetch and decrypt credentials ----------
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const pathaoService = await prisma.courierService.findUnique({
    where: { name: "pathao" },
  });
  const steadfastService = await prisma.courierService.findUnique({
    where: { name: "steadfast" },
  });

  // If a courier service is missing, still return null for that part
  const pathaoCreds = pathaoService
    ? await prisma.shopCourierCredentials.findUnique({
        where: {
          shopDomain_courierServiceId: {
            shopDomain,
            courierServiceId: pathaoService.id,
          },
        },
      })
    : null;

  const steadfastCreds = steadfastService
    ? await prisma.shopCourierCredentials.findUnique({
        where: {
          shopDomain_courierServiceId: {
            shopDomain,
            courierServiceId: steadfastService.id,
          },
        },
      })
    : null;

  const decrypted = {
    pathao: pathaoCreds
      ? {
          ...JSON.parse(decrypt(pathaoCreds.credentials)),
          accessToken: decrypt(pathaoCreds.accessToken),
          refreshToken: pathaoCreds.refreshToken ? decrypt(pathaoCreds.refreshToken) : null,
          storeId: pathaoCreds.storeId,
        }
      : null,
    steadfast: steadfastCreds
      ? JSON.parse(decrypt(steadfastCreds.credentials))
      : null,
  };

  return { decrypted, shopDomain }; // ✅ Return plain object – React Router serializes it
}

// ---------- Action: handle order creation (unchanged) ----------
export async function action({ request }) {
  // ... (same as before)
}

// ---------- Helper functions (unchanged) ----------
// ... createPathaoOrder, createSteadfastOrder

// ---------- Component ----------
export default function CourierTest() {
  const { decrypted, shopDomain } = useLoaderData(); // ✅ now works
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  // Pathao form state
  const [pathaoForm, setPathaoForm] = useState({
    merchant_order_id: "TEST-001",
    recipient_name: "Test Customer",
    recipient_phone: "01712345678",
    recipient_address: "House 1, Road 1, Dhaka",
    recipient_city: "",
    recipient_zone: "",
    recipient_area: "",
    delivery_type: "48",
    item_type: "2",
    special_instruction: "",
    item_quantity: "1",
    item_weight: "0.5",
    item_description: "Test parcel",
    amount_to_collect: "500",
  });

  // Steadfast form state
  const [steadfastForm, setSteadfastForm] = useState({
    invoice: "TEST-001",
    recipient_name: "Test Customer",
    recipient_phone: "01712345678",
    recipient_address: "House 1, Road 1, Dhaka",
    cod_amount: "500",
    note: "",
    alternative_phone: "",
    recipient_email: "",
    item_description: "Test parcel",
  });

  // ❌ REMOVED the manual fetch block (lines 206‑213) that used useState incorrectly

  const handlePathaoSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch("/app/courier/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courier: "pathao", ...pathaoForm }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setResponse({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSteadfastSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch("/app/courier/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courier: "steadfast", ...steadfastForm }),
      });
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setResponse({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <s-stack gap="base">
      <s-heading level="2">Courier Test Page</s-heading>
      <s-text>Shop: {shopDomain}</s-text>

      {/* Decrypted credentials display */}
      <s-box background="soft" padding="base" borderRadius="base">
        <s-heading level="3">Decrypted Credentials (for testing only)</s-heading>
        {decrypted?.pathao && (
          <s-box background="base" padding="small" borderRadius="base">
            <s-text type="strong">Pathao:</s-text>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(decrypted.pathao, null, 2)}
            </pre>
          </s-box>
        )}
        {decrypted?.steadfast && (
          <s-box background="base" padding="small" borderRadius="base">
            <s-text type="strong">Steadfast:</s-text>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(decrypted.steadfast, null, 2)}
            </pre>
          </s-box>
        )}
        {!decrypted?.pathao && !decrypted?.steadfast && (
          <s-text>No credentials configured.</s-text>
        )}
      </s-box>

      {/* Forms and response banner – unchanged */}
      {/* ... */}
    </s-stack>
  );
}