import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Film, Loader2, Sparkles, BarChart3, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Sparkles, label: "AI-powered video analysis" },
  { icon: Scissors, label: "Smart ad break detection" },
  { icon: BarChart3, label: "Instant storyboards & ROI" },
];

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate("/", { replace: true });
      }
      setChecking(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/", { replace: true });
      }
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) {
      console.error("Google sign-in error:", error);
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Animated glow orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-20 blur-[120px] animate-pulse-glow" style={{ background: "hsl(217 91% 60%)" }} />
      <div className="absolute bottom-1/4 -right-32 w-80 h-80 rounded-full opacity-15 blur-[100px] animate-pulse-glow" style={{ background: "hsl(263 70% 50%)", animationDelay: "1s" }} />

      <div className="w-full max-w-md mx-auto p-10 rounded-2xl border border-border/20 glass-panel-elevated relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <div className="h-16 w-16 rounded-2xl bg-primary/15 flex items-center justify-center glow-blue">
            <Film className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground leading-none">
              Story<span className="text-primary">Break</span>
              <span className="text-muted-foreground font-normal ml-1.5">AI</span>
            </h1>
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase mt-1.5" style={{ color: "hsl(187 92% 50%)" }}>
              POWERED BY MOVIEMACHINE.AI
            </p>
          </div>
          <p className="text-sm text-muted-foreground text-center mt-2 max-w-xs">
            Analyze your video content with AI-driven story intelligence
          </p>
        </div>

        {/* Google Sign In */}
        <Button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full h-12 gap-3 rounded-xl bg-foreground/95 text-background hover:bg-foreground font-medium text-sm btn-hover"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          )}
          Continue with Google
        </Button>

        {/* Feature highlights */}
        <div className="mt-8 space-y-3">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 text-muted-foreground">
              <div className="h-8 w-8 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <span className="text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground/40 text-center mt-8">
          © 2026{" "}
          <a href="https://AdvancedAI.ai" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors underline underline-offset-2">
            AdvancedAI.ai
          </a>
        </p>
      </div>
    </div>
  );
}
