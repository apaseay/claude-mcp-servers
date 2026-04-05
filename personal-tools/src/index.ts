import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import RSSParser from 'rss-parser';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dns from 'dns/promises';
import * as crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const rssParser = new RSSParser();
const OKTA_ORG_URL = process.env.OKTA_ORG_URL;
const OKTA_API_TOKEN = process.env.OKTA_API_TOKEN;

async function oktaGet(endpoint: string): Promise<any> {
    if (!OKTA_ORG_URL || !OKTA_API_TOKEN) {
        throw new Error('Okta credentials not configured. Add OKTA_ORG_URL and OKTA_API_TOKEN to your .env file.');
    }
    const response = await fetch(`${OKTA_ORG_URL}/api/v1${endpoint}`, {
        headers: { 'Authorization': `SSWS ${OKTA_API_TOKEN}`, 'Accept': 'application/json' },
    });
    if (!response.ok) throw new Error(`Okta API error ${response.status}: ${await response.text()}`);
    return response.json();
}

function formatUser(user: any): string {
    const p = user.profile;
    const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('en-IE') : 'Never';
    return [
        `Name:       ${p.firstName} ${p.lastName}`,
        `Email:      ${p.email}`,
        `Status:     ${user.status}`,
        `Last Login: ${lastLogin}`,
        `Created:    ${new Date(user.created).toLocaleDateString('en-IE')}`,
    ].join('\n');
}

