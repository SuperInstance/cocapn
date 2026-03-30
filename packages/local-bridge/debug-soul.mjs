import { SoulCompiler } from "./src/personality/soul-compiler.js";
const compiler = new SoulCompiler();

const soulMd = [
  '---',
  'name: Fishing Buddy',
  'version: 1.2',
  'tone: friendly',
  '---',
  '',
  '# Identity',
  'You are Fishing Buddy.',
  '',
  '## What You Know',
  '- Fishing rules',
  '',
  '## What You Don\'t Do',
  '- Never give medical advice',
  '',
  '## Public Face (shown to external users)',
  'You are a helpful fishing assistant.',
  '',
  '## Greeting',
  'Hey there!',
].join('\n');

const compiled = compiler.compile(soulMd);
console.log("=== PUBLIC PROMPT ===");
console.log(compiled.publicSystemPrompt);
console.log("=== END ===");
console.log("Contains 'Never give':", compiled.publicSystemPrompt.includes("Never give"));
