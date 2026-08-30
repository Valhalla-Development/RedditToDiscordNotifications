// @ts-expect-error no types available
import { MessageBuilder, Webhook } from "minimal-discord-webhook-node";
import RssFeedEmitter from "rss-feed-emitter";
import "dotenv/config";
import { decode } from "html-entities";

/** List of required environment variables */
const requiredEnvVars = [
    "WebhookUrl",
    "WebhookUsername",
    "WebhookAvatar",
    "EmbedAuthorImageUrl",
    "RssUrl",
    "RssName",
];

/**
 * Checks if all required environment variables are set.
 * @throws Error If any required variable is missing.
 */
const checkRequiredEnvVars = () => {
    const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);
    if (missingVars.length) {
        throw new Error(`Missing environment variables: ${missingVars.join(", ")}`);
    }
};

// Check environment variables and exit if any are missing
try {
    checkRequiredEnvVars();
} catch (error) {
    console.error(error);
    process.exit(1);
}

// Initialize Discord webhook
const hook = new Webhook(process.env.WebhookUrl!)
    .setUsername(process.env.WebhookUsername!)
    .setAvatar(process.env.WebhookAvatar!);

/**
 * Sets up and monitors an RSS feed.
 */
const setupFeed = () => {
    try {
        const feeder = new RssFeedEmitter({ skipFirstLoad: true });
        feeder.on("error", console.error);
        feeder.add({
            eventName: process.env.RssName!,
            refresh: 60_000,
            url: process.env.RssUrl!,
        });

        feeder.on("AirReps", async (res) => {
            // Ignore posts older than 12 hours
            if ((Date.now() - new Date(res.pubDate).getTime()) / 3_600_000 > 12) {
                return;
            }
            await processWebhook(res);
        });

        console.log("RSS feed monitoring started...");
    } catch (error) {
        console.error("Error setting up RSS feed:", error);
        setTimeout(setupFeed, 10_000);
    }
};

/**
 * Processes the RSS feed item and sends a Discord webhook.
 * @async
 * @param res - The RSS feed item.
 */
const processWebhook = async (res: {
    description: string;
    title: string;
    link: string;
    author: string;
    image: { url?: string };
    guid: string;
}) => {
    const extractedText = extractTextFromDescription(res);
    if (!extractedText) {
        return;
    }
    const embed = new MessageBuilder()
        .setTitle(res.title)
        .setURL(res.link)
        .setColor("#FF4500")
        .setDescription(extractedText.join("\n"))
        .setFooter(
            `${res.author} | ${new Date().toLocaleString("en-US", {
                day: "numeric",
                hour: "numeric",
                hour12: true,
                minute: "2-digit",
                month: "long",
                year: "numeric",
            })}`,
            process.env.EmbedAuthorImageUrl!
        );

    if (res.image.url) {
        embed.setThumbnail(res.image.url);
    }

    try {
        await hook.send(embed);
    } catch (error) {
        console.error("Error sending Discord webhook:", error);
    }
};

/**
 * Extracts text content from the RSS feed item description.
 * @param {Object} res - The RSS feed item.
 * @returns {string[] | null} Array of an extracted text or null if no content.
 */
const extractTextFromDescription = (res: {
    description: string;
    image: { url?: string };
    guid: string;
}): string[] | null => {
    const arr: string[] = [];

    // Add an image link if present
    if (res.image.url) {
        arr.push(`[**Image**](https://www.reddit.com/gallery/${res.guid.replace(/^t\d_/, "")})`);
    }

    // Extract and decode text content
    const mdMatch = res.description.match(/<div class="md">([\s\S]*?)<\/div>/);
    if (mdMatch?.[1]) {
        arr.push(
            decode(
                mdMatch[1]
                    .replace(/<p>/g, "\n\n")
                    .replace(/<[^>]*>/g, "")
                    .trim()
            )
        );
    }

    return arr.length ? arr : null;
};

// Start the RSS feed monitoring
setupFeed();
