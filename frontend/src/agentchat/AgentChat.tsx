import React from "react";
import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const AgentChat: React.FC = () => {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-30">
      {/* Float Button */}
      {!open && (
        <Button
          className="pointer-events-auto rounded-full shadow-lg"
          size="lg"
          onClick={() => setOpen(true)}
        >
          <MessageCircle className="mr-2 h-5 w-5" /> Ask AI
        </Button>
      )}

      {open && (
        <Card className="pointer-events-auto w-[360px] max-w-[90vw] overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between border-b p-3">
            <div className="font-medium">AI Assistant</div>
            <button className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>Close</button>
          </div>
          <div className="h-72 p-3 text-sm text-muted-foreground flex items-center justify-center">
            Coming soon…
          </div>
          <div className="border-t p-3">
            <input
              className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Type your question…"
            />
          </div>
        </Card>
      )}
    </div>
  );
};

export default AgentChat;
