# cloudflare-email-slack-worker

A Cloudflare Email Worker that receives incoming emails, parses them, and sends formatted notifications to Slack via webhooks. The worker also forwards the original email to a specified address.

## Features

- **Email Routing**: Handles incoming emails using Cloudflare Email Workers
- **Slack Notifications**: Sends formatted messages to Slack with sender, subject, and body
- **Attachment Handling** (configurable): Detects and reports attachments with metadata (filename, mime type, size)
- **Email Forwarding** (configurable): Automatically forwards received emails to a configured address
- **HTML/Text Support** (configurable): Parses both plain text and HTML emails, converting HTML to readable text

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

## Environment Variables & Secrets

### Secrets (Required)

- **`SLACK_WEBHOOK_URL`**: Slack incoming webhook URL for sending notifications
- **`WORKER_EMAIL`**: Email address that routes incoming emails to Slack

### Secrets (Optional)

- **`FORWARD_EMAIL`**: Comma-separated list of email addresses to forward messages to

### Variables (Optional)

> [!NOTE]
> Set these in `wrangler.toml` under `[vars]`.

- **`DEBUG`**: Enable debug logging (`true`/`false`, default: `false`)
- **`SHOW_ATTACHMENTS`**: Display detailed attachment information in Slack (`true`/`false`, default: `false`)
- **`ATTACHMENT_BLOCK_COLOR_HEX`**: Override the hex color for the slack attachment blocks (default: `#36a64f`).
- **`SHOW_RAW_BODY`**: Show raw HTML body instead of converted text (`true`/`false`, default: `false`)
- **`FORWARD_EXCLUDE_SENDER`**: Prevent forwarding emails back to the original sender (`true`/`false`, default: `false`)

## References

### Official Documentation

- [**_Cloudflare_ Email Workers**](https://developers.cloudflare.com/email-routing/email-workers/)
- [**_Slack_ Block Kit**](https://docs.slack.dev/block-kit/)
- [**_Slack_ Message Attachments (Legacy)**](https://docs.slack.dev/messaging/formatting-message-text#when-to-use-attachments)

### Other References

- [How to parse emails with Cloudflare Email Workers](https://blog.emailengine.app/how-to-parse-emails-with-cloudflare-email-workers/)
