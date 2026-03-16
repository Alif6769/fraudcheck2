// app/routes/app.courier.welcome.jsx
import { useState } from "react";

export async function loader() {
  // Required even if empty – returns no data
  return null;
}

export default function Welcome() {
  // Pathao state
  const [pathaoClientId, setPathaoClientId] = useState('');
  const [pathaoClientSecret, setPathaoClientSecret] = useState('');
  const [pathaoEmail, setPathaoEmail] = useState('');
  const [pathaoPassword, setPathaoPassword] = useState('');
  const [pathaoSubmitted, setPathaoSubmitted] = useState(false);

  // Steadfast state
  const [steadfastApiKey, setSteadfastApiKey] = useState('');
  const [steadfastApiSecret, setSteadfastApiSecret] = useState('');
  const [steadfastSubmitted, setSteadfastSubmitted] = useState(false);

  const handlePathaoConfirm = (e) => {
    e.preventDefault();
    setPathaoSubmitted(true);
  };

  const handleSteadfastConfirm = (e) => {
    e.preventDefault();
    setSteadfastSubmitted(true);
  };

  return (
    <s-stack gap="base">
      {/* Welcome section */}
      <s-box background="soft" padding="base" borderRadius="base">
        <s-stack gap="small">
          <s-heading level="2">Welcome to Courier Integration</s-heading>
          <s-text>
            Configure your courier accounts below. All credentials are encrypted before storage.
          </s-text>
        </s-stack>
      </s-box>

      {/* Pathao section */}
      <s-box background="soft" padding="base" borderRadius="base">
        <s-stack gap="small">
          <s-heading level="3">Pathao Setup</s-heading>
          <s-text>
            Enter your Pathao merchant credentials. You can find these in your Pathao merchant dashboard.
          </s-text>
          <form onSubmit={handlePathaoConfirm}>
            <s-stack gap="small">
              <s-text-field
                label="Client ID"
                value={pathaoClientId}
                onChange={setPathaoClientId}
                required
              />
              <s-text-field
                label="Client Secret"
                type="password"
                value={pathaoClientSecret}
                onChange={setPathaoClientSecret}
                required
              />
              <s-text-field
                label="Email"
                type="email"
                value={pathaoEmail}
                onChange={setPathaoEmail}
                required
              />
              <s-text-field
                label="Password"
                type="password"
                value={pathaoPassword}
                onChange={setPathaoPassword}
                required
              />
              <s-button type="submit">Confirm Pathao</s-button>
            </s-stack>
          </form>
          {pathaoSubmitted && (
            <s-box background="base" border="base" borderRadius="base" padding="small">
              <s-text type="strong">Pathao Credentials (demo):</s-text>
              <s-text>Client ID: {pathaoClientId}</s-text>
              <s-text>Client Secret: {pathaoClientSecret}</s-text>
              <s-text>Email: {pathaoEmail}</s-text>
              <s-text>Password: {pathaoPassword}</s-text>
            </s-box>
          )}
        </s-stack>
      </s-box>

      {/* Steadfast section */}
      <s-box background="soft" padding="base" borderRadius="base">
        <s-stack gap="small">
          <s-heading level="3">Steadfast Setup</s-heading>
          <s-text>
            Enter your Steadfast API credentials from your Steadfast merchant dashboard.
          </s-text>
          <form onSubmit={handleSteadfastConfirm}>
            <s-stack gap="small">
              <s-text-field
                label="API Key"
                value={steadfastApiKey}
                onChange={setSteadfastApiKey}
                required
              />
              <s-text-field
                label="API Secret"
                type="password"
                value={steadfastApiSecret}
                onChange={setSteadfastApiSecret}
                required
              />
              <s-button type="submit">Confirm Steadfast</s-button>
            </s-stack>
          </form>
          {steadfastSubmitted && (
            <s-box background="base" border="base" borderRadius="base" padding="small">
              <s-text type="strong">Steadfast Credentials (demo):</s-text>
              <s-text>API Key: {steadfastApiKey}</s-text>
              <s-text>API Secret: {steadfastApiSecret}</s-text>
            </s-box>
          )}
        </s-stack>
      </s-box>
    </s-stack>
  );
}