import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Loader2, Mail, Lock, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { BrandLogo } from "@/components/brand-logo";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const search = window.location.search;
    if (search.includes("mode=signup")) setMode("signup");
  }, []);

  useEffect(() => {
    if (user) navigate("/app");
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password, name);
    setLoading(false);
    if (!result.ok) setError(result.error ?? "Something went wrong.");
    else navigate("/app");
  };

  return (
    <div className="cs-auth">
      <div className="auth-bg" aria-hidden="true">
        <div className="auth-glow" />
        <div className="auth-grid" />
      </div>

      <div className="auth-shell">
        <Link href="/" className="auth-back" data-testid="auth-back">
          ← Back to home
        </Link>

        <div className="auth-card">
          <div className="auth-logo">
            <BrandLogo variant="auto" height={44} />
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === "signin" ? "active" : ""}`}
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              data-testid="tab-signin"
            >
              Sign in
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              data-testid="tab-signup"
            >
              Create account
            </button>
          </div>

          <h1 className="auth-h">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="auth-sub">
            {mode === "signin"
              ? "Sign in to keep working on your prompts."
              : "Set up your studio in 30 seconds."}
          </p>

          <form onSubmit={submit} className="auth-form" data-testid="auth-form">
            {mode === "signup" && (
              <label className="field">
                <span className="field-label">Your name</span>
                <span className="field-input">
                  <User className="field-icon" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Aarav Sharma"
                    required
                    autoComplete="name"
                    data-testid="input-name"
                  />
                </span>
              </label>
            )}
            <label className="field">
              <span className="field-label">Email</span>
              <span className="field-input">
                <Mail className="field-icon" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  required
                  autoComplete="email"
                  data-testid="input-email"
                />
              </span>
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <span className="field-input">
                <Lock className="field-icon" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === "signin" ? "Your password" : "At least 6 characters"
                  }
                  required
                  minLength={mode === "signup" ? 6 : undefined}
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  data-testid="input-password"
                />
              </span>
            </label>

            {error && (
              <div className="auth-error" data-testid="auth-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg w-full"
              disabled={loading}
              data-testid="auth-submit"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Working…
                </>
              ) : mode === "signin" ? (
                <>
                  Sign in <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Create account <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="auth-foot">
            {mode === "signin" ? (
              <>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                  className="auth-link"
                  data-testid="switch-to-signup"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                  }}
                  className="auth-link"
                  data-testid="switch-to-signin"
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <div className="auth-disclaimer">
            Your account lives on this device only — we don't have a server
            password store. Use a unique password.
          </div>
        </div>
      </div>
    </div>
  );
}
