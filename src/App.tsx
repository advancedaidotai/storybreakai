import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import Processing from "./pages/Processing";
import Results from "./pages/Results";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // Auth is optional for hackathon demo – guest access allowed
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<Index />} />
            <Route path="/processing" element={<Processing />} />
            <Route path="/processing/:projectId" element={<Processing />} />
            <Route path="/results" element={<Results />} />
            <Route path="/results/:projectId" element={<Results />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
