import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "editor" | "viewer";

interface ZabbixUser {
  userid: string;
  username: string;
  name: string;
  surname: string;
  email: string;
  roleid: string;
  usrgrps: Array<{ usrgrpid: string; name?: string }>;
}

interface PlatformUser {
  id: string; // deterministic UUID from zabbix userid
  email: string;
  user_metadata: { display_name: string };
}

interface AuthContextValue {
  user: PlatformUser | null;
  session: { user: PlatformUser } | null;
  zabbixUser: ZabbixUser | null;
  zabbixToken: string | null;
  ssoSessionToken: string | null;
  roles: Role[];
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signInFromSso: (payload: SsoAcceptPayload) => void;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const STORAGE_KEY = "zabbix_auth_session";
const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

interface SsoAcceptPayload {
  session_token: string;
  user: ZabbixUser;
  platform_user_id: string;
  role: Role;
  display_name?: string;
}

interface StoredSession {
  user: PlatformUser;
  zabbixUser: ZabbixUser;
  zabbixToken: string | null;       // present for Zabbix-password sessions
  ssoSessionToken?: string | null;  // present for SSO-minted sessions
  authSource: "zabbix" | "sso";
  role: Role;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);
  const pingTimer = useRef<number | null>(null);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw) as StoredSession);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setLoading(false);
  }, []);

  // Keep-alive ping while signed in via Zabbix password (SSO sessions are self-validating).
  useEffect(() => {
    if (!state?.zabbixToken || state.authSource !== "zabbix") return;
    const ping = async () => {
      try {
        const { data } = await supabase.functions.invoke("zabbix-ping", {
          body: { zabbix_token: state.zabbixToken },
        });
        if (!data?.valid) {
          await doSignOut("Session expired, please sign in again.");
        }
      } catch {
        // network blip — ignore, try again next tick
      }
    };
    pingTimer.current = window.setInterval(ping, PING_INTERVAL_MS);
    return () => {
      if (pingTimer.current) window.clearInterval(pingTimer.current);
    };
  }, [state?.zabbixToken, state?.authSource]);

  const doSignOut = async (reason?: string) => {
    localStorage.removeItem(STORAGE_KEY);
    setState(null);
    if (reason && typeof window !== "undefined") {
      // soft notification; toast may not be mounted here
      try {
        const { toast } = await import("sonner");
        toast.error(reason);
      } catch {}
    }
  };

  const signIn = async (username: string, password: string) => {
    if (!username || !password) return { error: "Username and password are required" };
    try {
      const { data, error } = await supabase.functions.invoke("zabbix-login", {
        body: { username, password },
      });
      if (error) {
        // edge function returned non-2xx
        const msg = (error as any)?.context?.error ?? error.message ?? "Sign-in failed";
        return { error: msg };
      }
      if (!data?.zabbix_token) {
        return { error: data?.error ?? "Invalid username or password. Please check your Zabbix credentials." };
      }
      const platformUser: PlatformUser = {
        id: data.platform_user_id,
        email: data.user.email,
        user_metadata: {
          display_name: [data.user.name, data.user.surname].filter(Boolean).join(" ").trim() || data.user.username,
        },
      };
      const stored: StoredSession = {
        user: platformUser,
        zabbixUser: data.user,
        zabbixToken: data.zabbix_token,
        authSource: "zabbix",
        role: data.role,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      setState(stored);
      return { error: null };
    } catch (e: any) {
      return { error: e?.message ?? "Sign-in failed" };
    }
  };

  const signInFromSso = (payload: SsoAcceptPayload) => {
    const platformUser: PlatformUser = {
      id: payload.platform_user_id,
      email: payload.user.email,
      user_metadata: {
        display_name:
          payload.display_name ||
          [payload.user.name, payload.user.surname].filter(Boolean).join(" ").trim() ||
          payload.user.username,
      },
    };
    const stored: StoredSession = {
      user: platformUser,
      zabbixUser: payload.user,
      zabbixToken: null,
      ssoSessionToken: payload.session_token,
      authSource: "sso",
      role: payload.role,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    setState(stored);
  };

  const signOut = async () => {
    await doSignOut();
  };

  const user = state?.user ?? null;
  const zabbixUser = state?.zabbixUser ?? null;
  const zabbixToken = state?.zabbixToken ?? null;
  const ssoSessionToken = state?.ssoSessionToken ?? null;
  const role = state?.role;
  const roles: Role[] = role ? [role] : [];
  const session = user ? { user } : null;
  const isAdmin = role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user, session, zabbixUser, zabbixToken, ssoSessionToken,
        roles, loading, signIn, signInFromSso, signOut, isAdmin,
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
