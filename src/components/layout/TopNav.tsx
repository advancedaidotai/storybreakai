import { Film } from "lucide-react";

export function TopNav() {
  return (
    <header className="h-14 border-b border-border/20 flex items-center px-6 sticky top-0 z-30" style={{ backgroundColor: "hsl(216 40% 4%)" }}>
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
            POWERED BY MINEYOURMEDIA
          </p>
        </div>
      </a>
    </header>
  );
}
