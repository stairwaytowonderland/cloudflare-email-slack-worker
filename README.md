# cloudflare-email-slack-worker

A Cloudflare Email Worker that receives incoming emails, parses them, and sends formatted notifications to Slack via webhooks. The worker also forwards the original email to a specified address.

## Features

- **Email Routing**: Handles incoming emails using Cloudflare Email Workers
- **Slack Notifications**: Sends formatted messages to Slack with sender, subject, and body
- **Attachment Handling**: Detects and reports attachments with metadata (filename, mime type, size)
- **Email Forwarding**: Automatically forwards received emails to a configured address
- **HTML/Text Support**: Parses both plain text and HTML emails, converting HTML to readable text

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure secrets using Wrangler:
   ```bash
   npx wrangler secret put SLACK_WEBHOOK_URL
   npx wrangler secret put SLACK_EMAIL
   npx wrangler secret put FORWARD_EMAIL
   ```

3. Deploy to Cloudflare:
   ```bash
   npm run deploy
   ```

## Environment Variables

- `SLACK_WEBHOOK_URL`: Slack incoming webhook URL
- `SLACK_EMAIL`: Email address to route to Slack
- `FORWARD_EMAIL`: Email address to forward messages to
- `DEBUG`: Enable debug logging (set in `wrangler.toml`)
