import "dotenv/config";
import { decode } from "html-entities";
// @ts-expect-error The package does not expose its bundled declarations through `exports`.
import webhookPackage from "minimal-discord-webhook-node";
import RssFeedEmitter from "rss-feed-emitter";

declare const process: {
    arch: string;
    env: Record<string, string | undefined>;
    exit: (code?: number) => never;
    pid: number;
    platform: string;
    stdout: { isTTY?: boolean };
    uptime: () => number;
    versions: { bun?: string };
};

type LogColor = readonly [number, number, number];

/** Runtime limits that preserve the service's existing polling and filtering behavior. */
const MAX_POST_AGE_MS = 12 * 60 * 60 * 1000;
const DISCORD_DESCRIPTION_LIMIT = 4096;
const REFRESH_INTERVAL_MS = 60_000;

/** Small ANSI logger inspired by the API service without its HTTP-specific presentation. */
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const CYAN = [34, 211, 238] as const;
const GREEN = [74, 222, 128] as const;
const MAGENTA = [192, 132, 252] as const;
const RED = [248, 113, 113] as const;
const GRAY = [148, 163, 184] as const;
const colorEnabled = process.stdout.isTTY !== false && process.env.NO_COLOR === undefined;

const paint = (color: LogColor, text: string, bold = false): string => {
    if (!colorEnabled) {
        return text;
    }
    const [red, green, blue] = color;
    return `${bold ? BOLD : ""}\x1b[38;2;${red};${green};${blue}m${text}${RESET}`;
};

const formatError = (cause: unknown): string =>
    cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);

const log = {
    error(message: string, cause?: unknown): void {
        const detail = cause === undefined ? "" : `\n${paint(GRAY, formatError(cause))}`;
        console.error(`${paint(RED, "◆ ERROR", true)} ${message}${detail}`);
    },
    ok(message: string): void {
        console.log(`${paint(GREEN, "✦ SENT", true)} ${message}`);
    },
    ready(feedName: string): void {
        const rule = paint(MAGENTA, "═".repeat(52), true);
        const runtime = process.versions.bun ? `Bun ${process.versions.bun}` : "JavaScript";
        console.log(`\n${rule}`);
        console.log(paint(CYAN, "  REDDIT  →  DISCORD", true));
        console.log(rule);
        console.log(`${paint(MAGENTA, ">>", true)} Feed:     ${paint(CYAN, feedName, true)}`);
        console.log(`${paint(GREEN, ">>", true)} Polling:  every 60 seconds`);
        console.log(
            `${paint(CYAN, ">>", true)} Runtime:  ${runtime} · ${process.platform} ${process.arch}`
        );
        console.log(`${paint(GRAY, ">>", true)} Process:  PID ${process.pid}`);
        console.log(`${paint(MAGENTA, ">>", true)} Boot:     ${process.uptime().toFixed(2)}s`);
        console.log(`${rule}\n`);
    },
};

/** Environment variables required to configure the feed and Discord webhook. */
const REQUIRED_ENV_VARS = [
    "WebhookUrl",
    "WebhookUsername",
    "WebhookAvatar",
    "EmbedAuthorImageUrl",
    "RssUrl",
    "RssName",
] as const;

/** Fields from a parsed Reddit feed entry that are used to build a notification. */
interface FeedItem {
    author?: string;
    description?: string;
    guid?: string;
    image?: { url?: string };
    link?: string;
    pubdate?: Date | string;
    title?: string;
}

/** Restores the inherited event API omitted by rss-feed-emitter's declarations. */
interface TypedFeedEmitter extends RssFeedEmitter {
    on: (eventName: string, listener: (value: unknown) => void) => this;
}

/** Runtime API exposed by minimal-discord-webhook-node's message builder. */
interface MessageBuilderInstance {
    setColor: (color: string) => this;
    setDescription: (description: string) => this;
    setFooter: (text: string, iconUrl?: string) => this;
    setThumbnail: (url: string) => this;
    setTitle: (title: string) => this;
    setURL: (url: string) => this;
}

/** Runtime API exposed by minimal-discord-webhook-node's webhook client. */
interface WebhookInstance {
    send: (message: MessageBuilderInstance) => Promise<void>;
    setAvatar: (url: string) => this;
    setUsername: (username: string) => this;
}

