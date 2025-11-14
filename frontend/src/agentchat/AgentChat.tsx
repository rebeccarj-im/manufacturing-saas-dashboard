// frontend/src/agentchat/AgentChat.tsx
import React from "react";
import { MessageCircle, X, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type KpiItem = { key: string; label?: string; value?: number; unit?: string; delta?: number; direction?: "up"|"down"|"flat" };
type RevenuePoint = { period: string; recognized?: number; booked?: number; backlog?: number };
type Timeframe = { range?: "6m"|"12m"; granularity?: "month"|"quarter"; start_date?: string; end_date?: string };

type DashboardPayload = {
  timeframe?: Timeframe;
  executiveKpis?: KpiItem[];
  revenueTrend?: RevenuePoint[];
  alerts?: any[];
  risks?: any[];
};

type Msg = { role: "user" | "assistant"; content: string };

const AgentChat: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [messages, setMessages] = React.useState<Msg[]>([
    { role: "assistant", content: "Hi! Ask me about trends, risks, or why a KPI moved. I use the current dashboard as context." },
  ]);
  const [dashData, setDashData] = React.useState<DashboardPayload | null>(null);
  const [dashLoading, setDashLoading] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open || dashData || dashLoading) return;
    setDashLoading(true);
    fetch("/api/executive-dashboard")
      .then(r => r.json())
      .then(json => setDashData(json))
      .catch(() => setDashData(null))
      .finally(() => setDashLoading(false));
  }, [open, dashData, dashLoading]);

  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function handleSend() {
    const q = input.trim();
    if (!q) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: q }]);
    setLoading(true);

    const started = performance.now();
    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "auto", question: q, data: dashData }),
      });
      if (!res.ok) throw new Error(await res.text().catch(()=>`HTTP ${res.status}`));
      const json = await res.json();

      const blocks: string[] = [];
      if (json.summary) blocks.push(json.summary);
      if (json.highlights?.length) blocks.push(`Highlights: ${json.highlights.join(" | ")}`);
      if (json.cautions?.length) blocks.push(`Cautions: ${json.cautions.join(" | ")}`);
      if (json.actions?.length) blocks.push(`Next Actions: ${json.actions.join(" | ")}`);
      const content = blocks.length ? blocks.join("\n\n") : "No insights available.";

      setMessages(prev => [...prev, { role: "assistant", content }]);

      // RUM (optional)
      const latency = Math.round(performance.now() - started);
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: "drilldown", meta: { ai_latency_ms: latency } }),
      }).catch(()=>{});

    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Sorry, I couldn't answer that. ${e?.message ? `(${e.message})` : ""}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-30">
      {!open && (
        <Button className="pointer-events-auto rounded-full shadow-lg" size="lg" onClick={() => setOpen(true)}>
          <MessageCircle className="mr-2 h-5 w-5" /> Ask AI
        </Button>
      )}

      {open && (
        <Card className="pointer-events-auto w-[360px] max-w-[90vw] overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between border-b p-3">
            <div className="font-medium">AI Assistant</div>
            <button className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={listRef} className="h-72 overflow-y-auto p-3 space-y-2">
            {dashLoading && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard context…
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`whitespace-pre-wrap text-sm leading-6 px-3 py-2 rounded-2xl max-w-[85%] ${m.role==="user" ? "bg-slate-200" : "bg-slate-100"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            )}
          </div>

          <div className="border-t p-3">
            <div className="flex items-center gap-2">
              <input
                className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="e.g., Why did backlog move last month?"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !loading) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <Button size="sm" className="shrink-0" onClick={handleSend} disabled={loading || !input.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
              </Button>
            </div>
            {!dashData && !dashLoading && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                * Running with limited context. Open the dashboard first for richer answers.
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

export default AgentChat;
