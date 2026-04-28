import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/poulina-logo.png";

export default function Auth() {
  const { t } = useTranslation();
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    if (error) toast.error(t("auth.invalid"));
    else navigate("/", { replace: true });
    setBusy(false);
  };

  const seedDemo = async () => {
    setSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke("seed-demo-user", { body: {} });
      if (error) throw error;
      const creds = data?.credentials;
      if (creds) {
        setEmail(creds.email);
        setPassword(creds.password);
        toast.success(`Demo account ready: ${creds.email}`);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create demo account");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background hero-glow">
      <header className="flex items-center justify-between p-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Poulina" className="h-8 w-8 rounded" />
          <span className="font-display font-semibold tracking-tight">{t("common.appName")}</span>
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <Card className="w-full max-w-md p-8 glass animate-fade-up">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{t("auth.welcomeTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("auth.welcomeSubtitle")}</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("common.email")}</Label>
              <Input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("common.password")}</Label>
              <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.signIn")}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> Demo <span className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" className="w-full gap-2" onClick={seedDemo} disabled={seeding}>
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Create demo admin account
          </Button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {t("auth.contactAdmin")}
          </p>
        </Card>
      </main>
    </div>
  );
}
