# Routing Emails to Slack through a Cloudflare Email Worker

A Cloudflare Email Worker that receives incoming emails, parses them, and sends formatted notifications to Slack via webhooks. The worker also forwards the original email to a specified address.

## In this Guide

Cloudflare provides detailed [official documentation](https://developers.cloudflare.com/email-routing/email-workers/) on configuration a basic Email Worker.

As such, this guide just provides coding details for creating custom slack routing email worker.

## Features

- **Email Routing**: Handles incoming emails using Cloudflare Email Workers
- **Slack Notifications**: Sends formatted messages to Slack with sender, subject, and body
- **Attachment Handling** (configurable): Detects and reports attachments with metadata (filename, mime type, size)
- **Email Forwarding** (configurable): Automatically forwards received emails to a configured address
- **HTML/Text Support** (configurable): Parses both plain text and HTML emails, converting HTML to readable text

> [!NOTE]
> For **Email Forwarding** (mentioned above) to work, the `to` address must match a **_verified_ [Destination address](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/#destination-addresses)**.

## Prerequisites

_TODO_

## Dependencies

The example uses [postal-mime](https://github.com/postalsys/postal-mime#readme) to parse attachments, and [html-to-text](https://github.com/html-to-text/node-html-to-text/tree/master/packages/html-to-text) to convert html to text.

> [!NOTE]
> The individual dependencies will be automatically installed during [setup](#setup).

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure secrets using Wrangler:

   ```bash
   npx wrangler secret put SLACK_WEBHOOK_URL
   npx wrangler secret put WORKER_EMAIL
   npx wrangler secret put FORWARD_EMAIL
   ```

3. Deploy to Cloudflare:
   ```bash
   npx wrangler deploy
   ```

## Environment Variables & Secrets

> [!TIP]
> Secrets are being used for variables that could expose potentially sensitive information (such as private email addresses).
>
> All the _secrets_ could be standard [_variables_](#variables-optional) (_either optional or required, as appropriate_) without affecting functionality.

### Secrets (Required)

- **`SLACK_WEBHOOK_URL`**: Slack incoming webhook URL for sending notifications
- **`WORKER_EMAIL`**: Expected recipient email for the worker (somewhat redundant, but could be used for additional checks)

### Secrets (Optional)

- **`FORWARD_EMAIL`**: Comma-separated list of email addresses to forward messages to

### Variables (Optional)

> [!TIP]
> Set these in `wrangler.toml` under `[vars]`.

- **`DEBUG`**: Enable debug logging (`true`/`false`, default: `false`)
- **`SHOW_ATTACHMENTS`**: Display detailed attachment information in Slack (`true`/`false`, default: `false`)
- **`ATTACHMENT_BLOCK_COLOR_HEX`**: Override the hex color for the slack attachment blocks (default: `#36a64f`).
- **`SHOW_RAW_BODY`**: Show raw HTML body instead of converted text (`true`/`false`, default: `false`)
- **`FORWARD_EXCLUDE_SENDER`**: Prevent forwarding emails back to the original sender (`true`/`false`, default: `false`)

## Other Considerations

- [Nameserver configuration](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)

## References

### Official Documentation

The official docs.

- [**_Cloudflare_** Email Workers](https://developers.cloudflare.com/email-routing/email-workers/)
	- [Verify a Destination Address](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/#destination-addresses)
- [**_Cloudflare_** Email DNS Settings](https://developers.cloudflare.com/email-routing/setup/email-routing-dns-records/)
- [**_Slack_** Block Kit](https://docs.slack.dev/block-kit/)
- [**_Slack_** Message Attachments (Legacy)](https://docs.slack.dev/messaging/formatting-message-text#when-to-use-attachments)

### Local Development

Documentation for developing and testing locally.

- [**_Cloudflare_** Local Development](https://developers.cloudflare.com/email-routing/email-workers/local-development/)

### Other References

Other blogs and reference materials I used a a guide.

- [How to parse emails with **_Cloudflare_** Email Workers](https://blog.emailengine.app/how-to-parse-emails-with-cloudflare-email-workers/)

### Additional Resources

I found these links after the fact, but could be useful for porting to other languages.

- [Cloudflare Workers Languages](https://developers.cloudflare.com/workers/languages/)
- [Routing Emails Through a Cloudflare Worker](https://github.com/jldec/my-email-worker) (_Typescript_)<br>
	(<small>Provides a good example on sending an automatic reply</small>)
   - [Article link](https://jldec.me/blog/routing-emails-through-a-cloudflare-worker)
