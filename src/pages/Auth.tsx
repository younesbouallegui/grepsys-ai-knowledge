import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logo from "@/assets/poulina-logo.png";

export default function Auth() {
  const { t } = useTranslation();
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const submitSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    if (error) toast.error(error);
    else navigate("/", { replace: true });
    setBusy(false);
  };

  const submitSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signUp(email, password, displayName);
    if (error) toast.error(error);
    else {
      toast.success("Account created. Signing you in…");
      const r = await signIn(email, password);
      if (r.error) toast.error(r.error);
      else navigate("/", { replace: true });
    }
    setBusy(false);
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
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">{t("auth.welcomeTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("auth.welcomeSubtitle")}</p>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">{t("common.signIn")}</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={submitSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-in">{t("common.email")}</Label>
                  <Input id="email-in" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-in">{t("common.password")}</Label>
                  <Input id="password-in" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.signIn")}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={submitSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name-up">{t("common.displayName")}</Label>
                  <Input id="name-up" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-up">{t("common.email")}</Label>
                  <Input id="email-up" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-up">{t("common.password")}</Label>
                  <Input id="password-up" type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {t("auth.contactAdmin")}
          </p>
        </Card>
      </main>
    </div>
  );
}
