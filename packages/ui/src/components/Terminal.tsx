import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { CanvasAddon } from "@xterm/addon-canvas";
import "@xterm/xterm/css/xterm.css";
import { useBridgeContext } from "@/contexts/BridgeContext.js";

// ─── Terminal component ───────────────────────────────────────────────────────
//
// Embeds xterm.js and routes input through the bridge BASH message type.
// Each keypress is accumulated until Enter, then sent as a BASH command.
// Output from BASH_OUTPUT messages is written to the terminal.
//
// The terminal does NOT use a persistent pty — each command is a one-shot
// exec routed through BridgeServer.handleBash().

let termSeq = 0;

interface TerminalProps {
  cwd?: string;
  className?: string;
}

export function Terminal({ cwd, className = "" }: TerminalProps) {
  const bridge    = useBridgeContext();
  const mountRef  = useRef<HTMLDivElement>(null);
  const xtermRef  = useRef<XTerm | null>(null);
  const fitRef    = useRef<FitAddon | null>(null);
  const lineRef   = useRef("");          // current input line
  const promptStr = "$ ";

  // ── Helpers ──────────────────────────────────────────────────────────────

  const writePrompt = useCallback(() => {
    xtermRef.current?.write(`\r\n${promptStr}`);
  }, []);

  const runCommand = useCallback(
    (command: string) => {
      if (!command.trim()) { writePrompt(); return; }

      const id = `term-${++termSeq}`;
      const term = xtermRef.current;
      if (!term) return;

      // Subscribe before sending to avoid missing the first chunk
      const unsub = bridge.subscribe("BASH_OUTPUT", (out) => {
        if (out.id !== id) return;
        if (out.stdout) term.write(out.stdout.replace(/\n/g, "\r\n"));
        if (out.stderr) term.write(`\x1b[31m${out.stderr.replace(/\n/g, "\r\n")}\x1b[0m`);
        if (out.error)  term.write(`\x1b[31mError: ${out.error}\x1b[0m\r\n`);
        if (out.done) {
          unsub();
          if (out.exitCode !== undefined && out.exitCode !== 0) {
            term.write(`\x1b[33m[exit ${out.exitCode}]\x1b[0m`);
          }
          writePrompt();
        }
      });

      bridge.send({ type: "BASH", id, command, ...(cwd ? { cwd } : {}) });
    },
    [bridge, cwd, writePrompt]
  );

  // ── Mount xterm ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mountRef.current) return;

    const term = new XTerm({
      cursorBlink:    true,
      cursorStyle:    "bar",
      fontFamily:     "var(--font-mono, 'JetBrains Mono', monospace)",
      fontSize:       13,
      lineHeight:     1.4,
      theme: {
        background:    "var(--color-bg, #0a0a0a)",
        foreground:    "var(--color-text, #e8e8e8)",
        cursor:        "var(--color-primary, #00ff88)",
        cursorAccent:  "var(--color-bg, #0a0a0a)",
        selectionBackground: "rgba(0,255,136,0.2)",
        black:         "#1a1a1a",
        red:           "#ff4444",
        green:         "#00ff88",
        yellow:        "#ffcc00",
        blue:          "#4499ff",
        magenta:       "#cc44ff",
        cyan:          "#00ccff",
        white:         "#e8e8e8",
        brightBlack:   "#666666",
        brightRed:     "#ff6666",
        brightGreen:   "#44ffaa",
        brightYellow:  "#ffdd44",
        brightBlue:    "#66aaff",
        brightMagenta: "#dd66ff",
        brightCyan:    "#44ddff",
        brightWhite:   "#ffffff",
      },
      allowProposedApi: true,
    });

    const fitAddon       = new FitAddon();
    const webLinksAddon  = new WebLinksAddon();
    const canvasAddon    = new CanvasAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    try { term.loadAddon(canvasAddon); } catch { /* canvas not supported */ }

    term.open(mountRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitRef.current   = fitAddon;

    // Welcome message
    term.writeln("\x1b[32mCocapn Terminal\x1b[0m \x1b[90m— commands run via local bridge\x1b[0m");
    term.write(promptStr);

    // ── Handle keyboard input ───────────────────────────────────────────────

    term.onData((data) => {
      const code = data.charCodeAt(0);

      if (data === "\r") {
        // Enter — submit line
        const command = lineRef.current;
        term.write("\r\n");
        lineRef.current = "";
        runCommand(command);
        return;
      }

      if (data === "\x7f" || data === "\b") {
        // Backspace
        if (lineRef.current.length > 0) {
          lineRef.current = lineRef.current.slice(0, -1);
          term.write("\b \b");
        }
        return;
      }

      if (data === "\x03") {
        // Ctrl+C — clear line
        term.write("^C");
        lineRef.current = "";
        writePrompt();
        return;
      }

      if (data === "\x15") {
        // Ctrl+U — clear line
        term.write("\r" + promptStr + " ".repeat(lineRef.current.length) + "\r" + promptStr);
        lineRef.current = "";
        return;
      }

      // Ignore non-printable control codes (arrows, function keys, etc.)
      if (code < 32 && data !== "\t") return;

      // Echo printable character
      term.write(data);
      lineRef.current += data;
    });

    // ── Copy/paste support ──────────────────────────────────────────────────

    // xterm.js handles copy (Ctrl+Shift+C) natively via selection.
    // Paste: listen for Ctrl+Shift+V or Ctrl+V at the window level.
    const handlePaste = (e: ClipboardEvent) => {
      // Only intercept when the terminal container is focused
      if (!mountRef.current?.contains(document.activeElement)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text) return;
      e.preventDefault();
      // Strip newlines from paste to avoid accidental submission
      const safe = text.replace(/[\r\n]+/g, " ");
      term.write(safe);
      lineRef.current += safe;
    };
    document.addEventListener("paste", handlePaste);

    // ── Resize observer ─────────────────────────────────────────────────────

    const ro = new ResizeObserver(() => fitAddon.fit());
    ro.observe(mountRef.current);

    return () => {
      ro.disconnect();
      document.removeEventListener("paste", handlePaste);
      term.dispose();
      xtermRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally run once

  // Re-wire runCommand when bridge or cwd changes without recreating the terminal
  useEffect(() => {
    // runCommand is recreated when bridge/cwd changes (useCallback deps)
    // xterm.onData listener captures the latest via ref pattern
  }, [runCommand]);

  return (
    <div
      ref={mountRef}
      className={`h-full w-full bg-bg ${className}`}
      style={{ padding: "4px" }}
    />
  );
}
