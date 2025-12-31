import PostalMime from "postal-mime";
import { convert } from "html-to-text";

export default {
	// Avoid fetch handler errors
	async fetch(request, env, ctx) {
		if (env.DEBUG === true) {
			console.debug("Email worker received a request", {
				url: request.url,
				method: request.method,
				timestamp: Date.now()
			});
		}
		return new Response('Email worker is running', { status: 200 });
	},

	async email(message, env, ctx) {
		const webhookUrl = env.SLACK_WEBHOOK_URL;

		const subject = message.headers.get('subject');
		const content = await PostalMime.parse(message.raw, {
			attachmentEncoding: "base64",
		});

		let body = parseContent(content.text, content.html);

		let attachments = content.attachments.map((attachment) => ({
			filename: attachment.filename || "unnamed_attachment",
			mimeType: attachment.mimeType || "application/octet-stream",
			content: attachment.content, // Already a base64 string due to attachmentEncoding
		}));

		switch (message.to) {
			case env.SLACK_EMAIL:
			if (env.DEBUG === true) {
				console.debug("Processing incoming email", {
					to: message.to,
					from: message.from,
					timestamp: Date.now()
				});
			}
			await sendToSlack(webhookUrl, message.from, subject, body, attachments);
			break;

			default:
			console.error("Unknown recipient address:", message.to);
			message.setReject("Unknown address");
			return new Response('Email not processed', { status: 400 });
		}

		await message.forward(env.FORWARD_EMAIL);
		return new Response('Email processed', { status: 200 });
	}
}

function parseContent(text, html) {
	// Extract body (prefer plain text, fallback to HTML conversion)
	let body = text;
	if (!body && html) {
		body = convert(html);
	}

	if (!body) {
		return null;
	}

	return body.trim();
}

async function sendToSlack(webhookUrl, from, subject, body, attachments) {
  let hasAttachments = attachments && attachments.length > 0;
  const slackPayload = {
    blocks: [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: "New Email Received!"
			}
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				// text: `*_From:_* \`${from}\`\n*_Subject:_* \`${subject}\``,
				text: `*_From:_* ${from}\n*_Subject:_* ${subject}`,
			}
		},
		{
			type: "divider"
		},
		{
			type: "section",
			text: {
				type: "mrkdwn",
				// text: `*_Body:_*\n\`\`\`${body}\`\`\``
				text: `${body}`
			}
		},
		{
			type: "divider"
		},
		...(hasAttachments ? [{
		type: "section",
		text: {
			type: "mrkdwn",
			text: `*_Attachments:_* ${attachments.length} file(s) received.`
		}
		}] : [])
    ],
    // Legacy attachments field for additional optional info
    // https://docs.slack.dev/messaging/formatting-message-text#when-to-use-attachments
    ...(hasAttachments ? {attachments: attachments.map(att => ({
		color: "#36a64f",
		// blocks: [
		// 	{
		// 	type: "section",
		// 	text: {
		// 		type: "mrkdwn",
		// 		text: `*${att.filename}* \n*_Mime Type:_* \`${att.mimeType}\` \n*_Size:_* ${Math.round(att.content.length * 0.75)} bytes`
		// 	}
		// 	}
		// ],
		title: att.filename,
		text: `*_Mime Type:_* \`${att.mimeType}\``,
		footer: `*_Size:_* ${Math.round(att.content.length * 0.75)} bytes`
    })) } : {})
  };

	// Send to Slack
	await fetch(webhookUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(slackPayload)
	});
}
