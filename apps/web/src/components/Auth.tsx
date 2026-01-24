import { useState } from "react";
import { signIn, signUp, signOut, useSession } from "../lib/auth-client";
import "./Auth.css";

interface AuthProps {
  onAuthStateChange?: (isAuthenticated: boolean) => void;
}

export function Auth({ onAuthStateChange }: AuthProps) {
  const { data: session, isPending } = useSession();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const result = await signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
          username: username || email.split("@")[0],
        });
        
        if (result.error) {
          setError(result.error.message || "Sign up failed");
        } else {
          onAuthStateChange?.(true);
        }
      } else {
        const result = await signIn.email({
          email,
          password,
        });
        
        if (result.error) {
          setError(result.error.message || "Sign in failed");
        } else {
          onAuthStateChange?.(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    onAuthStateChange?.(false);
  };

  if (isPending) {
    return <div className="auth-container loading">Loading...</div>;
  }

  if (session?.user) {
    return (
      <div className="auth-container authenticated">
        <div className="user-info">
          <div className="avatar">
            {session.user.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="user-details">
            <h3>{session.user.name}</h3>
            <p>{session.user.email}</p>
          </div>
        </div>
        <button onClick={handleSignOut} className="sign-out-btn">
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-tabs">
        <button
          className={`tab ${!isSignUp ? "active" : ""}`}
          onClick={() => setIsSignUp(false)}
        >
          Sign In
        </button>
        <button
          className={`tab ${isSignUp ? "active" : ""}`}
          onClick={() => setIsSignUp(true)}
        >
          Sign Up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        {isSignUp && (
          <>
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
              />
            </div>
          </>
        )}

        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? "Loading..." : isSignUp ? "Create Account" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
