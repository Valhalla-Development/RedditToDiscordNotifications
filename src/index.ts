import { parseAtomFeed } from "feedsmith";
import { decode } from "html-entities";

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

interface DiscordTextDisplay {
    content: string;
    type: 10;
}

interface DiscordSeparator {
    divider: boolean;
    spacing: 1;
    type: 14;
}

interface DiscordMediaGallery {
    items: Array<{
        description: string;
        media: { url: string };
    }>;
    type: 12;
}

type DiscordContainerComponent = DiscordMediaGallery | DiscordSeparator | DiscordTextDisplay;

/** Runtime limits that preserve the service's existing polling and filtering behavior. */
const MAX_POST_AGE_MS = 12 * 60 * 60 * 1000;
const DISCORD_COMPONENTS_V2_FLAG = 32_768;
const DISCORD_TEXT_DISPLAY_LIMIT = 4000;
const REDDIT_ORANGE = 0xff_45_00;
const FEED_REQUEST_TIMEOUT_MS = 15_000;
const MAX_WEBHOOK_ATTEMPTS = 3;
const REFRESH_INTERVAL_MS = 60_000;
const USER_AGENT = "RedditToDiscordNotifications feed monitor";

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

const webhookUrl = new URL(environment.WebhookUrl);
webhookUrl.searchParams.set("with_components", "true");

/** Posts a Discord payload and follows bounded server-provided rate-limit delays. */
const postDiscordWebhook = async (payload: unknown, attempt = 1): Promise<void> => {
    const response = await fetch(webhookUrl, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
    });

    if (response.ok) {
        return;
    }

    const responseText = await response.text();
    if (response.status !== 429 || attempt >= MAX_WEBHOOK_ATTEMPTS) {
        throw new Error(`Discord returned ${response.status}: ${responseText.slice(0, 500)}`);
    }

    let retryAfterSeconds = Number(response.headers.get("Retry-After"));
    try {
        const body = JSON.parse(responseText) as { retry_after?: unknown };
        if (typeof body.retry_after === "number") {
            retryAfterSeconds = body.retry_after;
        }
    } catch {
        // Fall back to the Retry-After header when Discord does not return JSON.
    }

    const retryDelayMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(retryAfterSeconds, 0) * 1000
        : 1000;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    await postDiscordWebhook(payload, attempt + 1);
};

/** Converts the Reddit HTML excerpt into a Discord-safe description. */
const extractDescription = (item: FeedItem): string | undefined => {
    const markdown = item.description?.match(/<div class="md">([\s\S]*?)<\/div>/)?.[1];
    if (!markdown) {
        return undefined;
    }

    const description = decode(
        markdown
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n\n")
            .replace(/<[^>]*>/g, "")
            .trim()
    );
    if (!description) {
        return undefined;
    }

    // Text displays reject content beyond Discord's per-component character limit.
    return description.length <= DISCORD_TEXT_DISPLAY_LIMIT
        ? description
        : `${description.slice(0, DISCORD_TEXT_DISPLAY_LIMIT - 1).trimEnd()}…`;
};

const escapeMarkdownLinkText = (value: string): string => value.replace(/[\\[\]]/g, "\\$&");

const formatPostDate = (publishedAt: FeedItem["pubdate"]): string => {
    const parsedDate = publishedAt ? new Date(publishedAt) : new Date();
    const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    return date.toLocaleString("en-US", {
        day: "numeric",
        hour: "numeric",
        hour12: true,
        minute: "2-digit",
        month: "long",
        year: "numeric",
    });
};

/** Rejects old entries while allowing entries whose feed timestamp is missing or malformed. */
const isRecentPost = (publishedAt: FeedItem["pubdate"]): boolean => {
    if (!publishedAt) {
        return true;
    }

    const timestamp = new Date(publishedAt).getTime();
    return Number.isNaN(timestamp) || Date.now() - timestamp <= MAX_POST_AGE_MS;
};

