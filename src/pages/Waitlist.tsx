import { useEffect, useState } from "react";
import { Film, PartyPopper, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";

export default function Waitlist() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [fired, setFired] = useState(false);

  useEffect(() => {
    if (user?.email) {
      (supabase.from as any)("waitlist_signups")
        .upsert({ email: user.email, user_id: user.id }, { onConflict: "email" })
        .then(() => {});
    }
  }, [user]);

  useEffect(() => {
    if (!fired) {
      setFired(true);
      const end = Date.now() + 2500;
      const frame = () => {
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors: ["#3b82f6", "#8b5cf6", "#06b6d4"] });
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors: ["#3b82f6", "#8b5cf6", "#06b6d4"] });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
  }, [fired]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Glow orbs */}
      <div className="absolute top-1/3 -left-24 w-80 h-80 rounded-full opacity-20 blur-[100px] animate-pulse-glow" style={{ background: "hsl(263 70% 50%)" }} />
      <div className="absolute bottom-1/3 -right-24 w-72 h-72 rounded-full opacity-15 blur-[90px] animate-pulse-glow" style={{ background: "hsl(217 91% 60%)", animationDelay: "1s" }} />

      <div className="w-full max-w-md mx-auto p-10 rounded-2xl border border-border/20 glass-panel-elevated relative z-10 text-center">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-primary/15 flex items-center justify-center glow-blue">
            <Film className="h-7 w-7 text-primary" />
          </div>
        </div>

        {/* Confetti icon */}
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-accent/15 flex items-center justify-center">
            <PartyPopper className="h-8 w-8 text-accent" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">
          You're on the Waitlist!
        </h1>

        <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto leading-relaxed">
          Thanks for your interest in <span className="text-foreground font-medium">StoryBreak AI</span>! We're currently in private beta.
        </p>

        <div className="rounded-xl border border-border/20 p-4 mb-6" style={{ backgroundColor: "hsl(217 30% 8%)" }}>
          <div className="flex items-center gap-3 justify-center mb-2">
            <Mail className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Signed up as</span>
          </div>
          <p className="text-sm text-muted-foreground">{user?.email ?? "—"}</p>
        </div>

        <p className="text-xs text-muted-foreground/60 mb-6">
          We'll contact you at this email when StoryBreak AI opens for public access. Stay tuned! 🎬
        </p>

        <Button
          onClick={handleSignOut}
          variant="outline"
          className="w-full h-11 rounded-xl border-border/20 text-muted-foreground hover:text-foreground font-medium text-sm"
        >
          Sign Out
        </Button>

        <p className="text-[11px] text-muted-foreground/40 text-center mt-6">
          © 2026{" "}
          <a href="https://AdvancedAI.ai" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors underline underline-offset-2">
            AdvancedAI.ai
          </a>
        </p>
      </div>
    </div>
  );
}
