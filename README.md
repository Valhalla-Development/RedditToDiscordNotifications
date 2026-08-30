<div align="center">
  <img id="top" src="https://share.valhalladev.org/u/RedditToDiscordNotifications.png" width="100%" alt="Reddit to Discord Notifications Banner">

# 🔔 Reddit to Discord Notifications

  <p>
    <a href="https://discord.gg/Q3ZhdRJ"><img src="https://img.shields.io/discord/495602800802398212.svg?colorB=5865F2&logo=discord&logoColor=white&style=for-the-badge" alt="Discord"></a>
    <a href="https://github.com/Valhalla-Development/RedditToDiscordNotifications/stargazers"><img src="https://img.shields.io/github/stars/Valhalla-Development/RedditToDiscordNotifications.svg?style=for-the-badge&color=yellow" alt="Stars"></a>
    <a href="https://github.com/Valhalla-Development/RedditToDiscordNotifications/network/members"><img src="https://img.shields.io/github/forks/Valhalla-Development/RedditToDiscordNotifications.svg?style=for-the-badge&color=orange" alt="Forks"></a>
    <a href="https://github.com/Valhalla-Development/RedditToDiscordNotifications/issues"><img src="https://img.shields.io/github/issues/Valhalla-Development/RedditToDiscordNotifications.svg?style=for-the-badge&color=red" alt="Issues"></a>
    <a href="https://github.com/Valhalla-Development/RedditToDiscordNotifications/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Valhalla-Development/RedditToDiscordNotifications.svg?style=for-the-badge&color=blue" alt="License"></a>
    <br>
    <a href="https://app.codacy.com/gh/Valhalla-Development/RedditToDiscordNotifications/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade"><img src="https://img.shields.io/codacy/grade/6ab130f673e14f3fbbcd8cceeda70210?style=for-the-badge&color=brightgreen" alt="Codacy"></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/Made%20with-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="Made with TypeScript"></a>
    <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Powered%20by-Bun-black?style=for-the-badge&logo=bun&logoColor=white" alt="Powered by Bun"></a>
  </p>

  <p><em>Automate sending Reddit RSS feed updates to your Discord server with real-time notifications!</em></p>
</div>

---
## 🌟 About

This project provides a seamless bridge between Reddit and Discord, automatically forwarding new posts from your chosen subreddit RSS feeds to designated Discord channels through webhooks.

## 🎮 Features

<table>
  <tr>
    <td width="50%">
      <h3>🔄 Real-time Updates</h3>
      <p>Monitor Reddit RSS feeds with 60-second refresh intervals for near real-time notifications.</p>
    </td>
    <td width="50%">
      <h3>🎨 Rich Components</h3>
      <p>Structured Discord notifications with linked titles, author images, media previews, and timestamps.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>⚡ Performance Optimized</h3>
      <p>Built with Bun for blazing-fast performance and efficient resource usage.</p>
    </td>
    <td width="50%">
      <h3>🛡️ Error Handling</h3>
      <p>Robust error handling with automatic reconnection and detailed logging.</p>
    </td>
  </tr>
</table>

## 🚀 Requirements

- [Bun](https://bun.sh/)
- Discord Webhook URL
- Reddit RSS Feed URL

## 🛠️ Setup Guide

1. Clone the repository:
   ```bash
   git clone https://github.com/Valhalla-Development/RedditToDiscordNotifications.git
   cd RedditToDiscordNotifications
   ```

2. Install Bun:
   - Mac/Linux:
     ```bash
     curl -fsSL https://bun.sh/install | bash
     ```
   - Windows:
     ```powershell
     powershell -c "irm bun.sh/install.ps1 | iex"
     ```

3. Install dependencies:
    ```bash
    bun install
    ```

4. Copy `.env.example` to `.env` and configure your settings:
    ```env
    WebhookUrl=your_discord_webhook_url
    WebhookUsername=desired_webhook_username
    WebhookAvatar=webhook_avatar_url
    EmbedAuthorImageUrl=small_top_right_image_url
    RssUrl=reddit_rss_feed_url
    RssName=feed_name
    ```

5. Start the service:
    ```bash
    bun start
    ```

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📜 License

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- [rss-feed-emitter](https://github.com/filipedeschamps/rss-feed-emitter) for RSS feed monitoring
- [minimal-discord-webhook-node](https://github.com/Lebyy/minimal-discord-webhook-node) for Discord webhook integration
- [Bun](https://bun.sh/) for the blazing fast JavaScript runtime

---

<div align="center">

💻 Crafted with ❤️ by [Valhalla-Development](https://github.com/Valhalla-Development)

[🐛 Report Bug](https://github.com/Valhalla-Development/RedditToDiscordNotifications/issues/new?assignees=&labels=bug&projects=&template=bug_report.yml&title=%5BBUG%5D+Short+Description) | [💡 Request Feature](https://github.com/Valhalla-Development/RedditToDiscordNotifications/issues/new?assignees=&labels=enhancement&projects=&template=feature_request.yml&title=%5BFeature%5D+Short+Description)

<a href="#top">🔝 Back to Top</a>
</div>
