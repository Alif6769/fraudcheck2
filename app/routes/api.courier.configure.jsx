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

    // Encrypt the raw credentials
    const encryptedCredentials = encrypt(JSON.stringify(credentials));

    let accessToken = null;
    let refreshToken = null;
    let tokenExpiresAt = null;
    let storeId = null;

    // For Pathao, obtain an access token using the provided credentials
    if (courier === "pathao") {
      try {
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
        accessToken = encrypt(tokenData.access_token);
        refreshToken = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null;
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
        storeId,
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

    // Return encrypted string for debugging
    return new Response(
      JSON.stringify({ success: true, encrypted: encryptedCredentials }),
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