import * as PostalMimeDefault from 'postal-mime';
import PostalMime from 'postal-mime';
import { convert } from 'html-to-text';
import { createMimeMessage } from 'mimetext';
import { EmailMessage } from 'cloudflare:email';

export default {
	// Default entry point; Avoid fetch handler errors
	// https://developers.cloudflare.com/workers/get-started/guide/
	async fetch(request, env, ctx) {
		if (env.DEBUG === true) {
			console.debug('Email worker received a request', {
				url: request.url,
				method: request.method,
				timestamp: Date.now(),
			});
		}
		return new Response('Email worker is running', { status: 200 });
	},

	async email(message, env, ctx) {
		return await main(message, env, ctx);
	},
};

function filterEmails(message, env, workerEmail) {
	const addressList = (env.FORWARD_EMAIL || '').split(',');
	// Always worker email to prevent loops
	const excludeList = [workerEmail]
		// Exclude sender if configured
		.concat(env.FORWARD_EXCLUDE_SENDER === true ? [message.from] : []);

	return (
		addressList
			.map((addr) => addr.trim())
			.filter((addr) => addr.length > 0)
			// Remove duplicates
			.filter((addr, index, self) => self.findIndex((a) => a.toLowerCase() === addr.toLowerCase()) === index)
			// Exclude any additional addresses
			.filter((addr) => !excludeList.some((excl) => excl.toLowerCase() === addr.toLowerCase()))
	);
}

function filterAttachments(attachments) {
	return attachments.map((attachment) => ({
		filename: attachment.filename || 'unnamed_attachment',
		mimeType: attachment.mimeType || 'application/octet-stream',
		content: attachment.content, // Already a base64 string due to attachmentEncoding
	}));
}

function convertContent(text, html) {
	// Extract body (prefer plain text, fallback to HTML conversion)
	let body = text;
	if (!body && html) {
		body = convert(html);
	}

	return {
		text: body ? body.trim() : null,
		html: html ? html.trim() : null,
	};
}

async function debug(message, env, ctx) {
	// parses incoming message
	const parser = new PostalMimeDefault.default();
	const rawEmail = new Response(message.raw);
	const email = await parser.parse(await rawEmail.arrayBuffer());

	console.debug(email);

	return await reply(message, env, email);
}

async function main(message, env, ctx) {
	const recipientEmail = message.to.trim();
	const workerEmail = env.WORKER_EMAIL.trim();

	// Process based on recipient address
	switch (recipientEmail.toLowerCase()) {
		case workerEmail.toLowerCase():
			if (env.DEBUG === true) {
				console.debug('Processing incoming email', {
					to: recipientEmail,
					from: message.from,
					timestamp: Date.now(),
				});
			}
			// Prepare list of emails to forward to
			const forwardEmails = filterEmails(message, env, workerEmail);

			// Parses incoming message
			const parsedContent = await PostalMime.parse(message.raw, {
				attachmentEncoding: 'base64',
			});

			await forward(message, env, forwardEmails);
			await process(message, env, parsedContent);
			await reply(message, env, parsedContent);
			break;

		default:
			console.error('Unknown recipient address:', recipientEmail);
			message.setReject('Unknown address');
	}
}

function attachmentInfo(attachments) {
	const hasAttachments = attachments && attachments.length > 0;
	return hasAttachments
		? [
				{
					type: 'context',
					elements: [
						{
							type: 'mrkdwn',
							text: `*_Attachments:_* ${attachments.length} file(s) received.`,
						},
					],
				},
			]
		: [];
}

