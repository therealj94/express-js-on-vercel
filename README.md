# Express.js on Vercel

Basic Express.js + Vercel example that serves html content, JSON data and simulates an api route.

## How to Use

You can choose from one of the following two methods to use this repository:

### One-Click Deploy

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=vercel-examples):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/examples/tree/main/solutions/express&project-name=express&repository-name=express)

### Clone and Deploy

```bash
git clone https://github.com/vercel/examples/tree/main/solutions/express
```

Install the Vercel CLI:

```bash
npm i -g vercel
```

Then run the app at the root of the repository:

```bash
vercel dev
```

## Related MCP Servers

The `video` and `images` skill categories in `src/data/skills.ts` reference [Higgsfield AI](https://higgsfield.ai), a creative suite for AI-generated video and images. Higgsfield exposes an MCP (Model Context Protocol) server so its generation tools can be called directly from Claude:

- **Endpoint:** `https://mcp.higgsfield.ai/mcp`
- **Capabilities:** text/reference-to-video generation, text-to-image generation, and Higgsfield's library of visual-effects presets
- **Auth:** requests without credentials receive `401 Unauthorized` — an API key/token from your Higgsfield account is required before the server will respond

To connect it, add it to your MCP client config (e.g. Claude Desktop or Claude Code) as a remote HTTP server pointing at the endpoint above, supplying whatever auth header Higgsfield issues for your account.
