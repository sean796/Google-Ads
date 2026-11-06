import { TooltipProvider } from "@/ui";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";
import { HashAuthRedirect } from "@/components/LegacyHashRedirect";
import { TeamProvider } from "@/contexts/TeamProvider";
import { WordPressSitesProvider } from "@/hooks/use-wordpress-sites";
import { ActiveWordPressSiteProvider } from "@/contexts/ActiveWordPressSiteProvider";
import { SitesHydrate } from "@/components/integrations/SitesHydrate";
import MobileAppPage from "./pages/MobileAppPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const AppMobile = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WordPressSitesProvider>
          <ActiveWordPressSiteProvider>
            <SitesHydrate />
            <div className="mobile-app-root flex h-full min-h-0 w-full flex-col overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <BrowserRouter
                  basename={import.meta.env.BASE_URL}
                  future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
                >
                  <AuthProvider>
                    <TeamProvider>
                      <HashAuthRedirect />
                      <ErrorBoundary>
                        <Routes>
                          <Route
                            path="/login"
                            element={
                              <div className="flex h-dvh max-h-dvh min-h-0 flex-1 flex-col overflow-hidden">
                                <Login />
                              </div>
                            }
                          />
                          <Route
                            path="/register"
                            element={
                              <div className="flex h-dvh max-h-dvh min-h-0 flex-1 flex-col overflow-hidden">
                                <Register />
                              </div>
                            }
                          />
                          <Route
                            path="/"
                            element={
                              <ProtectedRoute>
                                <div className="flex h-dvh max-h-dvh min-h-0 flex-1 flex-col overflow-hidden">
                                  <MobileAppPage />
                                </div>
                              </ProtectedRoute>
                            }
                          />
                          <Route
                            path="*"
                            element={
                              <div className="flex h-dvh max-h-dvh min-h-0 flex-1 flex-col overflow-hidden">
                                <NotFound />
                              </div>
                            }
                          />
                        </Routes>
                      </ErrorBoundary>
                    </TeamProvider>
                  </AuthProvider>
                </BrowserRouter>
              </div>
            </div>
          </ActiveWordPressSiteProvider>
        </WordPressSitesProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default AppMobile;
