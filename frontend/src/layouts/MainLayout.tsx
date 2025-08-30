import React, { useState } from "react";
import LeftNavBar from "@/components/layout/LeftNavBar";
import TopBar from "@/components/layout/TopBar";
import AgentChat from "@/agentchat/AgentChat";
import { Card } from "@/components/ui/card";
import { Typography } from "@/components/ui/typography";

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [results, setResults] = useState<string[]>([]);

  return (
    <div className="flex h-screen bg-background text-foreground relative">
      {/* Left sidebar navigation */}
      <LeftNavBar />

      {/* Right main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <TopBar onSearch={setResults} />

        {/* Page content area */}
        <main className="flex-1 w-full overflow-y-auto p-4 md:p-6">
          {/* Main content slot */}
          {children}

          {/* Search results panel */}
          {results.length > 0 && (
            <Card className="mt-8">
              <div className="flex items-center gap-2 p-6 pb-2">
                <span className="text-xl">🔍</span>
                <Typography variant="h4" className="text-primary">Search Results</Typography>
              </div>
              <div className="p-6 pt-2">
                <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
                  {results.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </Card>
          )}
        </main>
      </div>

      {/* Bottom-right AI chat floating window */}
      <AgentChat />
    </div>
  );
};

export default MainLayout;
