import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { getCredentials, saveCredentials } from "../services/credentials.service";
import { encrypt } from "../../utils/encryption"; // only used in action, not client

// ---------- Loader ----------
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const fraudspyCreds = await getCredentials(shop, "fraudspy");
  const steadfastCreds = await getCredentials(shop, "steadfast");
  const telegramCreds = await getCredentials(shop, "telegram");

  return {
    fraudspy: fraudspyCreds || { apiKey: "" },
    steadfast: steadfastCreds || { email: "", password: "" },
    telegram: telegramCreds || { botToken: "", chatId: "", apiHash: "", apiId: "", session: "" },
  };
}

// ---------- Action ----------
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const service = formData.get("service");

  let data, encrypted;
  if (service === "fraudspy") {
    const apiKey = formData.get("apiKey");
    data = { apiKey };
    await saveCredentials(shop, "fraudspy", data);
    encrypted = encrypt(JSON.stringify(data));
  } else if (service === "steadfast") {
    const email = formData.get("email");
    const password = formData.get("password");
    data = { email, password };
    await saveCredentials(shop, "steadfast", data);
    encrypted = encrypt(JSON.stringify(data));
  } else if (service === "telegram") {
    const botToken = formData.get("botToken");
    const chatId = formData.get("chatId");
    const apiHash = formData.get("apiHash");
    const apiId = formData.get("apiId");
    const session = formData.get("session");
    data = { botToken, chatId, apiHash, apiId, session };
    await saveCredentials(shop, "telegram", data);
    encrypted = encrypt(JSON.stringify(data));
  } else {
    return new Response(JSON.stringify({ error: "Invalid service" }), { status: 400 });
  }

  return new Response(
    JSON.stringify({ success: true, service, encrypted }),
    { headers: { "Content-Type": "application/json" } }
  );
}

// ---------- Component ----------
export default function Setup() {
  const { fraudspy, steadfast, telegram } = useLoaderData();
  const fetcher = useFetcher();
  const [activeService, setActiveService] = useState("fraudspy");
  const [showDebug, setShowDebug] = useState(false);
  const [encryptedData, setEncryptedData] = useState({});

  useEffect(() => {
    if (fetcher.data?.encrypted) {
      setEncryptedData(prev => ({ ...prev, [fetcher.data.service]: fetcher.data.encrypted }));
    }
  }, [fetcher.data]);

  const renderFraudspyForm = () => (
    <fetcher.Form method="post">
      <input type="hidden" name="service" value="fraudspy" />
      <s-stack gap="small">
        <s-text-field
          label="FraudSpy API Key"
          name="apiKey"
          defaultValue={fraudspy.apiKey}
          required
        />
        <s-button type="submit" disabled={fetcher.state !== "idle"}>
          {fetcher.state !== "idle" ? "Saving..." : "Save FraudSpy"}
        </s-button>
      </s-stack>
    </fetcher.Form>
  );

  const renderSteadfastForm = () => (
    <fetcher.Form method="post">
      <input type="hidden" name="service" value="steadfast" />
      <s-stack gap="small">
        <s-text-field
          label="Email"
          name="email"
          defaultValue={steadfast.email}
          required
        />
        <s-text-field
          label="Password"
          name="password"
          type="password"
          defaultValue={steadfast.password}
          required
        />
        <s-button type="submit" disabled={fetcher.state !== "idle"}>
          {fetcher.state !== "idle" ? "Saving..." : "Save Steadfast"}
        </s-button>
      </s-stack>
    </fetcher.Form>
  );

  const renderTelegramForm = () => (
    <fetcher.Form method="post">
      <input type="hidden" name="service" value="telegram" />
      <s-stack gap="small">
        <s-text-field
          label="Bot Token"
          name="botToken"
          defaultValue={telegram.botToken}
          required
        />
        <s-text-field
          label="Chat ID"
          name="chatId"
          defaultValue={telegram.chatId}
          required
        />
        <s-text-field
          label="API Hash"
          name="apiHash"
          defaultValue={telegram.apiHash}
        />
        <s-text-field
          label="API ID"
          name="apiId"
          defaultValue={telegram.apiId}
        />
        <s-text-field
          label="Session String"
          name="session"
          defaultValue={telegram.session}
          multiline
        />
        <s-button type="submit" disabled={fetcher.state !== "idle"}>
          {fetcher.state !== "idle" ? "Saving..." : "Save Telegram"}
        </s-button>
      </s-stack>
    </fetcher.Form>
  );

  return (
    <s-stack gap="base">
      <s-heading level="2">Service Credentials</s-heading>

      {/* Service selection tabs */}
      <s-stack direction="inline" gap="small">
        <s-button
          onClick={() => setActiveService("fraudspy")}
          variant={activeService === "fraudspy" ? "primary" : "secondary"}
        >
          FraudSpy
        </s-button>
        <s-button
          onClick={() => setActiveService("steadfast")}
          variant={activeService === "steadfast" ? "primary" : "secondary"}
        >
          Steadfast
        </s-button>
        <s-button
          onClick={() => setActiveService("telegram")}
          variant={activeService === "telegram" ? "primary" : "secondary"}
        >
          Telegram
        </s-button>
      </s-stack>

      {/* Form for selected service */}
      <s-box background="base" border="base" borderRadius="base" padding="base">
        {activeService === "fraudspy" && renderFraudspyForm()}
        {activeService === "steadfast" && renderSteadfastForm()}
        {activeService === "telegram" && renderTelegramForm()}
      </s-box>

      {/* Feedback message */}
      {fetcher.data?.success && (
        <s-box background="success" padding="small" borderRadius="base">
          <s-text color="success">✅ {fetcher.data.service} credentials saved!</s-text>
        </s-box>
      )}
      {fetcher.data?.error && (
        <s-box background="critical" padding="small" borderRadius="base">
          <s-text color="critical">❌ {fetcher.data.error}</s-text>
        </s-box>
      )}

      {/* Debug Banner */}
      <s-box background="base" border="base" borderRadius="base" padding="base">
        <s-stack gap="small">
          <label>
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
            />{" "}
            Show Debug Info
          </label>

          {showDebug && (
            <s-stack gap="small">
              <s-heading level="3">Raw (Decrypted) Credentials</s-heading>
              <pre style={{ whiteSpace: "pre-wrap", background: "#f5f5f5", padding: "8px", borderRadius: "4px" }}>
                {JSON.stringify({ fraudspy, steadfast, telegram }, null, 2)}
              </pre>

              <s-heading level="3">Encrypted Credentials (after save)</s-heading>
              {Object.keys(encryptedData).length === 0 ? (
                <s-text>No encrypted data yet – save a credential to see it here.</s-text>
              ) : (
                <pre style={{ whiteSpace: "pre-wrap", background: "#f5f5f5", padding: "8px", borderRadius: "4px" }}>
                  {JSON.stringify(encryptedData, null, 2)}
                </pre>
              )}
            </s-stack>
          )}
        </s-stack>
      </s-box>
    </s-stack>
  );
}