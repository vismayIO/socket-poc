import { useState } from "react";
import { Auth } from "./components/Auth";
import { TradingChart } from "./components/TradingChart";
import "./index.css";

export function App() {
  const [credentials, setCredentials] = useState<{
    jwt: string;
    nkeySeed: string;
    nkeyPublic: string;
    userId: string;
    credsFile?: string;
  } | null>(null);


  const handleAuthenticated = (creds: {
    jwt: string;
    nkeySeed: string;
    nkeyPublic: string;
    userId: string;
    credsFile?: string;
  }) => {
    setCredentials(creds);
  };

  if (!credentials) {
    return <Auth onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">NATS Trading Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              User: {credentials.userId}
            </span>
            <button
              onClick={() => setCredentials(null)}
              className="text-sm text-primary hover:underline"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      <div className="p-4">
        <TradingChart credentials={credentials} />
      </div>
    </div>
  );
}

export default App;
