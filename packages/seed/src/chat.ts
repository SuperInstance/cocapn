import { createInterface } from 'node:readline';
import type { DeepSeek, ChatMessage } from './llm.js';
import type { Memory } from './memory.js';

export async function chat(
  llm: DeepSeek, memory: Memory, systemPrompt: string, stream = true,
): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '\x1b[32m> \x1b[0m' });
  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }
    if (input === '/quit' || input === '/exit') { rl.close(); return; }
    if (input === '/whoami') { console.log(systemPrompt); rl.prompt(); continue; }

    memory.addMessage('user', input);
    const messages: ChatMessage[] = [
      { role: 'system', content: `${systemPrompt}\n\n${memory.formatFacts()}\n\n${memory.formatContext(20)}` },
      { role: 'user', content: input },
    ];

    let response = '';
    if (stream) {
      process.stdout.write('\x1b[1m');
      for await (const chunk of llm.chatStream(messages)) {
        if (chunk.type === 'content' && chunk.text) { process.stdout.write(chunk.text); response += chunk.text; }
        if (chunk.type === 'error' && chunk.error) { process.stdout.write(`\nError: ${chunk.error}`); }
      }
      process.stdout.write('\x1b[0m\n');
    } else {
      const res = await llm.chat(messages);
      console.log(res.content);
      response = res.content;
    }

    if (response) memory.addMessage('assistant', response);
    rl.prompt();
  }
}
