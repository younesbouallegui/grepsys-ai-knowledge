import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { BookOpen, Sparkles, Settings, GraduationCap, ClipboardCheck, ShieldCheck, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/grepsys-logo.png";

export function AppSidebar() {
  const { t } = useTranslation();
  const { state } = useSidebar();
  const { isAdmin, user, signOut } = useAuth();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const [displayName, setDisplayName] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
      });
  }, [user]);

  const items = [
    { title: t("nav.ask"), url: "/", icon: Sparkles },
    { title: t("nav.documentation"), url: "/docs", icon: BookOpen },
    { title: t("nav.quizzes"), url: "/quizzes", icon: ClipboardCheck },
    { title: t("nav.skills"), url: "/skills", icon: GraduationCap },
    ...(isAdmin ? [{ title: t("nav.admin"), url: "/admin", icon: ShieldCheck }] : []),
    { title: t("nav.settings"), url: "/settings", icon: Settings },
  ];

  const isActive = (url: string) =>
    url === "/" ? location.pathname === "/" || location.pathname === "/ask" : location.pathname.startsWith(url);

  const name = displayName || user?.email?.split("@")[0] || "User";
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className={collapsed ? "px-2 py-4" : "px-3 py-4"}>
        <div className={`flex items-center overflow-hidden ${collapsed ? "justify-center" : "gap-2.5"}`}>
          <img
            src={logo}
            alt="Grepsys"
            className={`rounded shrink-0 ${collapsed ? "h-10 w-10" : "h-8 w-8"}`}
          />
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-tight font-display truncate">Grepsys AI</div>
              <div className="text-[11px] text-muted-foreground truncate">Knowledge Platform</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <NavLink to={item.url} end={item.url === "/"}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        {collapsed ? (
          <div className="flex justify-center py-1">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent transition-colors">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {isAdmin ? "Admin" : user?.email}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={signOut}
              aria-label={t("common.signOut")}
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
