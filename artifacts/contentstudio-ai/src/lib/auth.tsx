import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface CSUser {
  id: string;
  email: string;
  name: string;
  createdAt: number;
}

interface StoredAccount {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: number;
}

interface AuthContextValue {
  user: CSUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ACCOUNTS_KEY = "cs_accounts_v1";
const SESSION_KEY = "cs_session_v1";

// Lightweight password fingerprint — this app stores accounts purely in
// localStorage on the user's device, there is no backend to authenticate
// against, so this is intentionally not a security boundary; it's just an
// equality check that doesn't keep the plaintext sitting on disk.
async function fingerprint(password: string): Promise<string> {
  if (typeof crypto !== "undefined" && "subtle" in crypto) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(password),
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback (very old browsers): simple non-cryptographic hash
  let h = 0;
  for (let i = 0; i < password.length; i++) {
    h = (h * 31 + password.charCodeAt(i)) | 0;
  }
  return `f_${h}`;
}

function readAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as StoredAccount[]) : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: StoredAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function readSession(): { userId: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as { userId: string }) : null;
  } catch {
    return null;
  }
}

function writeSession(s: { userId: string } | null) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

function toPublicUser(a: StoredAccount): CSUser {
  return { id: a.id, email: a.email, name: a.name, createdAt: a.createdAt };
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CSUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = readSession();
    if (session) {
      const account = readAccounts().find((a) => a.id === session.userId);
      if (account) setUser(toPublicUser(account));
      else writeSession(null);
    }
    setLoading(false);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const trimmed = email.trim().toLowerCase();
      if (!isValidEmail(trimmed)) {
        return { ok: false, error: "Please enter a valid email address." };
      }
      if (!password) return { ok: false, error: "Please enter your password." };
      const accounts = readAccounts();
      const found = accounts.find((a) => a.email === trimmed);
      if (!found) {
        return {
          ok: false,
          error: "No account found with that email. Try signing up instead.",
        };
      }
      const fp = await fingerprint(password);
      if (fp !== found.passwordHash) {
        return { ok: false, error: "Incorrect password." };
      }
      writeSession({ userId: found.id });
      setUser(toPublicUser(found));
      return { ok: true };
    },
    [],
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const trimmed = email.trim().toLowerCase();
      const trimmedName = name.trim();
      if (!isValidEmail(trimmed)) {
        return { ok: false, error: "Please enter a valid email address." };
      }
      if (password.length < 6) {
        return {
          ok: false,
          error: "Password must be at least 6 characters.",
        };
      }
      if (!trimmedName) {
        return { ok: false, error: "Please enter your name." };
      }
      const accounts = readAccounts();
      if (accounts.some((a) => a.email === trimmed)) {
        return {
          ok: false,
          error: "An account with that email already exists. Try signing in.",
        };
      }
      const fp = await fingerprint(password);
      const account: StoredAccount = {
        id: genId(),
        email: trimmed,
        name: trimmedName,
        passwordHash: fp,
        createdAt: Date.now(),
      };
      writeAccounts([...accounts, account]);
      writeSession({ userId: account.id });
      setUser(toPublicUser(account));
      return { ok: true };
    },
    [],
  );

  const signOut = useCallback(() => {
    writeSession(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
