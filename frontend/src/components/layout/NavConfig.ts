import { LayoutDashboard, DollarSign, ShoppingCart, Megaphone, Truck, Factory } from "lucide-react";

export type NavItem = {
  label: string;
  to: string;
  icon: any; // lucide-react Icon type
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Finance", to: "/finance", icon: DollarSign },
  { label: "Sales", to: "/sales", icon: ShoppingCart },
  { label: "Marketing", to: "/marketing", icon: Megaphone },
  { label: "Supply", to: "/supply", icon: Truck },
  { label: "Manufacturing", to: "/manufacturing", icon: Factory },
];
