import { Film, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function TopNav() {
  const { user } = useAuth();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="h-14 border-b border-border/20 flex items-center justify-between px-6 sticky top-0 z-30" style={{ backgroundColor: "hsl(216 40% 4%)" }}>
      <a href="/" className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center">
          <Film className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-foreground leading-none">
            Story<span className="text-primary">Break</span>
            <span className="text-muted-foreground font-normal ml-1">AI</span>
          </h1>
          <p className="text-[9px] font-semibold tracking-[0.2em] uppercase" style={{ color: "hsl(187 92% 50%)" }}>
            POWERED BY MOVIEMACHINE.AI
          </p>
        </div>
      </a>

      {user && (
        <div className="flex items-center gap-3">
          <Avatar className="h-7 w-7">
            <AvatarImage src={user.user_metadata?.avatar_url} />
            <AvatarFallback className="text-[10px] bg-surface-2 text-muted-foreground">{initials}</AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground hidden sm:block max-w-[160px] truncate">
            {user.user_metadata?.full_name || user.email}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleSignOut}>
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </header>
  );
}
