// app/routes/api.courier.configure.jsx
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { encrypt } from "../../utils/encryption";
import axios from "axios";

export async function action({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const formData = await request.json();
    const { courier, credentials } = formData;

    // Find the courier service
    const courierService = await prisma.courierService.findUnique({
      where: { name: courier },
    });
    if (!courierService) {
      return new Response(JSON.stringify({ error: "Invalid courier" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Base credentials object that will be encrypted
    let fullCredentials = { ...credentials };

    let accessToken = null;
    let refreshToken = null;
    let tokenExpiresAt = null;
    let storeId = null;

    // For Pathao, obtain an access token and fetch stores
    if (courier === "pathao") {
      try {
        // Step 1: Get access token
        const tokenResponse = await axios.post(
          "https://api-hermes.pathao.com/aladdin/api/v1/issue-token",
          {
            client_id: credentials.client_id,
            client_secret: credentials.client_secret,
            grant_type: "password",
            username: credentials.username,
            password: credentials.password,
          }
        );

        const tokenData = tokenResponse.data;
        const rawAccessToken = tokenData.access_token;
        const rawRefreshToken = tokenData.refresh_token;

        // Step 2: Fetch stores using the raw token
        try {
          const storesResponse = await axios.get(
            "https://api-hermes.pathao.com/aladdin/api/v1/stores",
            {
              headers: {
                Authorization: `Bearer ${rawAccessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          // Extract store list (each store has store_id, store_name, etc.)
          if (
            storesResponse.data.code === 200 &&
            storesResponse.data.data &&
            storesResponse.data.data.data
          ) {
            const stores = storesResponse.data.data.data;
            // Attach stores to the credentials object
            fullCredentials.stores = stores;
            // Also set a default storeId (first store) for backward compatibility
            if (stores.length > 0) {
              storeId = stores[0].store_id.toString();
            }
          } else {
            console.error("No stores found for Pathao merchant");
            return new Response(
              JSON.stringify({
                error:
                  "No stores found for your Pathao account. Please create a store in your Pathao merchant dashboard first.",
              }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }
        } catch (storeError) {
          console.error("Pathao stores fetch error:", storeError.response?.data || storeError.message);
          return new Response(
            JSON.stringify({
              error: "Failed to fetch stores from Pathao. Please check your credentials and try again.",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        // Step 3: Encrypt tokens
        accessToken = encrypt(rawAccessToken);
        refreshToken = rawRefreshToken ? encrypt(rawRefreshToken) : null;
        tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
      } catch (error) {
        console.error("Pathao token error:", error.response?.data || error.message);
        return new Response(
          JSON.stringify({
            error: "Failed to obtain Pathao access token. Check your credentials.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // For Steadfast, you could optionally validate the API key here

    // Encrypt the full credentials (including stores for Pathao)
    const encryptedCredentials = encrypt(JSON.stringify(fullCredentials));

    // Upsert credentials (create or update)
    await prisma.shopCourierCredentials.upsert({
      where: {
        shopDomain_courierServiceId: {
          shopDomain,
          courierServiceId: courierService.id,
        },
      },
      update: {
        credentials: encryptedCredentials,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        storeId,   // still store the default store ID for convenience
        isActive: true,
      },
      create: {
        shopDomain,
        courierServiceId: courierService.id,
        credentials: encryptedCredentials,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        storeId,
        isActive: true,
      },
    });

    // Return success (optionally include store list for immediate UI update)
    return new Response(
      JSON.stringify({ 
        success: true, 
        encrypted: encryptedCredentials,
        stores: fullCredentials.stores // send stores back so frontend can show themm
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Database error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to save credentials." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export function loader() {
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}