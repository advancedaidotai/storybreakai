import { NavLink } from "@/components/NavLink";
import { Film, Home, Clapperboard, Target, Layers, Archive, Plus, HelpCircle, User } from "lucide-react";

const navItems = [
  { label: "Home", to: "/", icon: Home },
  { label: "Recent Clips", to: "/clips", icon: Clapperboard },
  { label: "Ad Intelligence", to: "/intelligence", icon: Target },
  { label: "Batches", to: "/batches", icon: Layers },
  { label: "Archived", to: "/archived", icon: Archive },
];

export function DashboardSidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[220px] flex flex-col z-40" style={{ backgroundColor: "hsl(216 40% 4%)" }}>
      {/* Logo */}
      <div className="px-5 pt-5 pb-6">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center">
            <Film className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-foreground leading-none">
              Story<span className="text-primary">Break</span>
              <span className="text-muted-foreground font-normal ml-1">AI</span>
            </h1>
            <p className="text-[9px] font-semibold tracking-[0.2em] uppercase mt-1" style={{ color: "hsl(187 92% 50%)" }}>
              PRO INTELLIGENCE
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className="flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium text-muted-foreground rounded-lg transition-all duration-200 hover:text-foreground hover:bg-surface-2/40 border-l-2 border-transparent"
            activeClassName="!text-foreground bg-surface-2/50 !border-l-2 !border-primary"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-2">
        <button
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-semibold text-primary-foreground transition-all duration-200 btn-hover"
          style={{ background: "linear-gradient(135deg, hsl(217 91% 55%), hsl(217 91% 45%))" }}
          onClick={() => window.location.href = "/"}
        >
          <Plus className="h-4 w-4" />
          New Analysis
        </button>
        <div className="space-y-0.5">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-surface-2/30">
            <HelpCircle className="h-3.5 w-3.5" />
            Support
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-surface-2/30">
            <User className="h-3.5 w-3.5" />
            Account
          </button>
        </div>
      </div>
    </aside>
  );
}
