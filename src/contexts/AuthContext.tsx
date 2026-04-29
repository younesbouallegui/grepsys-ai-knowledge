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
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!email || !password) {
      return { error: "Email and password are required" };
    }
    const mockUser: MockUser = {
      id: `mock-${btoa(email).replace(/=/g, "")}`,
      email,
      user_metadata: { display_name: email.split("@")[0] },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockUser));
    setUser(mockUser);
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
