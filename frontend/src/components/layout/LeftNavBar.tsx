// src/components/layout/LeftNavBar.tsx
import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  LineChart,
  ShoppingBag,
  Megaphone,
  Factory,
  Boxes,
  Plus,
  HelpCircle,
} from "lucide-react";
import { buildQuery } from "@/lib/timeframe";

// Selected state: switch back to solid fill with a lighter primary background;
// use primary color for text for a more harmonious look
const itemCx = ({ isActive }: { isActive: boolean }) =>
  [
    "group flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
    isActive ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-foreground",
  ].join(" ");

const LeftNavBar: React.FC = () => {
  const q = buildQuery(); // preserve global timeframe in links
  return (
    <aside className="w-56 shrink-0 border-r bg-background px-3 py-4 hidden md:flex md:flex-col">
      {/* Brand: sized relative to the 32px dot; 17px font pairs nicely */}
      <div className="flex items-center gap-3 px-2 py-3.5">
        <span className="h-8 w-8 rounded-full bg-gradient-to-br from-fuchsia-500 via-purple-500 to-blue-500" />
        <span className="text-[17px] font-medium tracking-tight leading-none antialiased">E L E A D E R</span>
      </div>

      {/* Nav: even vertical rhythm */}
      <nav className="mt-4 flex flex-1 flex-col gap-3">
        <NavLink to="/dashboard" className={itemCx}>
          <LayoutDashboard className="h-4 w-4 opacity-90 group-hover:opacity-100" />
          Dashboard
        </NavLink>
        <NavLink to={`/finance${q}`} className={itemCx}>
          <LineChart className="h-4 w-4 opacity-90 group-hover:opacity-100" />
          Finance
        </NavLink>
        <NavLink to="/sales" className={itemCx}>
          <ShoppingBag className="h-4 w-4 opacity-90 group-hover:opacity-100" />
          Sales
        </NavLink>
        <NavLink to="/marketing" className={itemCx}>
          <Megaphone className="h-4 w-4 opacity-90 group-hover:opacity-100" />
          Marketing
        </NavLink>
        <NavLink to="/supply" className={itemCx}>
          <Boxes className="h-4 w-4 opacity-90 group-hover:opacity-100" />
          Supply
        </NavLink>
        <NavLink to="/manufacturing" className={itemCx}>
          <Factory className="h-4 w-4 opacity-90 group-hover:opacity-100" />
          Manufacturing
        </NavLink>
      </nav>

      {/* Extras: pinned to the bottom */}
      <div className="mt-auto pt-6 flex flex-col gap-3">
        <NavLink to="/modules/new" className={itemCx}>
          <Plus className="h-4 w-4 opacity-90 group-hover:opacity-100" />
          New Module
        </NavLink>
        <NavLink to="/help" className={itemCx}>
          <HelpCircle className="h-4 w-4 opacity-90 group-hover:opacity-100" />
          Need help?
        </NavLink>
      </div>
    </aside>
  );
};

export default LeftNavBar;
