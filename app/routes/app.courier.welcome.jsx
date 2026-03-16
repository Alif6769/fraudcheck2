// app/routes/app.courier.welcome.jsx
import { useState } from "react";

export default function Welcome() {
  // Pathao state
  const [pathaoClientId, setPathaoClientId] = useState('');
  const [pathaoClientSecret, setPathaoClientSecret] = useState('');
  const [pathaoEmail, setPathaoEmail] = useState('');
  const [pathaoPassword, setPathaoPassword] = useState('');
  const [pathaoLoading, setPathaoLoading] = useState(false);
  const [pathaoSuccess, setPathaoSuccess] = useState(false);
  const [pathaoError, setPathaoError] = useState('');

  // Steadfast state
  const [steadfastApiKey, setSteadfastApiKey] = useState('');
  const [steadfastApiSecret, setSteadfastApiSecret] = useState('');
  const [steadfastLoading, setSteadfastLoading] = useState(false);
  const [steadfastSuccess, setSteadfastSuccess] = useState(false);
  const [steadfastError, setSteadfastError] = useState('');

  // Debug info – stores encrypted strings after successful save
  const [debugInfo, setDebugInfo] = useState({ pathao: null, steadfast: null });

  const handlePathaoConfirm = async (e) => {
    e.preventDefault();
    setPathaoLoading(true);
    setPathaoError('');
    setPathaoSuccess(false);

    try {
      const response = await fetch('/api/courier/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courier: 'pathao',
          credentials: {
            client_id: pathaoClientId,
            client_secret: pathaoClientSecret,
            username: pathaoEmail,
            password: pathaoPassword,
          }
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');

      setPathaoSuccess(true);
      if (data.encrypted) {
        setDebugInfo(prev => ({ ...prev, pathao: { encrypted: data.encrypted } }));
      }
    } catch (err) {
      setPathaoError(err.message);
    } finally {
      setPathaoLoading(false);
    }
  };

  const handleSteadfastConfirm = async (e) => {
    e.preventDefault();
    setSteadfastLoading(true);
    setSteadfastError('');
    setSteadfastSuccess(false);

    try {
      const response = await fetch('/api/courier/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courier: 'steadfast',
          credentials: {
            api_key: steadfastApiKey,
            api_secret: steadfastApiSecret,
          }
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');

      setSteadfastSuccess(true);
      if (data.encrypted) {
        setDebugInfo(prev => ({ ...prev, steadfast: { encrypted: data.encrypted } }));
      }
    } catch (err) {
      setSteadfastError(err.message);
    } finally {
      setSteadfastLoading(false);
    }
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
                onChange={(e) => setPathaoClientId(e.target.value)}
                required
              />
              <s-text-field
                label="Client Secret"
                type="password"
                value={pathaoClientSecret}
                onChange={(e) => setPathaoClientSecret(e.target.value)}
                required
              />
              <s-text-field
                label="Email"
                type="email"
                value={pathaoEmail}
                onChange={(e) => setPathaoEmail(e.target.value)}
                required
              />
              <s-text-field
                label="Password"
                type="password"
                value={pathaoPassword}
                onChange={(e) => setPathaoPassword(e.target.value)}
                required
              />
              <s-button type="submit" disabled={pathaoLoading}>
                {pathaoLoading ? 'Saving...' : 'Confirm Pathao'}
              </s-button>
              {pathaoError && <s-text color="critical">{pathaoError}</s-text>}
              {pathaoSuccess && <s-text color="success">✅ Pathao credentials saved!</s-text>}
            </s-stack>
          </form>
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
                onChange={(e) => setSteadfastApiKey(e.target.value)}
                required
              />
              <s-text-field
                label="API Secret"
                type="password"
                value={steadfastApiSecret}
                onChange={(e) => setSteadfastApiSecret(e.target.value)}
                required
              />
              <s-button type="submit" disabled={steadfastLoading}>
                {steadfastLoading ? 'Saving...' : 'Confirm Steadfast'}
              </s-button>
              {steadfastError && <s-text color="critical">{steadfastError}</s-text>}
              {steadfastSuccess && <s-text color="success">✅ Steadfast credentials saved!</s-text>}
            </s-stack>
          </form>
        </s-stack>
      </s-box>

      {/* Debug Banner – shows encrypted credentials after submission */}
      {(debugInfo.pathao || debugInfo.steadfast) && (
        <s-box background="base" border="base" borderRadius="base" padding="base">
          <s-stack gap="small">
            <s-heading level="3">🔧 Debug: Encrypted Credentials (as stored)</s-heading>
            <s-text>
              This is only for development. In production, this panel would be hidden.
            </s-text>
            {debugInfo.pathao && (
              <s-box background="soft" padding="small" borderRadius="base">
                <s-text type="strong">Pathao:</s-text>
                <s-text>
                  <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {debugInfo.pathao.encrypted}
                  </span>
                </s-text>
                <s-text type="subdued" size="small">
                  Length: {debugInfo.pathao.encrypted.length} characters
                </s-text>
              </s-box>
            )}
            {debugInfo.steadfast && (
              <s-box background="soft" padding="small" borderRadius="base">
                <s-text type="strong">Steadfast:</s-text>
                <s-text>
                  <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {debugInfo.steadfast.encrypted}
                  </span>
                </s-text>
                <s-text type="subdued" size="small">
                  Length: {debugInfo.steadfast.encrypted.length} characters
                </s-text>
              </s-box>
            )}
          </s-stack>
        </s-box>
      )}
    </s-stack>
  );
}