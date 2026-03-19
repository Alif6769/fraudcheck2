// app/routes/app.courier.test.jsx
import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router"; // 👈 import useFetcher
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { decrypt } from "../../utils/encryption.js";
import axios from "axios";
// import { useAuthenticatedFetch } from "../hooks/useAuthenticatedFetch";

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

  // Decrypt the full credentials (including stores for Pathao)
  const decrypted = {
    pathao: pathaoCreds
      ? {
          ...JSON.parse(decrypt(pathaoCreds.credentials)),
          accessToken: decrypt(pathaoCreds.accessToken),
          refreshToken: pathaoCreds.refreshToken ? decrypt(pathaoCreds.refreshToken) : null,
          defaultStoreId: pathaoCreds.storeId, // the default store ID (first store)
        }
      : null,
    steadfast: steadfastCreds
      ? JSON.parse(decrypt(steadfastCreds.credentials))
      : null,
  };

  return { decrypted, shopDomain };
}

// ---------- Action: handle order creation ----------
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.json();
  const { courier, ...orderData } = formData;

  try {
    let result;
    if (courier === "pathao") {
      result = await createPathaoOrder(shopDomain, orderData);
    } else if (courier === "steadfast") {
      result = await createSteadfastOrder(shopDomain, orderData);
    } else {
      return new Response(JSON.stringify({ error: "Invalid courier" }), { status: 400 });
    }
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Order creation error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to create order" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ---------- Helper: create Pathao order ----------
async function createPathaoOrder(shopDomain, orderData) {
  const pathaoService = await prisma.courierService.findUnique({
    where: { name: "pathao" },
  });
  const creds = await prisma.shopCourierCredentials.findUnique({
    where: {
      shopDomain_courierServiceId: {
        shopDomain,
        courierServiceId: pathaoService.id,
      },
    },
  });
  if (!creds) throw new Error("Pathao not configured");

  const accessToken = decrypt(creds.accessToken);
  // Use the store ID from the form (selected by user), fallback to stored default
  const storeId = orderData.selected_store_id || creds.storeId;
  if (!storeId) throw new Error("No store selected for Pathao order");

  const payload = {
    store_id: parseInt(storeId),
    merchant_order_id: orderData.merchant_order_id,
    recipient_name: orderData.recipient_name,
    recipient_phone: orderData.recipient_phone,
    recipient_address: orderData.recipient_address,
    recipient_city: orderData.recipient_city ? parseInt(orderData.recipient_city) : undefined,
    recipient_zone: orderData.recipient_zone ? parseInt(orderData.recipient_zone) : undefined,
    recipient_area: orderData.recipient_area ? parseInt(orderData.recipient_area) : undefined,
    delivery_type: parseInt(orderData.delivery_type),
    item_type: parseInt(orderData.item_type),
    special_instruction: orderData.special_instruction || "",
    item_quantity: parseInt(orderData.item_quantity),
    item_weight: parseFloat(orderData.item_weight),
    item_description: orderData.item_description || "",
    amount_to_collect: parseInt(orderData.amount_to_collect),
  };

  // const response = await axios.post(
  //   "https://api-hermes.pathao.com/aladdin/api/v1/orders",
  //   payload,
  //   {
  //     headers: {
  //       Authorization: `Bearer ${accessToken}`,
  //       "Content-Type": "application/json",
  //     },
  //   }
  // );

  // if (response.data.code === 200) {
  //   return {
  //     consignmentId: response.data.data.consignment_id,
  //     trackingLink: `https://merchant.pathao.com/tracking?consignment_id=${response.data.data.consignment_id}&phone=${orderData.recipient_phone}`,
  //     deliveryFee: response.data.data.delivery_fee,
  //     orderStatus: response.data.data.order_status,
  //   };
  // } else {
  //   throw new Error(response.data.message || "Pathao order failed");
  // }
  return {
    consignmentId: "MOCK123456",
    // trackingCode: "MOCKCODE",
    trackingLink: "https://steadfast.com.bd/t/MOCKCODE",
    deliveryFee: 0,
    orderStatus: "in_review",
  };
}

// ---------- Helper: create Steadfast order ----------
async function createSteadfastOrder(shopDomain, orderData) {
  const steadfastService = await prisma.courierService.findUnique({
    where: { name: "steadfast" },
  });
  const creds = await prisma.shopCourierCredentials.findUnique({
    where: {
      shopDomain_courierServiceId: {
        shopDomain,
        courierServiceId: steadfastService.id,
      },
    },
  });
  if (!creds) throw new Error("Steadfast not configured");

  const apiCreds = JSON.parse(decrypt(creds.credentials));

  const payload = {
    invoice: orderData.invoice,
    recipient_name: orderData.recipient_name,
    recipient_phone: orderData.recipient_phone,
    recipient_address: orderData.recipient_address,
    cod_amount: parseFloat(orderData.cod_amount),
    note: orderData.note || "",
    alternative_phone: orderData.alternative_phone || "",
    recipient_email: orderData.recipient_email || "",
    item_description: orderData.item_description || "",
  };

  // const response = await axios.post(
  //   "https://portal.packzy.com/api/v1/create_order",
  //   payload,
  //   {
  //     headers: {
  //       "Api-Key": apiCreds.api_key,
  //       "Secret-Key": apiCreds.api_secret,
  //       "Content-Type": "application/json",
  //     },
  //   }
  // );

  // if (response.data.status === 200) {
  //   return {
  //     consignmentId: response.data.consignment.consignment_id,
  //     trackingCode: response.data.consignment.tracking_code,
  //     trackingLink: `https://steadfast.com.bd/t/${response.data.consignment.tracking_code}`,
  //     invoice: response.data.consignment.invoice,
  //     orderStatus: response.data.consignment.status,
  //   };
  // } else {
  //   throw new Error(response.data.message || "Steadfast order failed");
  // }
  return {
    consignmentId: "MOCK123456",
    trackingCode: "MOCKCODE",
    trackingLink: "https://steadfast.com.bd/t/MOCKCODE",
    invoice: orderData.invoice,
    orderStatus: "in_review",
  };
}

// ---------- Component ----------
export default function CourierTest() {
  const { decrypted, shopDomain } = useLoaderData();
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  // const apiFetch = useAuthenticatedFetch(); // 👈 use this instead of fetch
  const fetcher = useFetcher(); // 👈 create fetcher
  // Pathao form state
  const [pathaoForm, setPathaoForm] = useState({
    selected_store_id: decrypted?.pathao?.defaultStoreId || "",
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

  const handlePathaoSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setResponse(null);
    fetcher.submit(
      { courier: "pathao", ...pathaoForm },
      { method: "post", encType: "application/json" }
    );
  };

  const handleSteadfastSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setResponse(null);
    fetcher.submit(
      { courier: "steadfast", ...steadfastForm },
      { method: "post", encType: "application/json" }
    );
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

      {/* Pathao order form */}
      <s-box background="soft" padding="base" borderRadius="base">
        <s-heading level="3">Create Pathao Test Order</s-heading>
        <form onSubmit={handlePathaoSubmit}>
          <s-grid columns="1fr 1fr" gap="small">
            {/* Store selection dropdown */}
            {decrypted?.pathao?.stores && decrypted.pathao.stores.length > 0 && (
              <s-box gridColumn="span 2">
                <label>Select Pickup Store</label>
                <select
                  value={pathaoForm.selected_store_id}
                  onChange={(e) => setPathaoForm({ ...pathaoForm, selected_store_id: e.target.value })}
                  required
                >
                  <option value="">-- Select a store --</option>
                  {decrypted.pathao.stores.map((store) => (
                    <option key={store.store_id} value={store.store_id}>
                      {store.store_name} (ID: {store.store_id})
                    </option>
                  ))}
                </select>
              </s-box>
            )}
            <s-text-field
              label="Merchant Order ID"
              value={pathaoForm.merchant_order_id}
              onChange={(e) => setPathaoForm({ ...pathaoForm, merchant_order_id: e.target.value })}
            />
            <s-text-field
              label="Recipient Name"
              value={pathaoForm.recipient_name}
              onChange={(e) => setPathaoForm({ ...pathaoForm, recipient_name: e.target.value })}
              required
            />
            <s-text-field
              label="Recipient Phone"
              value={pathaoForm.recipient_phone}
              onChange={(e) => setPathaoForm({ ...pathaoForm, recipient_phone: e.target.value })}
              required
            />
            <s-text-field
              label="Recipient Address"
              value={pathaoForm.recipient_address}
              onChange={(e) => setPathaoForm({ ...pathaoForm, recipient_address: e.target.value })}
              required
            />
            <s-text-field
              label="City ID (optional)"
              value={pathaoForm.recipient_city}
              onChange={(e) => setPathaoForm({ ...pathaoForm, recipient_city: e.target.value })}
            />
            <s-text-field
              label="Zone ID (optional)"
              value={pathaoForm.recipient_zone}
              onChange={(e) => setPathaoForm({ ...pathaoForm, recipient_zone: e.target.value })}
            />
            <s-text-field
              label="Area ID (optional)"
              value={pathaoForm.recipient_area}
              onChange={(e) => setPathaoForm({ ...pathaoForm, recipient_area: e.target.value })}
            />
            <s-text-field
              label="Delivery Type"
              value={pathaoForm.delivery_type}
              onChange={(e) => setPathaoForm({ ...pathaoForm, delivery_type: e.target.value })}
              required
            />
            <s-text-field
              label="Item Type (1=Document,2=Parcel)"
              value={pathaoForm.item_type}
              onChange={(e) => setPathaoForm({ ...pathaoForm, item_type: e.target.value })}
              required
            />
            <s-text-field
              label="Item Quantity"
              type="number"
              value={pathaoForm.item_quantity}
              onChange={(e) => setPathaoForm({ ...pathaoForm, item_quantity: e.target.value })}
              required
            />
            <s-text-field
              label="Item Weight (kg)"
              type="number"
              step="0.1"
              value={pathaoForm.item_weight}
              onChange={(e) => setPathaoForm({ ...pathaoForm, item_weight: e.target.value })}
              required
            />
            <s-text-field
              label="Amount to Collect"
              type="number"
              value={pathaoForm.amount_to_collect}
              onChange={(e) => setPathaoForm({ ...pathaoForm, amount_to_collect: e.target.value })}
              required
            />
            <s-text-field
              label="Special Instruction"
              value={pathaoForm.special_instruction}
              onChange={(e) => setPathaoForm({ ...pathaoForm, special_instruction: e.target.value })}
            />
            <s-text-field
              label="Item Description"
              value={pathaoForm.item_description}
              onChange={(e) => setPathaoForm({ ...pathaoForm, item_description: e.target.value })}
            />
          </s-grid>
          <s-button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Pathao Order"}
          </s-button>
        </form>
      </s-box>

      {/* Steadfast order form (unchanged) */}
      <s-box background="soft" padding="base" borderRadius="base">
        <s-heading level="3">Create Steadfast Test Order</s-heading>
        <form onSubmit={handleSteadfastSubmit}>
          <s-grid columns="1fr 1fr" gap="small">
            <s-text-field
              label="Invoice"
              value={steadfastForm.invoice}
              onChange={(e) => setSteadfastForm({ ...steadfastForm, invoice: e.target.value })}
              required
            />
            <s-text-field
              label="Recipient Name"
              value={steadfastForm.recipient_name}
              onChange={(e) => setSteadfastForm({ ...steadfastForm, recipient_name: e.target.value })}
              required
            />
            <s-text-field
              label="Recipient Phone"
              value={steadfastForm.recipient_phone}
              onChange={(e) => setSteadfastForm({ ...steadfastForm, recipient_phone: e.target.value })}
              required
            />
            <s-text-field
              label="Recipient Address"
              value={steadfastForm.recipient_address}
              onChange={(e) => setSteadfastForm({ ...steadfastForm, recipient_address: e.target.value })}
              required
            />
            <s-text-field
              label="COD Amount"
              type="number"
              value={steadfastForm.cod_amount}
              onChange={(e) => setSteadfastForm({ ...steadfastForm, cod_amount: e.target.value })}
              required
            />
            <s-text-field
              label="Note"
              value={steadfastForm.note}
              onChange={(e) => setSteadfastForm({ ...steadfastForm, note: e.target.value })}
            />
            <s-text-field
              label="Alternative Phone"
              value={steadfastForm.alternative_phone}
              onChange={(e) => setSteadfastForm({ ...steadfastForm, alternative_phone: e.target.value })}
            />
            <s-text-field
              label="Recipient Email"
              type="email"
              value={steadfastForm.recipient_email}
              onChange={(e) => setSteadfastForm({ ...steadfastForm, recipient_email: e.target.value })}
            />
            <s-text-field
              label="Item Description"
              value={steadfastForm.item_description}
              onChange={(e) => setSteadfastForm({ ...steadfastForm, item_description: e.target.value })}
            />
          </s-grid>
          <s-button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Steadfast Order"}
          </s-button>
        </form>
      </s-box>

      {/* Response banner */}
      {response && (
        <s-box
          background={response.success ? "success" : "critical"}
          padding="base"
          borderRadius="base"
          border="base"
        >
          <s-heading level="3">
            {response.success ? "✅ Success" : "❌ Error"}
          </s-heading>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(response, null, 2)}
          </pre>
        </s-box>
      )}
    </s-stack>
  );
}