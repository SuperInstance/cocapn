import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { useBridgeContext } from "@/contexts/BridgeContext.js";
import type { ChatStream } from "@/types/bridge.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "user" | "agent" | "system";

interface ChatMessage {
  id: string;
  role: Role;
  agentId: string | undefined;
  content: string;
  streaming: boolean;
  error: string | undefined;
  createdAt: number;
}

// ─── Command palette ──────────────────────────────────────────────────────────

interface Command {
  trigger: string;
  description: string;
  agentId?: string;
}

const COMMANDS: Command[] = [
  { trigger: "/claude", description: "Send to Claude Code", agentId: "claude" },
  { trigger: "/pi",     description: "Send to Pi agent",    agentId: "pi" },
  { trigger: "/bash",   description: "Run a shell command" },
  { trigger: "/file",   description: "Edit a file in the repo" },
  { trigger: "/help",   description: "Show available commands" },
];

function parseCommand(input: string): {
  agentId?: string;
  content: string;
  mode: "chat" | "bash" | "file";
} {
  const trimmed = input.trim();
  if (trimmed.startsWith("/bash ")) {
    return { content: trimmed.slice(6), mode: "bash" };
  }
  if (trimmed.startsWith("/file ")) {
    return { content: trimmed.slice(6), mode: "file" };
  }
  for (const cmd of COMMANDS) {
    if (cmd.agentId && trimmed.startsWith(cmd.trigger + " ")) {
      return { agentId: cmd.agentId, content: trimmed.slice(cmd.trigger.length + 1), mode: "chat" };
    }
  }
  return { content: trimmed, mode: "chat" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={[
          "max-w-[80%] rounded-skin px-3 py-2 text-sm whitespace-pre-wrap break-words",
          isUser
            ? "bg-primary/15 text-text border border-primary/30"
            : msg.role === "system"
            ? "bg-surface-2 text-text-muted italic text-xs"
            : "bg-surface text-text border border-border",
        ].join(" ")}
      >
        {msg.agentId && !isUser && (
          <div className="text-[10px] text-primary font-mono mb-1 opacity-70">
            {msg.agentId}
          </div>
        )}
        {msg.error ? (
          <span className="text-danger">{msg.error}</span>
        ) : (
          <>
            {msg.content}
            {msg.streaming && (
              <span className="inline-block w-1.5 h-3.5 bg-primary ml-0.5 animate-pulse align-text-bottom" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CommandPalette({
  input,
  onSelect,
}: {
  input: string;
  onSelect: (cmd: Command) => void;
}) {
  if (!input.startsWith("/")) return null;
  const lower = input.toLowerCase();
  const matches = COMMANDS.filter((c) => c.trigger.startsWith(lower));
  if (!matches.length) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface border border-border rounded-skin shadow-lg overflow-hidden z-10">
      {matches.map((cmd) => (
        <button
          key={cmd.trigger}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd); }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2 transition-colors text-left"
        >
          <span className="font-mono text-primary">{cmd.trigger}</span>
          <span className="text-text-muted">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}

// ─── File attachment ──────────────────────────────────────────────────────────

function FileAttachButton({ onAttach }: { onAttach: (path: string, content: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onAttach(file.name, reader.result as string);
    };
    reader.readAsText(file);
    // Reset so the same file can be re-attached
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
        accept="text/*,.md,.json,.yml,.yaml,.ts,.tsx,.js,.jsx,.py,.sh"
      />
      <button
        onClick={() => inputRef.current?.click()}
        title="Attach file (sends FILE_EDIT)"
        className="p-2 text-text-muted hover:text-primary transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
        </svg>
      </button>
    </>
  );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

let msgSeq = 0;
function nextId() { return `msg-${++msgSeq}`; }

interface ChatPanelProps {
  defaultAgentId?: string;
  className?: string;
}

export function ChatPanel({ defaultAgentId = "claude", className = "" }: ChatPanelProps) {
  const bridge = useBridgeContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input,    setInput]    = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Scroll to bottom on new messages ───────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Subscribe to CHAT_STREAM ───────────────────────────────────────────────

  useEffect(() => {
    return bridge.subscribe("CHAT_STREAM", (msg: ChatStream) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msg.id);
        if (idx === -1) {
          // New streaming message from agent
          const newMsg: ChatMessage = {
            id:        msg.id,
            role:      "agent",
            agentId:   undefined,
            content:   msg.chunk,
            streaming: !msg.done,
            error:     msg.error,
            createdAt: Date.now(),
          };
          return [...prev, newMsg];
        }
        // Update existing streaming message
        const updated = [...prev];
        const existing = updated[idx];
        if (!existing) return prev;
        updated[idx] = {
          ...existing,
          content:   existing.content + msg.chunk,
          streaming: !msg.done,
          error:     msg.error,
        };
        return updated;
      });
    });
  }, [bridge]);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");

    const { agentId, content, mode } = parseCommand(text);

    if (mode === "bash") {
      const id = nextId();
      setMessages((prev) => [
        ...prev,
        { id, role: "user", agentId: undefined, content: `$ ${content}`,
          streaming: false, error: undefined, createdAt: Date.now() },
        { id: `${id}-out`, role: "agent", agentId: "bash",
          content: "", streaming: true, error: undefined, createdAt: Date.now() },
      ]);
      // Subscribe to BASH_OUTPUT for this request before sending
      const unsub = bridge.subscribe("BASH_OUTPUT", (out) => {
        if (out.id !== id) return;
        const chunk = (out.stdout ?? "") + (out.stderr ? `\x1b[31m${out.stderr}\x1b[0m` : "");
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === `${id}-out`);
          if (idx === -1) return prev;
          const updated = [...prev];
          const existing = updated[idx];
          if (!existing) return prev;
          updated[idx] = {
            ...existing,
            content:   existing.content + chunk,
            streaming: !out.done,
          };
          return updated;
        });
        if (out.done) unsub();
      });
      bridge.send({ type: "BASH", id, command: content });
      return;
    }

    if (mode === "file") {
      // /file <path> <content> — prompt user for content via a future dialog
      // For now, treat as a user message
    }

    // CHAT
    const id = nextId();
    setMessages((prev) => [
      ...prev,
      { id, role: "user", agentId: undefined, content,
        streaming: false, error: undefined, createdAt: Date.now() },
    ]);
    bridge.send({
      type:    "CHAT",
      id,
      content,
      agentId: agentId ?? defaultAgentId,
    });
  }, [input, bridge, defaultAgentId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit]
  );

  const handleAttach = useCallback(
    (path: string, content: string) => {
      const id = nextId();
      setMessages((prev) => [
        ...prev,
        { id, role: "system", agentId: undefined,
          content: `Attaching file: ${path}`,
          streaming: false, error: undefined, createdAt: Date.now() },
      ]);
      bridge.send({ type: "FILE_EDIT", id, path, content });
    },
    [bridge]
  );

  const handleCommandSelect = useCallback((cmd: Command) => {
    setInput(cmd.trigger + " ");
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            <div className="text-center">
              <div className="text-2xl mb-2 opacity-30">◉</div>
              <p>Start a conversation</p>
              <p className="text-xs mt-1 opacity-60">
                Type <code className="font-mono text-primary">/claude</code>,{" "}
                <code className="font-mono text-primary">/pi</code>, or{" "}
                <code className="font-mono text-primary">/bash</code>
              </p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border px-3 py-2">
        <div className="relative flex items-end gap-2">
          <CommandPalette input={input} onSelect={handleCommandSelect} />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message… (Shift+Enter for newline, / for commands)"
            rows={1}
            className={[
              "flex-1 bg-surface-2 border border-border rounded-skin px-3 py-2",
              "text-sm text-text placeholder:text-text-muted resize-none",
              "focus:outline-none focus:border-primary/60 transition-colors",
              "min-h-[2.25rem] max-h-40 overflow-y-auto",
            ].join(" ")}
            style={{ height: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
          />
          <FileAttachButton onAttach={handleAttach} />
          <button
            onClick={submit}
            disabled={!input.trim()}
            className={[
              "p-2 rounded-skin transition-colors",
              input.trim()
                ? "text-primary hover:bg-primary/10"
                : "text-border cursor-not-allowed",
            ].join(" ")}
            title="Send (Enter)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
        {bridge.queueLength > 0 && (
          <p className="text-xs text-text-muted mt-1">
            {bridge.queueLength} message{bridge.queueLength > 1 ? "s" : ""} queued (offline)
          </p>
        )}
      </div>
    </div>
  );
}
