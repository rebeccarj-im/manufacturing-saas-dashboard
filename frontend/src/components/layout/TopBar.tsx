import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Search, MessageSquare, Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { search, SearchResult } from "@/services/search";
import { getMessages, getUnreadCount, markAllRead, Message } from "@/services/messages";
import { getCurrentUser, UserProfile } from "@/services/users";

interface TopBarProps {
  onSearch?: (results: SearchResult[], query?: string) => void;
  onOpenMessages?: () => void;
  onOpenProfile?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onSearch, onOpenMessages, onOpenProfile }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState("");
  const [dark, setDark] = useState<boolean>(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Clear search input when route changes
  useEffect(() => {
    setQ("");
    setSearchResults([]);
    setShowSearchResults(false);
  }, [location.pathname]);

  // Load unread count and recent messages
  useEffect(() => {
    loadUnreadCount();
    loadRecentMessages();
    loadUserProfile();
  }, []);

  const loadUnreadCount = async () => {
    try {
      const result = await getUnreadCount();
      setUnreadCount(result.count);
    } catch (error) {
      console.error("Failed to load unread count:", error);
    }
  };

  const loadRecentMessages = async () => {
    try {
      // Only load unread messages for the dropdown
      const messages = await getMessages({ archived: false, read: false, limit: 5 });
      setRecentMessages(messages);
    } catch (error) {
      console.error("Failed to load recent messages:", error);
    }
  };

  const loadUserProfile = async () => {
    try {
      const profile = await getCurrentUser();
      setUserProfile(profile);
    } catch (error) {
      console.error("Failed to load user profile:", error);
    }
  };

  const runSearch = async (keywords?: string) => {
    const searchQuery = (keywords || q).trim();
    if (!searchQuery) {
      setSearchResults([]);
      setShowSearchResults(false);
      onSearch?.([]);
      return;
    }

    setSearchLoading(true);
    try {
      const results = await search({ q: searchQuery, limit: 10 });
      setSearchResults(results);
      setShowSearchResults(true);
      onSearch?.(results, searchQuery);
    } catch (error) {
      console.error("Search failed:", error);
      setSearchResults([]);
      setShowSearchResults(false);
      onSearch?.([], searchQuery);
    } finally {
      setSearchLoading(false);
    }
  };

  // Debounced search on input change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (q.trim()) {
        runSearch(q);
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
        onSearch?.([], "");
      }
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.search-container')) {
        setShowSearchResults(false);
      }
    };

    if (showSearchResults) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showSearchResults]);

  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
      await loadUnreadCount();
      await loadRecentMessages();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 backdrop-blur px-3 md:px-4">
      {/* Left search box (magnifying glass icon embedded in the input) */}
      <div className="search-container flex items-center gap-2 px-2 py-1.5 relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShowSearchResults(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                runSearch();
              } else if (e.key === "Escape") {
                setShowSearchResults(false);
                setQ("");
              }
            }}
            onFocus={() => {
              if (searchResults.length > 0) {
                setShowSearchResults(true);
              }
            }}
            placeholder="Search pages, KPIs, modules…"
            className="h-8 w-48 md:w-72 pl-8 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <Button size="sm" variant="secondary" onClick={() => runSearch()} disabled={searchLoading}>
          {searchLoading ? "..." : "Go"}
        </Button>

        {/* Search results dropdown */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="absolute top-full left-2 mt-1 w-48 md:w-72 bg-background border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
            <div className="p-2">
              <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
                {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
              </div>
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  className="px-2 py-2 rounded hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => {
                    navigate(result.url);
                    setShowSearchResults(false);
                    setQ("");
                    onSearch?.([], "");
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{result.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0">
                          {result.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {result.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No results message */}
        {showSearchResults && !searchLoading && q.trim() && searchResults.length === 0 && (
          <div className="absolute top-full left-2 mt-1 w-48 md:w-72 bg-background border rounded-lg shadow-lg z-50 p-4 text-sm text-muted-foreground text-center">
            No results found
          </div>
        )}
      </div>

      {/* Right-side buttons: order is Theme toggle → Messages dropdown → Avatar dropdown */}
      <div className="ml-auto flex items-center gap-2">
        {/* Theme toggle */}
        <Button variant="outline" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Messages Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              aria-label="Messages menu" 
              className="relative !ring-0 !ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none focus-visible:outline-none border-border/50 [&[data-state=open]]:ring-0 [&[data-state=open]]:ring-offset-0 [&[data-state=open]]:outline-none"
              style={{ outline: 'none', boxShadow: 'none' }}
            >
              <MessageSquare className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center border-2 border-background shadow-sm">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-72 z-[60] bg-background shadow-lg pointer-events-auto will-change-[transform,opacity]"
          >
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Messages</span>
              {unreadCount > 0 && (
                <span className="text-xs font-semibold text-primary">{unreadCount} unread</span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {recentMessages.length > 0 ? (
              <>
                {recentMessages.map((msg) => {
                  const isUrgent = msg.priority === "urgent";
                  const isHigh = msg.priority === "high";
                  return (
                    <DropdownMenuItem
                      key={msg.id}
                      onSelect={() => {
                        navigate("/messages");
                        onOpenMessages?.();
                      }}
                      className={`py-2 ${isUrgent ? "bg-red-50 dark:bg-red-950/20 border-l-2 border-red-500" : ""}`}
                    >
                      <div className="flex items-start gap-2 w-full">
                        <div className={`h-2 w-2 rounded-full mt-1.5 flex-shrink-0 ${
                          isUrgent ? "bg-red-500" : isHigh ? "bg-orange-500" : "bg-primary"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <div className={`text-sm font-medium truncate ${
                              isUrgent ? "text-red-700 dark:text-red-400 font-semibold" : ""
                            }`}>
                              {msg.title}
                            </div>
                            {isUrgent && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-red-500 text-white font-semibold flex-shrink-0">
                                URGENT
                              </span>
                            )}
                          </div>
                          {msg.sender && (
                            <div className="text-xs text-muted-foreground truncate">{msg.sender}</div>
                          )}
                        </div>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
                {unreadCount > recentMessages.length && (
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground text-center py-1">
                    +{unreadCount - recentMessages.length} more
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            ) : (
              <DropdownMenuItem disabled className="text-sm text-muted-foreground">
                No unread messages
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => {
              navigate("/messages");
              onOpenMessages?.();
            }}>
              View All Messages
            </DropdownMenuItem>
            {unreadCount > 0 && (
              <DropdownMenuItem onSelect={handleMarkAllRead}>
                Mark all as read
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-full p-0 !ring-0 !ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none focus-visible:outline-none [&[data-state=open]]:ring-0 [&[data-state=open]]:ring-offset-0 [&[data-state=open]]:outline-none"
              style={{ outline: 'none', boxShadow: 'none' }}
              aria-label="Open profile menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={userProfile?.avatar_url || "/avatar.png"} alt={userProfile?.name || "User"} />
                <AvatarFallback>{userProfile?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-56 z-[60] bg-background shadow-lg pointer-events-auto will-change-[transform,opacity]"
          >
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{userProfile?.name || "User"}</span>
                <span className="text-xs text-muted-foreground font-normal">{userProfile?.email || ""}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => {
              navigate("/profile");
              onOpenProfile?.();
            }}>
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/settings")}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default TopBar;
