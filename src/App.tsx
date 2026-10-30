import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Register from "./pages/Register";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import HuddlePopupPage from "./pages/HuddlePopupPage";
import OrganicDashboardPage from "./pages/OrganicDashboardPage";
import OrganicClientReportPreviewPage from "./pages/OrganicClientReportPreviewPage";
import HostingManagerPage from "./pages/manager/HostingManagerPage";
import { WordPressSitesProvider } from "@/hooks/use-wordpress-sites";
import { SitesHydrate } from "@/components/integrations/SitesHydrate";
import { ActiveWordPressSiteProvider } from "@/contexts/active-wordpress-site-context";
import { HashAuthRedirect } from "@/components/HashAuthRedirect";
import { TeamProvider } from "@/contexts/TeamContext";
import { WordPressOptimizationProvider } from "@/contexts/wordpress-optimization-context";
import { AgentRunOptimizerScopeProvider } from "@/contexts/agent-run-optimizer-scope-context";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Global error handler for unhandled promise rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Promise Rejection]', event.reason);
    // Prevent default browser error handling
    event.preventDefault();
  });

  window.addEventListener('error', (event) => {
    console.error('[Global Error]', event.error);
  });
}

const App = () => {
  try {
    return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WordPressSitesProvider>
            <SitesHydrate />
            <ActiveWordPressSiteProvider>
              <WordPressOptimizationProvider>
                <AgentRunOptimizerScopeProvider>
          {/* Single column fills #root so nested routes can use flex-1 + min-h-0 + overflow */}
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
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
                        path="/huddle"
                        element={
                          <ProtectedRoute>
                            <div className="flex h-dvh max-h-dvh min-h-0 flex-1 flex-col overflow-hidden">
                              <HuddlePopupPage />
                            </div>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/"
                        element={
                          <ProtectedRoute>
                            <div className="flex h-dvh max-h-dvh min-h-0 flex-1 flex-col overflow-hidden">
                              <Index />
                            </div>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/sites/:siteId/organic/client-report"
                        element={
                          <div className="fixed inset-0 z-50 min-h-dvh overflow-auto bg-[#f4f4f5]">
                            <OrganicClientReportPreviewPage />
                          </div>
                        }
                      />
                      <Route
                        path="/sites/:siteId/organic"
                        element={
                          <ProtectedRoute>
                            <div className="flex h-dvh max-h-dvh min-h-0 flex-1 flex-col overflow-hidden">
                              <OrganicDashboardPage />
                            </div>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/manager/hosting"
                        element={
                          <ProtectedRoute>
                            <div className="flex h-dvh max-h-dvh min-h-0 flex-1 flex-col overflow-hidden">
                              <HostingManagerPage />
                            </div>
                          </ProtectedRoute>
                        }
                      />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
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
                </AgentRunOptimizerScopeProvider>
              </WordPressOptimizationProvider>
            </ActiveWordPressSiteProvider>
          </WordPressSitesProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
    );
  } catch (error) {
    throw error;
  }
};

export default App;