const { MessageBuilder, Webhook } = webhookPackage as {
    MessageBuilder: new () => MessageBuilderInstance;
    Webhook: new (url: string) => WebhookInstance;
};

/** Loads all configuration at startup and reports missing values together. */
const getEnvironment = (): Record<(typeof REQUIRED_ENV_VARS)[number], string> => {
    const missingVariables = REQUIRED_ENV_VARS.filter((name) => !process.env[name]?.trim());
    if (missingVariables.length > 0) {
        throw new Error(`Missing environment variables: ${missingVariables.join(", ")}`);
    }

    return Object.fromEntries(
        REQUIRED_ENV_VARS.map((name) => [name, process.env[name]?.trim()])
    ) as Record<(typeof REQUIRED_ENV_VARS)[number], string>;
};

let environment: ReturnType<typeof getEnvironment>;
try {
    environment = getEnvironment();
} catch (error) {
    log.error("Invalid configuration", error);
    process.exit(1);
}

const hook = new Webhook(environment.WebhookUrl)
    .setUsername(environment.WebhookUsername)
    .setAvatar(environment.WebhookAvatar);

/** Converts the Reddit HTML excerpt into a Discord-safe description. */
const extractDescription = (item: FeedItem): string | undefined => {
    const parts: string[] = [];
    const imageUrl = item.image?.url;

    if (imageUrl && item.guid) {
        const postId = item.guid.replace(/^t\d_/, "");
        parts.push(`[**Image**](https://www.reddit.com/gallery/${postId})`);
    }

    const markdown = item.description?.match(/<div class="md">([\s\S]*?)<\/div>/)?.[1];
    if (markdown) {
        const text = decode(
            markdown
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/p>/gi, "\n\n")
                .replace(/<[^>]*>/g, "")
                .trim()
        );

        if (text) {
            parts.push(text);
        }
    }

    const description = parts.join("\n");
    if (!description) {
        return undefined;
    }

    // Discord rejects an entire webhook when an embed description exceeds 4096 characters.
    return description.length <= DISCORD_DESCRIPTION_LIMIT
        ? description
        : `${description.slice(0, DISCORD_DESCRIPTION_LIMIT - 1).trimEnd()}…`;
};

/** Rejects old entries while allowing entries whose feed timestamp is missing or malformed. */
const isRecentPost = (publishedAt: FeedItem["pubdate"]): boolean => {
    if (!publishedAt) {
        return true;
    }

    const timestamp = new Date(publishedAt).getTime();
    return Number.isNaN(timestamp) || Date.now() - timestamp <= MAX_POST_AGE_MS;
};

/** Builds and sends one Discord embed for a complete Reddit feed entry. */
const sendWebhook = async (item: FeedItem): Promise<void> => {
    const description = extractDescription(item);
    if (!(description && item.title && item.link)) {
        return;
    }

    const embed = new MessageBuilder();
    embed
        .setTitle(item.title.slice(0, 256))
        .setURL(item.link)
        .setColor("#FF4500")
        .setDescription(description)
        .setFooter(
            `${item.author ?? "Unknown author"} | ${new Date().toLocaleString("en-US", {
                day: "numeric",
                hour: "numeric",
                hour12: true,
                minute: "2-digit",
                month: "long",
                year: "numeric",
            })}`,
            environment.EmbedAuthorImageUrl
        );

    if (item.image?.url) {
        embed.setThumbnail(item.image.url);
    }

    await hook.send(embed);
    log.ok(item.title);
};

/** Starts the feed listener without replaying entries returned by its initial request. */
const setupFeed = (): void => {
    const feeder = new RssFeedEmitter({ skipFirstLoad: true }) as TypedFeedEmitter;

    feeder.on("error", (error) => {
        log.error("RSS feed error", error);
    });
    feeder.on(environment.RssName, (value) => {
        const item = value as FeedItem;
        if (!isRecentPost(item.pubdate)) {
            return;
        }

        sendWebhook(item).catch((error: unknown) => {
            log.error("Discord webhook failed", error);
        });
    });

    feeder.add({
        eventName: environment.RssName,
        refresh: REFRESH_INTERVAL_MS,
        url: environment.RssUrl,
    });

    log.ready(environment.RssName);
};

try {
    setupFeed();
} catch (error) {
    log.error("Could not start RSS monitoring", error);
    process.exit(1);
}
