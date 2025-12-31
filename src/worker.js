import PostalMime from "postal-mime";
import { convert } from "html-to-text";

export default {
	// Default entry point; Avoid fetch handler errors
	async fetch(request, env, ctx) {
		if (env.DEBUG === true) {
			console.debug("Email worker received a request", {
				url: request.url,
				method: request.method,
				timestamp: Date.now()
			});
		}
		return new Response("Email worker is running", { status: 200 });
	},

	async email(message, env, ctx) {
		const webhookUrl = env.SLACK_WEBHOOK_URL;

		const subject = message.headers.get('subject');
		const content = await PostalMime.parse(message.raw, {
			attachmentEncoding: "base64",
		});

		// Extract body content
		const body = parseContent(content.text, content.html);

		// Extract attachment info
		const attachments = filterAttachments(content.attachments || []);

		// Prepare list of emails to forward to
		const workerEmail = env.WORKER_EMAIL.trim();
		const forwardEmails = filterEmails(
			env,
			(env.FORWARD_EMAIL || "").split(','),
			workerEmail,
			message.from
		);

		// Forward email if configured
		await forwardEmail(message, env, forwardEmails);

		// Process based on recipient address
		switch (message.to) {
			case workerEmail:
				if (env.DEBUG === true) {
					console.debug("Processing incoming email", {
						to: message.to,
						from: message.from,
						timestamp: Date.now()
					});
				}
				await sendToSlack(env, webhookUrl, message.from, subject, body, attachments);
				break;

			default:
				console.error("Unknown recipient address:", message.to);
				message.setReject("Unknown address");
				return new Response("Email not processed", { status: 400 });
		}

		return new Response("Email processed", { status: 200 });
	}
}

function filterEmails(env, emailList, workerEmail, fromEmail) {
	return emailList
		.map(addr => addr.trim())
		.filter(addr => addr.length > 0)
		// Remove duplicates
		.filter((addr, index, self) => self.findIndex(a => a.toLowerCase() === addr.toLowerCase()) === index)
		// Ensure we don't forward to the Slack email address
		.filter(addr => addr.toLowerCase() !== workerEmail.toLowerCase())
		// Ensure we don't forward to the sender address of the email
		.filter(env.FORWARD_EXCLUDE_SENDER === true ? addr => addr.toLowerCase() !== fromEmail.toLowerCase() : () => true);
}

function filterAttachments(attachments) {
	return attachments
		.map((attachment) => ({
			filename: attachment.filename || "unnamed_attachment",
			mimeType: attachment.mimeType || "application/octet-stream",
			content: attachment.content // Already a base64 string due to attachmentEncoding
		}));
}

function parseContent(text, html) {
	// Extract body (prefer plain text, fallback to HTML conversion)
	let body = text;
	if (!body && html) {
		body = convert(html);
	}

	return {
		text: body ? body.trim() : null,
		html: html ? html.trim() : null
	};
}

async function forwardEmail(message, env, forwardEmails) {
	if (env.DEBUG === true) {
		console.debug("Forwarding address(es):", {
			forwardTo: forwardEmails.join(','),
			timestamp: Date.now()
		});
	}

	if (forwardEmails.length > 0) {
		try {
			while (forwardEmails.length > 0) {
				let forwardTo = forwardEmails.shift().trim();
				if (env.DEBUG === true) {
					console.debug("Sending email to:", {
						forwardTo: forwardTo,
						timestamp: Date.now()
					});
				}
				await message.forward(forwardTo);
			}
		} catch (error) {
			console.error("Error forwarding email:", error);
		}
	} else {
		if (env.DEBUG === true) {
			console.debug("No FORWARD_EMAIL set, skipping forwarding step", {
				timestamp: Date.now()
			});
		}
	}
}

function attachmentInfo(attachments) {
	const hasAttachments = attachments && attachments.length > 0;
	return hasAttachments ? [{
		type: "context",
		elements: [
			{
				type: "mrkdwn",
				text: `*_Attachments:_* ${attachments.length} file(s) received.`
			}
		]
		}] : []
}

async function sendToSlack(env, webhookUrl, from, subject, body, attachments) {
	const attachmentInfoBlocks = attachmentInfo(attachments);
	const hasAttachments = attachmentInfoBlocks.length > 0;
	const showAttachments = env.SHOW_ATTACHMENTS === true;
	const showRawBody = env.SHOW_RAW_BODY === true;
	const attachmentBlockColor = env.ATTACHMENT_BLOCK_COLOR_HEX;

	// https://docs.slack.dev/block-kit/
	const slackPayload = {
		blocks: [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: "New Email Received!"
				}
			},
			// {
			// 	type: "section",
			// 	text: {
			// 		type: "mrkdwn",
			// 		// text: `*_From:_* \`${from}\`\n*_Subject:_* \`${subject}\``,
			// 		text: `*_From:_* ${from}\n*_Subject:_* ${subject}`,
			// 	}
			// },
			{
				type: "rich_text",
				elements: [
					{
						type: "rich_text_section",
						elements: [
							{
								type: "text",
								text: "From:",
								style: {
									bold: true,
									italic: true
								}
							},
							{
								type: "text",
								text: " "
							},
							{
								type: "text",
								text: from
							}
						]
					},
					{
						type: "rich_text_section",
						elements: [
							{
								type: "text",
								text: "Subject:",
								style: {
									bold: true,
									italic: true
								}
							},
							{
								type: "text",
								text: " "
							},
							{
								type: "text",
								text: subject
							}
						]
					}
				]
			},
			...(showAttachments ? [] : attachmentInfoBlocks),
			{
				type: "divider"
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: showRawBody
						? `*_Body:_*\n\`\`\`${body.html}\`\`\``
						: body.text
				}
			},
			{
				type: "divider"
			},
			...(showAttachments ? attachmentInfoBlocks : [])
		],
		// Legacy attachments field for additional optional info
		// https://docs.slack.dev/messaging/formatting-message-text#when-to-use-attachments
		...(hasAttachments && showAttachments ? {attachments: attachments.map(att => ({
			...(attachmentBlockColor ? {color: attachmentBlockColor} : {}),
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `*${att.filename}*`
					}
				},
				{
					type: "context",
					elements: [
						{
							type: "mrkdwn",
							text: `*_Mime Type:_* \`${att.mimeType}\` \n*_Size:_* ${Math.round(att.content.length * 0.75)} bytes`
						}
					]
				}
			]
		})) } : {})
  	};

	// Send to Slack
	await fetch(webhookUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(slackPayload)
	});
}
