import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "engineer" | "viewer";

const LOCAL_ADMIN_KEY = "poulina.localAdmin";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: Role[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isLocalAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLocalAdmin, setIsLocalAdmin] = useState<boolean>(
    () => typeof window !== "undefined" && localStorage.getItem(LOCAL_ADMIN_KEY) === "1"
  );

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(async () => {
          const { data } = await supabase.from("user_roles").select("role").eq("user_id", s.user.id);
          setRoles((data?.map((r) => r.role) as Role[]) ?? []);
        }, 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", s.user.id);
        setRoles((data?.map((r) => r.role) as Role[]) ?? []);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    // Special admin shortcut: typing exactly "admin" grants local admin access.
    if (email.trim().toLowerCase() === "admin") {
      localStorage.setItem(LOCAL_ADMIN_KEY, "1");
      setIsLocalAdmin(true);
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    localStorage.removeItem(LOCAL_ADMIN_KEY);
    setIsLocalAdmin(false);
    await supabase.auth.signOut();
  };

  // Synthetic user/session when in local-admin mode so guarded routes render.
  const effectiveUser = user ?? (isLocalAdmin ? ({ id: "local-admin", email: "admin@local" } as unknown as User) : null);
  const effectiveSession = session ?? (isLocalAdmin ? ({ user: effectiveUser } as unknown as Session) : null);
  const isAdmin = roles.includes("admin") || isLocalAdmin;

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        session: effectiveSession,
        roles,
        loading,
        signIn,
        signOut,
        isAdmin,
        isLocalAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
