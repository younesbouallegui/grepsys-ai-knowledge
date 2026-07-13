import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import "@/i18n";

import Dashboard from "./pages/Dashboard";
import Documentation from "./pages/Documentation";
import DocumentView from "./pages/DocumentView";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import AuthSso from "./pages/AuthSso";
import SsoDiagnostics from "./pages/SsoDiagnostics";
import Quizzes from "./pages/Quizzes";
import QuizTake from "./pages/QuizTake";
import Skills from "./pages/Skills";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/sso" element={<AuthSso />} />
              <Route path="/admin/sso" element={<AppLayout><SsoDiagnostics /></AppLayout>} />
              <Route path="/" element={<AppLayout><Dashboard /></AppLayout>} />
              <Route path="/ask" element={<AppLayout><Dashboard /></AppLayout>} />
              <Route path="/docs" element={<AppLayout><Documentation /></AppLayout>} />
              <Route path="/docs/:slug" element={<AppLayout><DocumentView /></AppLayout>} />
              <Route path="/quizzes" element={<AppLayout><Quizzes /></AppLayout>} />
              <Route path="/quizzes/:id" element={<AppLayout><QuizTake /></AppLayout>} />
              <Route path="/skills" element={<AppLayout><Skills /></AppLayout>} />
              <Route path="/admin" element={<AppLayout><Admin /></AppLayout>} />
              <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
