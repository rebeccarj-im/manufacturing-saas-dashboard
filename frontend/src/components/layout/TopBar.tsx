import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Search, MessageSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface TopBarProps {
  onSearch?: (results: string[]) => void;
  onOpenMessages?: () => void;
  onOpenProfile?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onSearch, onOpenMessages, onOpenProfile }) => {
  const [q, setQ] = useState("");
  const [dark, setDark] = useState<boolean>(false);

  const runSearch = () => {
    const keywords = q.trim();
    if (!keywords) {
      onSearch?.([]);
      return;
    }
    onSearch?.([
      `Result for: ${keywords} A`,
      `Result for: ${keywords} B`,
      `Result for: ${keywords} C`,
    ]);
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 backdrop-blur px-3 md:px-4">
      {/* Left search box (magnifying glass icon embedded in the input) */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search…"
            className="h-8 w-48 md:w-72 pl-8 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <Button size="sm" variant="secondary" onClick={runSearch}>Go</Button>
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
            <Button variant="outline" size="sm" aria-label="Messages menu">
              <MessageSquare className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-64 z-[60] bg-background shadow-lg pointer-events-auto will-change-[transform,opacity]"
          >
            <DropdownMenuLabel className="flex items-center justify-between">
              Messages <span className="text-xs opacity-60">Ctrl+M</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onOpenMessages?.()}>Open Inbox</DropdownMenuItem>
            <DropdownMenuItem>New Message</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Mark all as read</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-full p-0"
              aria-label="Open profile menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src="/avatar.png" alt="User" />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-56 z-[60] bg-background shadow-lg pointer-events-auto will-change-[transform,opacity]"
          >
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onOpenProfile?.()}>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default TopBar;
