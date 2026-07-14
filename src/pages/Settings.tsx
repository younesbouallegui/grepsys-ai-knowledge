import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  User,
  SlidersHorizontal,
  Bell,
  ShieldCheck,
  Palette,
  Languages,
  Building2,
  Plug,
  Lock,
  LifeBuoy,
} from "lucide-react";
import { useTheme } from "next-themes";

const PREFS_KEY = "grepsys:user-prefs";

interface Prefs {
  notifyEmail: boolean;
  notifyAssessments: boolean;
  notifyWeeklyDigest: boolean;
  notifyProductUpdates: boolean;
  twoFactor: boolean;
  sessionTimeoutMin: number;
  reduceMotion: boolean;
  density: "comfortable" | "compact";
  analyticsOptOut: boolean;
  shareUsage: boolean;
  orgName: string;
  orgDomain: string;
  defaultCategory: string;
}

const defaultPrefs: Prefs = {
  notifyEmail: true,
  notifyAssessments: true,
  notifyWeeklyDigest: false,
  notifyProductUpdates: true,
  twoFactor: false,
  sessionTimeoutMin: 60,
  reduceMotion: false,
  density: "comfortable",
  analyticsOptOut: false,
  shareUsage: true,
  orgName: "Grepsys",
  orgDomain: "grepsys.com",
  defaultCategory: "monitoring",
};

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof User;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="h-9 w-9 rounded-md bg-primary-soft text-primary flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { user, roles, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState("");
  const [lang, setLang] = useState(i18n.language.slice(0, 2));
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, preferred_language")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setName(data.display_name ?? "");
          setLang(data.preferred_language ?? "en");
        }
      });
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs({ ...defaultPrefs, ...JSON.parse(raw) });
    } catch {}
  }, [user]);

  const updatePref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name, preferred_language: lang })
      .eq("id", user.id);
    if (error) toast.error(error.message);
    else {
      i18n.changeLanguage(lang);
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      } catch {}
      toast.success("Settings saved");
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-display font-semibold tracking-tight">{t("nav.settings")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile, preferences, security, and Grepsys workspace settings.
        </p>
      </div>

      {/* Profile */}
      <Card className="p-6 space-y-5">
        <SectionHeader
          icon={User}
          title="Profile"
          description="Your personal information visible across the platform."
        />
        <div className="space-y-2">
          <Label>{t("common.email")}</Label>
          <Input value={user?.email ?? ""} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dn">{t("common.displayName")}</Label>
          <Input id="dn" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Roles</Label>
          <div className="flex flex-wrap gap-1.5">
            {roles.length === 0 ? (
              <span className="text-sm text-muted-foreground">—</span>
            ) : (
              roles.map((r) => (
                <Badge key={r} variant="secondary" className="capitalize">
                  {r}
                </Badge>
              ))
            )}
          </div>
        </div>
      </Card>

      {/* Account Preferences */}
      <Card className="p-6 space-y-5">
        <SectionHeader
          icon={SlidersHorizontal}
          title="Account preferences"
          description="Tune how the workspace behaves for you."
        />
        <div className="space-y-2">
          <Label>Default knowledge category</Label>
          <Select
            value={prefs.defaultCategory}
            onValueChange={(v) => updatePref("defaultCategory", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monitoring">Monitoring</SelectItem>
              <SelectItem value="database">Database</SelectItem>
              <SelectItem value="troubleshooting">Troubleshooting</SelectItem>
              <SelectItem value="proxy">Proxy</SelectItem>
              <SelectItem value="ai">AI Engine</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Separator />
        <Row label="Interface density" hint="Comfortable spacing or compact rows.">
          <Select
            value={prefs.density}
            onValueChange={(v: "comfortable" | "compact") => updatePref("density", v)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="comfortable">Comfortable</SelectItem>
              <SelectItem value="compact">Compact</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Reduce motion" hint="Minimize animations and transitions.">
          <Switch
            checked={prefs.reduceMotion}
            onCheckedChange={(v) => updatePref("reduceMotion", v)}
          />
        </Row>
      </Card>

      {/* Notifications */}
      <Card className="p-6 space-y-1">
        <SectionHeader
          icon={Bell}
          title="Notifications"
          description="Choose what we email you about."
        />
        <Row label="Email notifications" hint="Master switch for all emails.">
          <Switch
            checked={prefs.notifyEmail}
            onCheckedChange={(v) => updatePref("notifyEmail", v)}
          />
        </Row>
        <Separator />
        <Row label="Assessment results" hint="Get notified when a result is ready.">
          <Switch
            checked={prefs.notifyAssessments}
            onCheckedChange={(v) => updatePref("notifyAssessments", v)}
          />
        </Row>
        <Separator />
        <Row label="Weekly skills digest" hint="Summary of team progress every Monday.">
          <Switch
            checked={prefs.notifyWeeklyDigest}
            onCheckedChange={(v) => updatePref("notifyWeeklyDigest", v)}
          />
        </Row>
        <Separator />
        <Row label="Product updates" hint="New features and platform improvements.">
          <Switch
            checked={prefs.notifyProductUpdates}
            onCheckedChange={(v) => updatePref("notifyProductUpdates", v)}
          />
        </Row>
      </Card>

      {/* Security */}
      <Card className="p-6 space-y-1">
        <SectionHeader
          icon={ShieldCheck}
          title="Security"
          description="Protect your Grepsys account."
        />
        <Row label="Two-factor authentication" hint="Require a second factor at sign-in.">
          <Switch
            checked={prefs.twoFactor}
            onCheckedChange={(v) => updatePref("twoFactor", v)}
          />
        </Row>
        <Separator />
        <Row label="Session timeout" hint="Automatically sign out after inactivity.">
          <Select
            value={String(prefs.sessionTimeoutMin)}
            onValueChange={(v) => updatePref("sessionTimeoutMin", Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="60">1 hour</SelectItem>
              <SelectItem value="240">4 hours</SelectItem>
              <SelectItem value="480">8 hours</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Separator />
        <Row label="Active session" hint="Sign out from this device.">
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </Row>
      </Card>

      {/* Appearance */}
      <Card className="p-6 space-y-1">
        <SectionHeader
          icon={Palette}
          title="Appearance"
          description="Customize the look and feel."
        />
        <Row label="Theme" hint="Light, dark, or follow system.">
          <Select value={theme ?? "system"} onValueChange={setTheme}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t("theme.light")}</SelectItem>
              <SelectItem value="dark">{t("theme.dark")}</SelectItem>
              <SelectItem value="system">{t("theme.system")}</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Card>

      {/* Language & Region */}
      <Card className="p-6 space-y-5">
        <SectionHeader
          icon={Languages}
          title="Language & region"
          description="Set your preferred display language."
        />
        <div className="space-y-2">
          <Label>{t("common.language")}</Label>
          <Select value={lang} onValueChange={setLang}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t("common.english")}</SelectItem>
              <SelectItem value="fr">{t("common.french")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Branding / Workspace */}
      <Card className="p-6 space-y-5">
        <SectionHeader
          icon={Building2}
          title="Workspace & branding"
          description="Organization identity displayed across Grepsys AI."
        />
        <div className="space-y-2">
          <Label>Organization name</Label>
          <Input
            value={prefs.orgName}
            onChange={(e) => updatePref("orgName", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Primary domain</Label>
          <Input
            value={prefs.orgDomain}
            onChange={(e) => updatePref("orgDomain", e.target.value)}
          />
        </div>
      </Card>

      {/* Integrations */}
      <Card className="p-6 space-y-1">
        <SectionHeader
          icon={Plug}
          title="Integrations"
          description="Connect Grepsys AI with your enterprise tools."
        />
        <Row label="Microsoft 365" hint="Sync calendar and identity.">
          <Badge variant="outline">Available</Badge>
        </Row>
        <Separator />
        <Row label="Slack" hint="Receive assessment alerts in a channel.">
          <Badge variant="outline">Available</Badge>
        </Row>
        <Separator />
        <Row label="Webhook" hint="Send events to your own endpoint.">
          <Badge variant="secondary">Soon</Badge>
        </Row>
      </Card>

      {/* Privacy */}
      <Card className="p-6 space-y-1">
        <SectionHeader
          icon={Lock}
          title="Privacy"
          description="Control what data is collected and shared."
        />
        <Row label="Share anonymous usage" hint="Helps us improve Grepsys AI.">
          <Switch
            checked={prefs.shareUsage}
            onCheckedChange={(v) => updatePref("shareUsage", v)}
          />
        </Row>
        <Separator />
        <Row label="Opt out of analytics" hint="Stop in-app analytics tracking.">
          <Switch
            checked={prefs.analyticsOptOut}
            onCheckedChange={(v) => updatePref("analyticsOptOut", v)}
          />
        </Row>
        <Separator />
        <Row label="Export my data" hint="Download a copy of your activity.">
          <Button variant="outline" size="sm" onClick={() => toast.message("Export queued — you'll receive an email.")}>
            Request export
          </Button>
        </Row>
      </Card>

      {/* Help & Support */}
      <Card className="p-6 space-y-1">
        <SectionHeader
          icon={LifeBuoy}
          title="Help & support"
          description="Get assistance from the Grepsys AI team."
        />
        <Row label="Documentation" hint="Browse platform guides and references.">
          <Button asChild variant="outline" size="sm">
            <a href="/docs">Open</a>
          </Button>
        </Row>
        <Separator />
        <Row label="Contact support" hint="Reach the Grepsys AI support team.">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (window.location.href = "mailto:support@grepsys.com")}
          >
            Email us
          </Button>
        </Row>
        <Separator />
        <Row label="App version" hint="You are on the latest release.">
          <Badge variant="secondary">v1.4.0</Badge>
        </Row>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
