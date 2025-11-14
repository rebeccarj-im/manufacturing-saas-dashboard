import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import ExecutiveDashboard from "@/pages/ExecutiveDashboard"; 
import FinanceOverview from "@/pages/finance/FinanceOverview";
import FinanceKpiDrilldown from "@/pages/finance/FinanceKpiDrilldown";
import SalesOverview from "@/pages/sales/SalesOverview";
import SalesKpiDrilldown from "@/pages/sales/SalesKpiDrilldown";
import SupplyOverview from "@/pages/supply/SupplyOverview";
import SupplyKpiDrilldown from "@/pages/supply/SupplyKpiDrilldown";
import ManufacturingOverview from "@/pages/manufacturing/ManufacturingOverview";
import ManufacturingKpiDrilldown from "@/pages/manufacturing/ManufacturingKpiDrilldown";
import MarketingOverview from "@/pages/marketing/MarketingOverview";
import MarketingKpiDrilldown from "@/pages/marketing/MarketingKpiDrilldown";
import CalendarDemo from "@/pages/CalendarDemo";
import Messages from "@/pages/Messages";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";

// Lightweight placeholder page to avoid sidebar clicks leading to 404
const Placeholder: React.FC<{ title: string }> = ({ title }) => (
  <div className="p-4">
    <h2 className="text-xl font-semibold">{title}</h2>
    <p className="text-sm text-muted-foreground mt-1">Coming soon…</p>
  </div>
);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route
        path="/dashboard"
        element={
          <MainLayout>
            <ExecutiveDashboard />
          </MainLayout>
        }
      />

      {/* Finance list page */}
      <Route
        path="/finance"
        element={
          <MainLayout>
            <FinanceOverview />
          </MainLayout>
        }
      />

      {/* Finance KPI drilldown */}
      <Route
        path="/finance/kpis/:key"
        element={
          <MainLayout>
            <FinanceKpiDrilldown />
          </MainLayout>
        }
      />

      <Route path="/sales" element={<MainLayout><SalesOverview /></MainLayout>} />
      <Route path="/sales/kpis/:key" element={<MainLayout><SalesKpiDrilldown /></MainLayout>} />
      
      <Route path="/marketing" element={<MainLayout><MarketingOverview /></MainLayout>} />
      <Route path="/marketing/kpis/:key" element={<MainLayout><MarketingKpiDrilldown /></MainLayout>} />
      
      <Route path="/supply" element={<MainLayout><SupplyOverview /></MainLayout>} />
      <Route path="/supply/kpis/:key" element={<MainLayout><SupplyKpiDrilldown /></MainLayout>} />
      
      <Route path="/manufacturing" element={<MainLayout><ManufacturingOverview /></MainLayout>} />
      <Route path="/manufacturing/kpis/:key" element={<MainLayout><ManufacturingKpiDrilldown /></MainLayout>} />
      
      <Route path="/calendar" element={<MainLayout><CalendarDemo /></MainLayout>} />
      
      <Route path="/messages" element={<MainLayout><Messages /></MainLayout>} />
      <Route path="/profile" element={<MainLayout><Profile /></MainLayout>} />
      <Route path="/settings" element={<MainLayout><Settings /></MainLayout>} />
    </Routes>
  );
}
