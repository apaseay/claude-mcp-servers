# personal-tools-mcp

A collection of personal Model Context Protocol (MCP) servers built with TypeScript, connecting Claude Desktop to real-world tools and APIs. Designed as a modular, extensible framework where each MCP server follows the same structure and can be added independently.

---

## Repository Structure

```
personal-tools-mcp/
├── personal-tools/         # Core MCP server — weather, GitHub, news, DNS, Okta, IP, password tools
│   ├── src/
│   │   └── index.ts
│   ├── dist/
│   ├── package.json
│   └── tsconfig.json
└── .gitignore
```

Additional MCP servers (Jira, SentinelOne, etc.) will be added as separate top-level directories following the same pattern.

---

## Available Servers

### [`personal-tools`](./personal-tools)

A general-purpose MCP server exposing the following tools to Claude Desktop:

| Tool | Description |
|------|-------------|
| `get_weather` | Current weather for any city |
| `get_github_repos` | List public repositories for any GitHub username |
| `get_news_headlines` | Latest headlines from BBC, Hacker News, TechCrunch, Guardian, and more |
| `lookup_ip` | Geolocation and ISP info for any public IP address |
| `dns_lookup` | A, MX, and TXT records for any domain |
| `generate_password` | Cryptographically secure random password generation |
| `get_okta_user` | Look up an Okta user by email |
| `check_okta_mfa` | Check MFA enrollment status for an Okta user |
| `list_okta_inactive_users` | Find active Okta users inactive for N days |

See the [personal-tools README](./personal-tools/README.md) for full setup and usage instructions.

---

## Requirements

- Node.js 18 or higher
- npm
- Claude Desktop

---

## Getting Started

Clone the repository and navigate into the server you want to set up:

```bash
git clone https://github.com/apaseay/personal-tools-mcp.git
cd personal-tools-mcp/personal-tools
npm install
npm run build
```

Then register the server in your Claude Desktop config file at:

```
~/Library/Application Support/Claude/claude_desktop_config.json
```

---

## Author

**Ayobami Pase**
IT Systems Engineer | Cloud Engineering Portfolio
[GitHub](https://github.com/apaseay) · [apase1.com](https://apase1.com)
