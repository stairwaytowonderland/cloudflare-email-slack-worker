# Routing Emails to Slack through a Cloudflare Email Worker

A Cloudflare Email Worker that receives incoming emails, parses them, and sends formatted notifications to Slack via webhooks. The worker also forwards the original email to a specified address.

## In this Guide

Cloudflare provides detailed [official documentation](https://developers.cloudflare.com/email-routing/email-workers/) on configuring a basic Email Worker.

As such, this guide just provides coding details for creating custom slack routing email worker.

## Features

- **Email Routing**: Handles incoming emails using Cloudflare Email Workers
- **Slack Notifications**: Sends formatted messages to Slack with sender, subject, and body
- **Attachment Handling** (configurable): Detects and reports attachments with metadata (filename, mime type, size)
- **Email Forwarding** (configurable): Automatically forwards received emails to a configured address
- **HTML/Text Support** (configurable): Parses both plain text and HTML emails, converting HTML to readable text

> [!NOTE]
> For **Email Forwarding** (mentioned above) to work, the `to` address must match a **_verified_ [Destination address](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/#destination-addresses)**.

## Slack Apps

Create and Manage slack apps using the slack **api** url: [api.slack.com/apps](https://api.slack.com/).

## Prerequisites

_TODO_

## Dependencies

The example uses the following dependencies (automatically installed during [setup](#setup)):

- [`postal-mime`](https://github.com/postalsys/postal-mime#readme) to parse attachments
- [`html-to-text`](https://github.com/html-to-text/node-html-to-text/tree/master/packages/html-to-text) to convert html to text
- [`mime-text`](https://github.com/muratgozel/MIMEText) to generate a reply

> [!IMPORTANT]
> Enabling built-in Node.js APIs (_i.e. `mime-text`_) requires the [`nodejs_compat` compatibility flag](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) in `wrangler.toml`.
> (_Also ensure that your Worker's compatibility date is 2024-09-23 or later._)

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

### Local Development

```bash
npx wrangler dev
```

See the [official documentation](https://developers.cloudflare.com/email-routing/email-workers/local-development/) for more details.

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
- **`REPLY_TO_SENDER`**: Send an automated reply to the sender (`true`/`false`, default: `false`)

## Other Considerations

- [Nameserver configuration](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)

## IaC

You must create a [Cloudflare API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) with the following permissions:

```
|-- <account> - Workers Agents Configuration:Edit, Containers:Edit, Workers Observability:Edit,
        |    Secrets Store:Edit, Browser Rendering:Edit, AI Gateway:Run,
        |    Workers Builds Configuration:Edit, Workers Pipelines:Edit, AI Gateway:Edit,
        |    AI Gateway:Read, Workers AI:Edit, Queues:Edit, Vectorize:Edit, Hyperdrive:Edit,
        |    Cloudchamber:Edit, D1:Edit, Email Routing Addresses:Edit, Cloudflare Pages:Edit,
        |    Workers R2 Storage:Edit, Workers Tail:Read, Workers KV Storage:Edit,
        |    Workers Scripts:Edit, Account Settings:Read
        └-- All zones - Email Routing Rules:Edit, Zone Settings:Edit, Zone:Read,
                    Workers Routes:Edit, SSL and Certificates:Edit

```

### Terraform POC

```bash
export TF_VAR_cloudflare_account_id="your-account-id"
export TF_VAR_cloudflare_api_token="your-api-token"
export TF_VAR_cloudflare_domain="example.com"
```

```hcl
# Configure the Cloudflare provider
terraform {
  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      version = "~> 5.0" # Use a compatible version
    }
  }
}

provider "cloudflare" {
  api_token  = var.cloudflare_api_token
}

# Define variables
variable "catch_all" {
  type    = bool
  default = false
}

variable "cloudflare_account_id" {
  type = string
}

variable "cloudflare_api_token" {
  type = string
}

variable "cloudflare_domain" {
  type = string
}

variable "email_worker_script_path" {
  type    = string
  default = "./src/email_worker.js"
}

variable "recipient_email_prefix" {
  type = string
}

locals {
  zone_id          = one(data.cloudflare_zones.this.result).id
  zone_name        = one(data.cloudflare_zones.this.result).name
  recipient_email  = "${var.recipient_email_prefix}@${local.zone_name}"
}

# Retrieve zone details
data "cloudflare_zones" "this" {
  account = {
    id = var.cloudflare_account_id
  }
  name   = var.domain_name
  status = "active"
}

# 1. Define the Cloudflare Worker
resource "cloudflare_worker" "email_worker" {
  account_id = var.cloudflare_account_id
  name       = "email_worker_script"

  # Not required, but good practice
  observability = {
    enabled            = true
    head_sampling_rate = 1
    logs = {
      enabled            = true
      head_sampling_rate = 1
      invocation_logs    = true
    }
  }
}

# 2. Define the Cloudflare Worker Version
resource "cloudflare_worker_version" "email_worker" {
  account_id          = var.cloudflare_account_id
  worker_id           = cloudflare_worker.email_worker.id
  # https://developers.cloudflare.com/workers/configuration/compatibility-flags/#nodejs-compatibility-flag
  compatibility_date = "2024-09-23"
  compatibility_flags = [ "nodejs_compat" ]
  main_module         = "worker.js"
  modules = [
    {
      name         = "worker.js"
      content_type = "application/javascript+module"
      content_file = "${path.module}/${var.email_worker_script_path}"
    }
  ]

  # Optionally ignore changes if compatibility_date changes
  # lifecycle {
  #   ignore_changes = [compatibility_date]
  # }
}

# 3. Define the Cloudflare Worker Deployment
resource "cloudflare_workers_deployment" "email_worker" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_worker.email_worker.name
  strategy    = "percentage"
  versions = [{
    percentage = 100
    version_id = cloudflare_worker_version.email_worker.id
  }]
}

# 4. Enable Email Routing for the zone
resource "cloudflare_email_routing_settings" "zone" {
  zone_id = local.zone_id
}

# 5a. Conditionally create an Email Routing Rule to route emails to the Worker
resource "cloudflare_email_routing_rule" "worker" {
  count = var.catch_all ? 1 : 0

  zone_id  = local.zone_id
  name     = format("Worker %s", cloudflare_workers_deployment.email_worker.script_name)
  priority = 0
  enabled  = true

  matchers = [{
    type  = "literal"
    field = "to"
    value = local.recipient_email
  }]

  actions = [{
    type  = each.value.action
    value = [cloudflare_worker.email_worker.name]
  }]
}

# 5b. Conditionally create an Email Routing Catch-All Rule to route emails to the Worker
resource "cloudflare_email_routing_catch_all" "this" {
  count = var.catch_all ? 1 : 0

  zone_id  = local.zone_id
  name     = format("Worker %s", cloudflare_workers_deployment.email_worker.script_name)
  enabled  = local.catch_all_enabled

  matchers = [{
    type = "all"
  }]

  actions = [{
    type  = "worker"
    value = [cloudflare_worker.email_worker.name]
  }]
}
```

```javascript
// A basic Cloudflare Email Worker script (e.g. place this in src/email_worker.js)
export default {
	async fetch(request, env, ctx) {
		// Log the request URL to the dashboard (optional)
		console.log(`Handling request for: ${request.url}`);

		// Access a binding if you have one configured (e.g., a KV namespace named 'MY_KV_STORE')
		// const value = await env.MY_KV_STORE.get("someKey");

		return new Response('Cloudflare Worker (ES Module) is running.', {
			headers: { 'Content-Type': 'text/plain' },
			status: 200,
		});
	},

	async email(message, env, ctx) {
		// Log the incoming email details
		console.log(`Received email from ${message.from} to ${message.to}: ${message.headers.get('subject')}`);

		// You can process the email content, forward it, store it in KV/R2, etc.
		// Example: Forwarding the email to a specific address (ensure destination is verified in CF dashboard if needed)
		// await message.forward("destination@example.net");

		// Example: Storing a log in a KV namespace binding named "EMAIL_LOGS"
		// await env.EMAIL_LOGS.put(message.id, message.subject);
	},
};
```

**Official Docs**

- [Terraform Provider](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs)
    - [Workers Script](https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs/resources/workers_script)
- [Cloudflare Example](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/) (_beta_)

## References

### Official Documentation

The official docs.

- [**_Cloudflare_** Email Workers](https://developers.cloudflare.com/email-routing/email-workers/)
    - [Verify a Destination Address](https://developers.cloudflare.com/email-routing/setup/email-routing-addresses/#destination-addresses)
- [**_Cloudflare_** Email DNS Settings](https://developers.cloudflare.com/email-routing/setup/email-routing-dns-records/)
- [**_Cloudflare_** Node.js compatibility flag](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [**_Cloudflare_** Local Development](https://developers.cloudflare.com/email-routing/email-workers/local-development/) (In `wrangler.toml`::`compatibility_flags`)
- [**_Slack_** Block Kit](https://docs.slack.dev/block-kit/)
- [**_Slack_** Message Attachments (Legacy)](https://docs.slack.dev/messaging/formatting-message-text#when-to-use-attachments)

### Other References

Other blogs and reference materials I used a a guide.

- [How to parse emails with **_Cloudflare_** Email Workers](https://blog.emailengine.app/how-to-parse-emails-with-cloudflare-email-workers/)

### Additional Resources

I found these links after the fact, but could be useful for porting to other languages.

- [Cloudflare Workers Languages](https://developers.cloudflare.com/workers/languages/)
- [Routing Emails Through a Cloudflare Worker](https://github.com/jldec/my-email-worker) (_Typescript_)