const server = new Server(
    { name: 'personal-tools', version: '3.0.0' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        // ── Personal tools ────────────────────────────────────────────────────────
        {
            name: 'get_weather',
            description: 'Get current weather for any city. Returns temperature, conditions, humidity, and wind.',
            inputSchema: { type: 'object', properties: { city: { type: 'string', description: 'City name' } }, required: ['city'] },
        },
        {
            name: 'get_github_repos',
            description: 'List public GitHub repositories for any username.',
            inputSchema: {
                type: 'object',
                properties: {
                    username: { type: 'string', description: 'GitHub username' },
                    limit: { type: 'number', description: 'Number to return (default 10, max 30)' },
                },
                required: ['username'],
            },
        },
        {
            name: 'get_news_headlines',
            description: 'Fetch headlines from RSS. Shortcuts: bbc, hn, techcrunch, guardian, rte. Or use a full RSS URL.',
            inputSchema: {
                type: 'object',
                properties: {
                    source: { type: 'string', description: 'Shortcut name or full RSS URL' },
                    limit: { type: 'number', description: 'Number of headlines (default 10)' },
                },
                required: ['source'],
            },
        },
        // ── Okta tools ───────────────────────────────────────────────────────────
        {
            name: 'get_okta_user',
            description: 'Look up an Okta user by email. Returns name, status, and last login.',
            inputSchema: { type: 'object', properties: { email: { type: 'string', description: 'Email address' } }, required: ['email'] },
        },
        {
            name: 'check_okta_mfa',
            description: 'Check whether an Okta user has MFA enrolled and which factors are registered.',
            inputSchema: { type: 'object', properties: { email: { type: 'string', description: 'Email address' } }, required: ['email'] },
        },
        {
            name: 'list_okta_inactive_users',
            description: 'Find active Okta users who have not logged in for N days.',
            inputSchema: {
                type: 'object',
                properties: {
                    days: { type: 'number', description: 'Days of inactivity' },
                    limit: { type: 'number', description: 'Max users to return (default 20)' },
                },
                required: ['days'],
            },
        },
        // ── Utility tools (no API key needed) ────────────────────────────────────
        {
            name: 'lookup_ip',
            description: 'Look up geolocation and ISP information for an IP address. Works with any public IPv4 or IPv6 address.',
            inputSchema: {
                type: 'object',
                properties: {
                    ip: { type: 'string', description: 'IP address to look up, e.g. 8.8.8.8' },
                },
                required: ['ip'],
            },
        },
        {
            name: 'dns_lookup',
            description: 'Look up DNS records for any domain. Returns A, MX, and TXT records. Useful for checking domain configuration.',
            inputSchema: {
                type: 'object',
                properties: {
                    domain: { type: 'string', description: 'Domain name, e.g. groupon.com or apase1.com' },
                },
                required: ['domain'],
            },
        },
        {
            name: 'generate_password',
            description: 'Generate a cryptographically secure random password.',
            inputSchema: {
                type: 'object',
                properties: {
                    length: { type: 'number', description: 'Password length (default 16, max 128)' },
                    include_symbols: { type: 'boolean', description: 'Include symbols like !@#$% (default true)' },
                },
                required: [],
            },
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        const args = request.params.arguments as Record<string, any>;

        switch (request.params.name) {

            case 'get_weather': {
                const city = args.city as string;
                const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { headers: { 'User-Agent': 'personal-tools-mcp/1.0' } });
                if (!response.ok) throw new Error(`Weather API error for: ${city}`);
                const data = await response.json() as any;
                const current = data.current_condition?.[0];
                const area = data.nearest_area?.[0];
                if (!current) return { content: [{ type: 'text', text: `No weather data for: ${city}` }] };
                const loc = area ? `${area.areaName?.[0]?.value}, ${area.country?.[0]?.value}` : city;
                return {
                    content: [{
                        type: 'text', text: [
                            `Weather for ${loc}`,
                            `─────────────────────────`,
                            `Condition:   ${current.weatherDesc?.[0]?.value}`,
                            `Temperature: ${current.temp_C}°C (feels like ${current.FeelsLikeC}°C)`,
                            `Humidity:    ${current.humidity}%`,
                            `Wind:        ${current.windspeedKmph} km/h ${current.winddir16Point}`,
                        ].join('\n')
                    }]
                };
            }

            case 'get_github_repos': {
                const username = args.username as string;
                const limit = Math.min(args.limit ?? 10, 30);
                const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=${limit}`, { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'personal-tools-mcp/1.0' } });
                if (response.status === 404) return { content: [{ type: 'text', text: `GitHub user not found: ${username}` }] };
                if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
                const repos = await response.json() as any[];
                if (!repos.length) return { content: [{ type: 'text', text: `No public repos for: ${username}` }] };
                const lines = repos.map((r: any) => {
                    const updated = new Date(r.updated_at).toLocaleDateString('en-IE');
                    const stars = r.stargazers_count > 0 ? ` ⭐ ${r.stargazers_count}` : '';
                    const desc = r.description ? `\n     ${r.description}` : '';
                    return `• ${r.name}${stars} — updated ${updated}${desc}`;
                });
                return { content: [{ type: 'text', text: [`GitHub repos for @${username}:`, '─'.repeat(38), ...lines].join('\n') }] };
            }

            case 'get_news_headlines': {
                const source = args.source as string;
                const limit = args.limit ?? 10;
                const RSS_SOURCES: Record<string, string> = {
                    bbc: 'https://feeds.bbci.co.uk/news/rss.xml',
                    hn: 'https://hnrss.org/frontpage',
                    techcrunch: 'https://techcrunch.com/feed/',
                    guardian: 'https://www.theguardian.com/world/rss',
                    rte: 'https://www.rte.ie/rss/news.xml',
                };
                const feedUrl = RSS_SOURCES[source.toLowerCase()] ?? source;
                let feed: any;
                try { feed = await rssParser.parseURL(feedUrl); }
                catch { throw new Error(`Could not load RSS feed: ${feedUrl}. Shortcuts: ${Object.keys(RSS_SOURCES).join(', ')}`); }
                const lines = feed.items.slice(0, limit).map((item: any, i: number) => {
                    const date = item.pubDate ? ` [${new Date(item.pubDate).toLocaleDateString('en-IE')}]` : '';
                    return `${i + 1}. ${item.title}${date}`;
                });
                return { content: [{ type: 'text', text: [`Headlines from ${feed.title ?? feedUrl}:`, '─'.repeat(38), ...lines].join('\n') }] };
            }

            case 'get_okta_user': {
                const users = await oktaGet(`/users?filter=profile.login+eq+"${encodeURIComponent(args.email)}"`);
                if (!users?.length) return { content: [{ type: 'text', text: `No Okta user found: ${args.email}` }] };
                return { content: [{ type: 'text', text: formatUser(users[0]) }] };
            }

            case 'check_okta_mfa': {
                const users = await oktaGet(`/users?filter=profile.login+eq+"${encodeURIComponent(args.email)}"`);
                if (!users?.length) return { content: [{ type: 'text', text: `No Okta user found: ${args.email}` }] };
                const user = users[0];
                const name = `${user.profile.firstName} ${user.profile.lastName}`;
                const factors = await oktaGet(`/users/${user.id}/factors`);
                if (!factors?.length) return { content: [{ type: 'text', text: `${name} has NO MFA factors enrolled.` }] };
                const list = factors.map((f: any) => `  - ${f.factorType} via ${f.provider} — ${f.status}`).join('\n');
                return { content: [{ type: 'text', text: `${name} has ${factors.length} MFA factor(s):\n${list}` }] };
            }

            case 'list_okta_inactive_users': {
                const days = args.days as number;
                const limit = Math.min(args.limit ?? 20, 50);
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - days);
                const users = await oktaGet(`/users?filter=status+eq+"ACTIVE"&limit=200`);
                if (!users?.length) return { content: [{ type: 'text', text: 'No active users found.' }] };
                const inactive = users
                    .filter((u: any) => !u.lastLogin || new Date(u.lastLogin) < cutoff)
                    .sort((a: any, b: any) => (a.lastLogin ? new Date(a.lastLogin).getTime() : 0) - (b.lastLogin ? new Date(b.lastLogin).getTime() : 0))
                    .slice(0, limit);
                if (!inactive.length) return { content: [{ type: 'text', text: `No users inactive for ${days}+ days.` }] };
                const lines = inactive.map((u: any) => `  ${u.profile.firstName} ${u.profile.lastName} (${u.profile.email}) — Last login: ${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('en-IE') : 'Never'}`);
                return { content: [{ type: 'text', text: `${inactive.length} user(s) inactive for ${days}+ days:\n\n${lines.join('\n')}` }] };
            }

            // ── lookup_ip ────────────────────────────────────────────────────────────
            // Uses ip-api.com — free, no key required, 45 requests/min limit
            case 'lookup_ip': {
                const ip = args.ip as string;
                const response = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,regionName,city,isp,org,as,query`);
                if (!response.ok) throw new Error(`IP lookup failed: ${response.status}`);
                const data = await response.json() as any;
                if (data.status === 'fail') return { content: [{ type: 'text', text: `IP lookup failed: ${data.message}` }] };
                return {
                    content: [{
                        type: 'text', text: [
                            `IP Information for ${data.query}`,
                            `─────────────────────────────────`,
                            `Country:  ${data.country}`,
                            `Region:   ${data.regionName}`,
                            `City:     ${data.city}`,
                            `ISP:      ${data.isp}`,
                            `Org:      ${data.org}`,
                            `AS:       ${data.as}`,
                        ].join('\n')
                    }],
                };
            }

            // ── dns_lookup ───────────────────────────────────────────────────────────
            // Uses Node.js built-in dns module — no external API, instant results
            case 'dns_lookup': {
                const domain = args.domain as string;
                const results: string[] = [`DNS records for ${domain}`, '─'.repeat(38)];

                try {
                    const aRecords = await dns.resolve4(domain);
                    results.push(`A Records:`);
                    aRecords.forEach(r => results.push(`  ${r}`));
                } catch { results.push(`A Records: none found`); }

                try {
                    const mxRecords = await dns.resolveMx(domain);
                    results.push(`MX Records:`);
                    mxRecords.sort((a, b) => a.priority - b.priority).forEach(r => results.push(`  Priority ${r.priority}: ${r.exchange}`));
                } catch { results.push(`MX Records: none found`); }

                try {
                    const txtRecords = await dns.resolveTxt(domain);
                    results.push(`TXT Records:`);
                    txtRecords.slice(0, 5).forEach(r => results.push(`  ${r.join(' ')}`));
                } catch { results.push(`TXT Records: none found`); }

                return { content: [{ type: 'text', text: results.join('\n') }] };
            }

            // ── generate_password ────────────────────────────────────────────────────
            // Uses Node.js built-in crypto module — no external API needed
            case 'generate_password': {
                const length = Math.min(Math.max(args.length ?? 16, 8), 128);
                const includeSymbols = args.include_symbols !== false;

                const lowercase = 'abcdefghijklmnopqrstuvwxyz';
                const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                const numbers = '0123456789';
                const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

                const charset = lowercase + uppercase + numbers + (includeSymbols ? symbols : '');
                let password = '';

                // Cryptographically secure random generation
                const randomBytes = crypto.randomBytes(length * 2);
                let i = 0;
                while (password.length < length) {
                    const byte = randomBytes[i % randomBytes.length];
                    if (byte < charset.length * Math.floor(256 / charset.length)) {
                        password += charset[byte % charset.length];
                    }
                    i++;
                }

                // Ensure at least one of each required type
                const checks = [
                    { test: /[a-z]/, chars: lowercase },
                    { test: /[A-Z]/, chars: uppercase },
                    { test: /[0-9]/, chars: numbers },
                    ...(includeSymbols ? [{ test: /[!@#$%^&*]/, chars: symbols }] : []),
                ];

                for (const check of checks) {
                    if (!check.test.test(password)) {
                        const pos = crypto.randomInt(password.length);
                        const char = check.chars[crypto.randomInt(check.chars.length)];
                        password = password.slice(0, pos) + char + password.slice(pos + 1);
                    }
                }

                return {
                    content: [{
                        type: 'text', text: [
                            `Generated password (${length} characters):`,
                            ``,
                            password,
                            ``,
                            `Strength: ${length >= 20 ? 'Strong' : length >= 12 ? 'Good' : 'Acceptable'}`,
                            `Symbols included: ${includeSymbols ? 'Yes' : 'No'}`,
                        ].join('\n')
                    }],
                };
            }

            default:
                throw new Error(`Unknown tool: ${request.params.name}`);
        }

    } catch (err) {
        return {
            content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
            isError: true,
        };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('personal-tools MCP server running (v3 — full suite)');
}

main().catch(console.error);