/** Converts Feedsmith's Atom entry shape into the fields used by the notifier. */
const normalizeFeedItem = (
    entry: NonNullable<ReturnType<typeof parseAtomFeed>["entries"]>[number]
): FeedItem => {
    const imageUrl = entry.media?.thumbnails?.[0]?.url;
    const alternateLink = entry.links?.find((link) => !link.rel || link.rel === "alternate");

    return {
        author: entry.authors?.[0]?.name,
        description: entry.content ?? entry.summary,
        guid: entry.id,
        image: imageUrl ? { url: imageUrl } : undefined,
        link: alternateLink?.href ?? entry.links?.[0]?.href,
        pubdate: entry.published ?? entry.updated,
        title: entry.title,
    };
};

/** Fetches and parses one Reddit Atom feed snapshot with a bounded request time. */
const fetchFeed = async (): Promise<FeedItem[]> => {
    const response = await fetch(environment.RssUrl, {
        headers: {
            Accept: "application/atom+xml, application/xml;q=0.9",
            "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(FEED_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new Error(
            `Reddit returned ${response.status}: ${(await response.text()).slice(0, 500)}`
        );
    }

    const feed = parseAtomFeed(await response.text());
    return (feed.entries ?? []).map(normalizeFeedItem);
};

const getItemId = (item: FeedItem): string | undefined => item.guid ?? item.link;

const collectItemIds = (items: FeedItem[]): Set<string> =>
    new Set(items.map(getItemId).filter((itemId): itemId is string => itemId !== undefined));

/** Builds and sends one Components V2 notification for a complete Reddit feed entry. */
const sendWebhook = async (item: FeedItem): Promise<void> => {
    const description = extractDescription(item);
    const imageUrl = item.image?.url;
    if (!(item.title && item.link && (description || imageUrl))) {
        return;
    }

    const title = item.title.replace(/\s+/g, " ").trim().slice(0, 256);
    const containerComponents: DiscordContainerComponent[] = [
        {
            content: `## [${escapeMarkdownLinkText(title)}](${item.link})`,
            type: 10,
        },
        {
            content: `-# Posted by ${item.author ?? "Unknown author"} • ${formatPostDate(item.pubdate)}`,
            type: 10,
        },
        {
            divider: true,
            spacing: 1,
            type: 14,
        },
    ];

    if (description) {
        containerComponents.push({ content: description, type: 10 });
    }

    if (imageUrl) {
        containerComponents.push({
            items: [
                {
                    description: title,
                    media: { url: imageUrl },
                },
            ],
            type: 12,
        });
    }

    const payload = {
        allowed_mentions: { parse: [] },
        avatar_url: environment.WebhookAvatar,
        components: [
            {
                accent_color: REDDIT_ORANGE,
                components: containerComponents,
                type: 17,
            },
        ],
        flags: DISCORD_COMPONENTS_V2_FLAG,
        username: environment.WebhookUsername,
    };

    await postDiscordWebhook(payload);
    log.ok(item.title);
};

let knownItemIds = new Set<string>();

/** Sends newly observed entries oldest-first, preserving the feed's previous behavior. */
const processNewItems = async (items: FeedItem[], previousItemIds: Set<string>): Promise<void> => {
    for (const item of items.toReversed()) {
        const itemId = getItemId(item);
        if (!(itemId && !previousItemIds.has(itemId) && isRecentPost(item.pubdate))) {
            continue;
        }

        try {
            // biome-ignore lint/performance/noAwaitInLoops: Sequential delivery respects rate limits.
            await sendWebhook(item);
        } catch (error) {
            log.error("Discord webhook failed", error);
        }
    }
};

/** Polls after each completed request so slow responses cannot create overlapping work. */
const pollFeed = async (): Promise<void> => {
    try {
        const items = await fetchFeed();
        const previousItemIds = knownItemIds;
        knownItemIds = collectItemIds(items);
        await processNewItems(items, previousItemIds);
    } catch (error) {
        log.error("RSS feed error", error);
    } finally {
        setTimeout(pollFeed, REFRESH_INTERVAL_MS);
    }
};

/** Seeds feed history before monitoring so startup never replays existing entries. */
const setupFeed = async (): Promise<void> => {
    const initialItems = await fetchFeed();
    knownItemIds = collectItemIds(initialItems);
    log.ready(environment.RssName);
    setTimeout(pollFeed, REFRESH_INTERVAL_MS);
};

setupFeed().catch((error: unknown) => {
    log.error("Could not start RSS monitoring", error);
    process.exit(1);
});
