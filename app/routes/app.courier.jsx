// app/routes/app.courier.jsx
import { Outlet, useNavigate, useLocation, redirect } from "react-router";
import { useState } from "react";

// Reusable form section component
function ConfigSection({ title, description, children }) {
  return (
    <s-box background="soft" padding="base" borderRadius="base">
      <s-stack gap="small">
        <s-heading level="3">{title}</s-heading>
        <s-text>{description}</s-text>
        {children}
      </s-stack>
    </s-box>
  );
}

// Pathao configuration form
function PathaoForm() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    // TODO: Send credentials to your backend for encryption and storage
    // Example: await fetch('/api/courier/pathao/configure', { method: 'POST', body: JSON.stringify({ clientId, clientSecret, username, password }) });
    setLoading(false);
    alert('Pathao configuration saved (demo).');
  };

  return (
    <form onSubmit={handleSubmit}>
      <s-stack gap="small">
        <s-text-field
          label="Client ID"
          value={clientId}
          onChange={setClientId}
          required
        />
        <s-text-field
          label="Client Secret"
          type="password"
          value={clientSecret}
          onChange={setClientSecret}
          required
        />
        <s-text-field
          label="Username (Email)"
          type="email"
          value={username}
          onChange={setUsername}
          required
        />
        <s-text-field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          required
        />
        <s-button type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save Pathao Credentials'}
        </s-button>
      </s-stack>
    </form>
  );
}

// Steadfast configuration form
function SteadfastForm() {
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    // TODO: Send credentials to your backend for encryption and storage
    // Example: await fetch('/api/courier/steadfast/configure', { method: 'POST', body: JSON.stringify({ apiKey, secretKey }) });
    setLoading(false);
    alert('Steadfast configuration saved (demo).');
  };

  return (
    <form onSubmit={handleSubmit}>
      <s-stack gap="small">
        <s-text-field
          label="API Key"
          value={apiKey}
          onChange={setApiKey}
          required
        />
        <s-text-field
          label="Secret Key"
          type="password"
          value={secretKey}
          onChange={setSecretKey}
          required
        />
        <s-text-field
          label="Base URL (optional)"
          value="https://portal.packzy.com/api/v1"
          disabled
          helpText="Default Steadfast API endpoint"
        />
        <s-button type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save Steadfast Credentials'}
        </s-button>
      </s-stack>
    </form>
  );
}

// Updated Welcome component with both forms
function Welcome() {
  return (
    <s-stack gap="base">
      <s-heading level="2">Welcome to Courier Integration</s-heading>
      <s-text>
        This section helps you connect your online store with popular courier services.
        Configure each courier below. All credentials are encrypted before storage.
      </s-text>

      <s-grid columns="1fr 1fr" gap="base">
        <ConfigSection
          title="Pathao"
          description="Enter your Pathao merchant credentials. These are provided when you register as a merchant."
        >
          <PathaoForm />
        </ConfigSection>

        <ConfigSection
          title="Steadfast"
          description="Enter your Steadfast API credentials from your merchant dashboard."
        >
          <SteadfastForm />
        </ConfigSection>
      </s-grid>

      <s-box background="base" border="base" borderRadius="base" padding="base">
        <s-heading level="3">Setup Instructions</s-heading>
        <s-stack gap="small">
          <s-text>1. Fill in the credentials for each courier you want to use.</s-text>
          <s-text>2. Click "Save" – we'll verify and store them securely.</s-text>
          <s-text>3. Once configured, you can create shipments from the courier's sidebar page.</s-text>
          <s-text>4. Need help? Refer to the official API docs or contact support.</s-text>
        </s-stack>
      </s-box>
    </s-stack>
  );
}

// Keep the separate components for future use (e.g., order management)
function PathaoConfig() {
  return (
    <s-stack gap="base">
      <s-heading level="2">Pathao Dashboard</s-heading>
      <s-text>Here you can manage your Pathao orders, view tracking, etc.</s-text>
      {/* Placeholder for order list, etc. */}
    </s-stack>
  );
}

function SteadfastConfig() {
  return (
    <s-stack gap="base">
      <s-heading level="2">Steadfast Dashboard</s-heading>
      <s-text>Here you can manage your Steadfast orders, view tracking, etc.</s-text>
    </s-stack>
  );
}

export async function loader({ request }) {
  const url = new URL(request.url);
  if (url.pathname === "/app/courier") {
    return redirect("/app/courier/welcome");
  }
  return null;
}

export default function CourierLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { to: "welcome", label: "Welcome / Setup" },
    { to: "pathao", label: "Pathao Dashboard" },
    { to: "steadfast", label: "Steadfast Dashboard" },
  ];

  return (
    <s-page heading="Courier Integration" inlineSize="large">
      <s-section padding="base">
        <s-grid gridTemplateColumns="200px 1fr" gap="base">
          {/* Sidebar */}
          <s-box
            background="base"
            border="base"
            borderRadius="base"
            padding="small"
          >
            <s-heading>Couriers</s-heading>
            <s-stack gap="small" paddingBlockStart="small">
              {navItems.map((item) => {
                const href = `/app/courier/${item.to}`;
                const isActive = location.pathname === href;

                return (
                  <s-clickable
                    key={item.to}
                    background={isActive ? "base" : "transparent"}
                    border={isActive ? "base" : "none"}
                    borderRadius="base"
                    padding="small-300"
                    onClick={() => navigate(item.to)}
                  >
                    <s-text
                      type="strong"
                      color={isActive ? "base" : "subdued"}
                    >
                      {item.label}
                    </s-text>
                  </s-clickable>
                );
              })}
            </s-stack>
          </s-box>

          {/* Main content */}
          <s-section padding="none">
            <s-stack gap="base">
              {/* Top breadcrumb-like navigation */}
              <s-stack direction="inline" gap="small">
                <s-link href="/app">Home</s-link>
                <s-link href="/app/courier">Courier</s-link>
              </s-stack>

              {/* Nested routes render here */}
              <Outlet />
            </s-stack>
          </s-section>
        </s-grid>
      </s-section>
    </s-page>
  );
}

// In your router, define children routes:
// { path: "welcome", element: <Welcome /> },
// { path: "pathao", element: <PathaoConfig /> },
// { path: "steadfast", element: <SteadfastConfig /> },