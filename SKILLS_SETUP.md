# TrustDrive — Optional UI & QA Tool Setup

> Coding Agent Rule 13: use these skills **only when supported by the current
> coding environment**. These are dev/agent tooling, **not** runtime application
> dependencies. Do not make any skill or API key a hard dependency of the product.

## Status in this environment (WorkBuddy)
All design/QA skills below are installed as **user-level skills** under
`~/.workbuddy-ai/skills/` and the 21st MCP is configured in
`~/.workbuddy-ai/mcp.json`. Playwright CLI ships as an official WorkBuddy skill.

| Tool | Status | Notes |
|---|---|---|
| Taste Skill (`design-taste-frontend` v2) | ✅ Installed | folder `design-taste-frontend` |
| Taste Skill (`redesign-skill` v1 fallback) | ⚠️ Not in current repo | the `taste-skill` repo only ships v2 now; pin `design-taste-frontend-v1` or fetch the legacy skill if v2 misbehaves |
| Image-to-Code | ✅ Installed | from `Leonxlnx/imagegen-skills` (moved there Oct 2026) |
| Vercel Web Design Guidelines | ✅ Installed | `web-design-guidelines` |
| Vercel React Best Practices | ✅ Installed | from `vercel-labs/agent-skills/skills/react-best-practices` |
| 21st MCP (formerly Magic MCP) | ⚠️ Configured, needs key + Trust | see §6 |
| Awesome Design MD | ✅ Installed (reference library) | `awesome-design` — `design-md/<company>/DESIGN.md` teardowns |
| Playwright CLI | ✅ Installed (official skill) | browser automation + screenshots |

## 1. Taste Skill
Anti-slop frontend art direction. Use when building, redesigning, restyling or
reviewing any public-facing page or app screen.
- Default **`design-taste-frontend`** (v2) is experimental. If it behaves
  inconsistently, use the **`redesign-skill`** fallback or pin
  `design-taste-frontend-v1`.
- Canonical install (reference; WorkBuddy already has it):
  ```bash
  npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
  npx skills add https://github.com/Leonxlnx/taste-skill --skill "redesign-skill"
  ```

## 2. Image-to-Code
Generates code from reference images/dashboards. Useful after analyzing the
supplied dashboard PNGs.
```bash
npx skills add https://github.com/Leonxlnx/imagegen-skills --skill "image-to-code"
```
> The image-generation skills moved from the Taste Skill repo to
> `Leonxlnx/imagegen-skills` in October 2026.

## 3. Vercel Web Design Guidelines
UI / accessibility / UX review.
```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill "web-design-guidelines"
```

## 4. Vercel React Best Practices
React/Next.js performance review (data fetching, bundle size, render patterns).
```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill "vercel-react-best-practices"
```

## 5. Awesome Design MD (reference only)
Curated library of real-world `DESIGN.md` analyses (Apple, Airbnb, BMW, Vercel,
Stripe …). Browse for inspiration; **do not** copy another product's brand
wholesale, and **do not** install several unrelated design systems.
```bash
# reference: https://github.com/VoltAgent/awesome-design-md
```

## 6. 21st MCP (formerly Magic MCP)
Remote HTTP MCP server for component search / generation.
```bash
# Editor-initiated (reference):
npx @21st-dev/cli@latest init --client cursor   # replace cursor with your client
```
In WorkBuddy it is already added to `~/.workbuddy-ai/mcp.json`:
```json
{ "mcpServers": { "21st": {
  "url": "https://21st.dev/api/mcp",
  "headers": { "x-api-key": "REPLACE_WITH_YOUR_21ST_API_KEY" }
}}}
```
**To activate:** (1) get a free key at https://21st.dev/mcp, (2) replace the
placeholder, (3) open the connector management page and click **Trust** on the
`21st` server. Old Magic keys were reset. Store keys in local MCP config / env
vars only — never in source code.

## 7. Playwright CLI
Browser automation, screenshots and repeatable test suites.
```bash
npm install -g @playwright/cli@latest
playwright-cli install --skills
# example:
playwright-cli open http://localhost:3000/buyer/overview --headed
playwright-cli screenshot --filename=buyer-overview.png
```
Use Playwright Test for repeatable suites if already appropriate for the repo.

## Tool policy
- Do **not** make a skill / API key a hard dependency of the product.
- Do **not** install a tool that conflicts with the existing stack.
- Check each repository's **license** and current README before installing.
- Do **not** expose keys or upload real user documents to third-party tools
  without authorization.
