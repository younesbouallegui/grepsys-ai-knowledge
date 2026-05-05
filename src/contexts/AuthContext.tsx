import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Role = "admin" | "engineer" | "viewer";

interface MockUser {
  id: string;
  email: string;
  user_metadata: { display_name: string };
}

interface AuthContextValue {
  user: MockUser | null;
  session: { user: MockUser } | null;
  roles: Role[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const STORAGE_KEY = "mock_auth_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockUser;
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (parsed?.id && uuidRe.test(parsed.id)) setUser(parsed);
        else localStorage.removeItem(STORAGE_KEY); // legacy non-UUID id → force re-login
      }
    } catch {}
    setLoading(false);
  }, []);

  // Deterministic UUID v5-like derivation from email (so the same user always
  // maps to the same UUID across sessions/devices, and so the value fits the
  // `uuid` columns on quiz_attempts / certifications / etc.).
  const emailToUuid = async (email: string): Promise<string> => {
    const data = new TextEncoder().encode(`poulina-mock-auth:${email.toLowerCase().trim()}`);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    const b = Array.from(new Uint8Array(hashBuf)).slice(0, 16);
    // Set version (4) and variant bits to produce a valid UUID
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = b.map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  };

  const signIn = async (email: string, password: string) => {
    if (!email || !password) {
      return { error: "Email and password are required" };
    }
    const id = await emailToUuid(email);
    const display_name = email.split("@")[0];
    const mockUser: MockUser = {
      id,
      email,
      user_metadata: { display_name },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockUser));
    setUser(mockUser);
    // Best-effort upsert a profile row so admin dashboards show a name.
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.from("profiles").upsert({ id, display_name }, { onConflict: "id" });
    } catch {}
    return { error: null };
  };

  const signOut = async () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  const roles: Role[] = user ? ["admin", "engineer", "viewer"] : [];
  const session = user ? { user } : null;
  const isAdmin = !!user;

  return (
    <AuthContext.Provider value={{ user, session, roles, loading, signIn, signOut, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
