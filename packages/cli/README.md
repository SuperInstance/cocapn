# cocapn (CLI)

The cocapn command-line interface — manage your agent runtime from the terminal.

## Install

```bash
npm install -g cocapn
```

## Commands

```bash
cocapn init [dir]           # Initialize cocapn in a repo
cocapn start                # Start the bridge
cocapn status               # Show bridge status
cocapn chat                 # Interactive chat mode
cocapn skill list           # List available skills
cocapn skill load <name>    # Load a skill
cocapn plugin search <q>    # Search plugin registry
cocapn plugin install <n>   # Install a plugin
cocapn personality list     # List built-in personalities
cocapn tokens               # Show token usage
cocapn health               # Health check
```

## Quick Start

```bash
git clone https://github.com/CedarBeach2019/cocapn.git
cd cocapn && npm install && npm run build
cd packages/cli
node bin/cocapn.js init ~/.cocapn
node bin/cocapn.js start
```

## License

MIT
