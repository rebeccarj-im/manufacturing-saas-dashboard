import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import LeftNavBar from "@/components/layout/LeftNavBar";
import TopBar from "@/components/layout/TopBar";
import AgentChat from "@/agentchat/AgentChat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Typography } from "@/components/ui/typography";
import { SearchResult } from "@/services/search";
import { Button } from "@/components/ui/button";

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const clearSearch = () => {
    setResults([]);
    setSearchQuery("");
  };

  // Clear search state when route changes
  useEffect(() => {
    clearSearch();
  }, [location.pathname]);

  const handleResultClick = (result: SearchResult) => {
    navigate(result.url);
    setResults([]); // Clear results after navigation
    setSearchQuery("");
  };

  const handleSearch = (searchResults: SearchResult[], query?: string) => {
    setResults(searchResults);
    if (query !== undefined) {
      setSearchQuery(query);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground relative">
      {/* Left sidebar navigation */}
      <LeftNavBar onNavigate={clearSearch} />

      {/* Right main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <TopBar onSearch={handleSearch} />

        {/* Page content area */}
        <main className="flex-1 w-full overflow-y-auto p-4 md:p-6">
          {/* Show search page when there are results or a search query */}
          {searchQuery.trim() || results.length > 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <div className="w-full max-w-3xl space-y-6">
                {/* Search query display */}
                <div className="text-center space-y-2">
                  <div className="text-4xl mb-4">🔍</div>
                  <Typography variant="h1" className="text-2xl font-bold">
                    Search Results
                  </Typography>
                  <p className="text-lg text-muted-foreground">
                    Searching for: <span className="font-semibold text-foreground">"{searchQuery}"</span>
                  </p>
                  {results.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Found {results.length} result{results.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>

                {/* Search results */}
                {results.length > 0 ? (
                  <div className="space-y-3">
                    {results.map((result) => (
                      <Card
                        key={result.id}
                        className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleResultClick(result)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Typography variant="h4" className="text-base font-semibold">
                                {result.title}
                              </Typography>
                              <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                                {result.type}
                              </span>
                              {result.category && (
                                <span className="text-xs text-muted-foreground">
                                  {result.category}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {result.description}
                            </p>
                          </div>
                          <Button variant="ghost" size="sm" className="ml-2">
                            Open →
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : searchQuery.trim() ? (
                  <Card className="p-12 text-center">
                    <CardContent>
                      <p className="text-muted-foreground">No results found for "{searchQuery}"</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Try different keywords or check your spelling
                      </p>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          ) : (
            /* Main content slot - only show when not searching */
            children
          )}
        </main>
      </div>

      {/* Bottom-right AI chat floating window */}
      <AgentChat />
    </div>
  );
};

export default MainLayout;