async function reply(message, env, parsedContent) {
	if (env.REPLY_TO_SENDER === true) {
		if (env.DEBUG === true) {
			console.debug('Replying to sender:', {
				to: message.from,
				timestamp: Date.now(),
			});
		}

		// creates reply message
		const msg = createMimeMessage();
		const subject = parsedContent.subject || '(No Subject)';
		msg.setSender({ name: 'Thank you for your message', addr: message.to });
		msg.setRecipient(message.from);
		msg.setHeader('In-Reply-To', message.headers.get('Message-ID'));
		msg.setSubject('Automated Reply: ' + subject);
		msg.addMessage({
			contentType: 'text/plain',
			data: `This is an automated reply. Your email with the subject "${subject}" was received, and will be handled as soon as possible.\n\n`,
		});

		const replyMessage = new EmailMessage(message.to, message.from, msg.asRaw());

		await message.reply(replyMessage);
	}
}

async function forwardMessage(message, env, address) {
	try {
		if (env.DEBUG === true) {
			console.debug('Forwarding email to:', {
				forwardTo: address,
				timestamp: Date.now(),
			});
		}
		await message.forward(address);
	} catch (error) {
		console.error(`Error forwarding email to ${address}:`, error);
		message.setReject('Problem forwarding email');
	}
}

async function forward(message, env, addrList) {
	if (env.DEBUG === true) {
		console.debug('Forwarding address(es):', {
			forwardTo: addrList.join(','),
			timestamp: Date.now(),
		});
	}

	if (addrList.length > 0) {
		for (const addr of addrList) {
			await forwardMessage(message, env, addr);
		}
	} else {
		if (env.DEBUG === true) {
			console.debug('No FORWARD_EMAIL set, skipping forwarding step', {
				timestamp: Date.now(),
			});
		}
	}
}

async function process(message, env, parsedContent) {
	const webhookUrl = env.SLACK_WEBHOOK_URL;
	const subject = message.headers.get('subject');

	// Extract body content
	const body = convertContent(parsedContent.text, parsedContent.html);

	// Extract attachment info
	const attachments = filterAttachments(parsedContent.attachments || []);

	try {
		await sendToSlack(env, webhookUrl, message.from, subject, body, attachments);
	} catch (error) {
		console.error('Error sending to Slack:', error);
		message.setReject('Problem sending to Slack');
	}
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
				type: 'header',
				text: {
					type: 'plain_text',
					text: 'New Email Received!',
				},
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
				type: 'rich_text',
				elements: [
					{
						type: 'rich_text_section',
						elements: [
							{
								type: 'text',
								text: 'From:',
								style: {
									bold: true,
									italic: true,
								},
							},
							{
								type: 'text',
								text: ' ',
							},
							{
								type: 'text',
								text: from,
							},
						],
					},
					{
						type: 'rich_text_section',
						elements: [
							{
								type: 'text',
								text: 'Subject:',
								style: {
									bold: true,
									italic: true,
								},
							},
							{
								type: 'text',
								text: ' ',
							},
							{
								type: 'text',
								text: subject,
							},
						],
					},
				],
			},
			...(showAttachments ? [] : attachmentInfoBlocks),
			{
				type: 'divider',
			},
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: showRawBody ? `*_Body:_*\n\`\`\`${body.html}\`\`\`` : body.text,
				},
			},
			{
				type: 'divider',
			},
			...(showAttachments ? attachmentInfoBlocks : []),
		],
		// Legacy attachments field for additional optional info
		// https://docs.slack.dev/messaging/formatting-message-text#when-to-use-attachments
		...(hasAttachments && showAttachments
			? {
					attachments: attachments.map((att) => ({
						...(attachmentBlockColor ? { color: attachmentBlockColor } : {}),
						blocks: [
							{
								type: 'section',
								text: {
									type: 'mrkdwn',
									text: `*${att.filename}*`,
								},
							},
							{
								type: 'context',
								elements: [
									{
										type: 'mrkdwn',
										text: `*_Mime Type:_* \`${att.mimeType}\` \n*_Size:_* ${Math.round(att.content.length * 0.75)} bytes`,
									},
								],
							},
						],
					})),
				}
			: {}),
	};

	// Send to Slack
	await fetch(webhookUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(slackPayload),
	});
}
