# Luna Discord Bot - Project Documentation

## Overview
Luna is a comprehensive Discord moderation and utility bot designed to provide advanced moderation, multi-platform video downloading, 24/7 video and audio streaming, selfbot mass DM capabilities, and automated content posting. The project aims to offer a robust and feature-rich solution for Discord server management and entertainment, with a strong focus on automation and user convenience.

## User Preferences
- Fast, efficient code
- Comprehensive features with proper error handling
- Automated scheduling for content posting
- Clean, well-documented solutions

## System Architecture

### UI/UX Decisions
- Message Bookmark System: Users can bookmark messages via right-click context menu.
- Clean, attachment-only posting for RedGifs content without text labels.

### Technical Implementations
- **24/7 Video + Audio Streaming**: Utilizes `@dank074/discord-video-stream` and `discord.js-selfbot-v13` for continuous streaming from 1000+ sites, including automatic URL refreshing and connection recreation. Requires `DISCORD_VIDEO_TOKEN`.
- **24/7 Audio-Only Streaming**: Employs `yt-dlp` and `ffmpeg` to stream audio from any video site, transcoding to low-bandwidth PCM format (48kHz stereo @ 64kbps) with looping support.
- **Selfbot Mass DM**: Implements direct DM channel creation via Discord REST API using a user token, avoiding friend requests for undetectability. Includes intelligent delays for sending messages.
- **RedGifs Auto-Poster**: Fetches and posts videos from RedGifs niches/users. Features randomized video selection, intelligent multi-pass `ffmpeg` compression to guarantee videos are under 10MB (targeting 9.5MB, retrying at 8.5MB if needed), and scheduled posting.
- **Video Download System**: Supports downloads from YouTube, TikTok, Instagram, and RedGifs using `yt-dlp`.
- **Auto-Moderation**: Configurable automod features (spam, link filter, raid protection, channel-specific word filters), with role-based exemptions and server owner automatic exemption. Users with equal/higher roles than the bot are automatically exempt.
- **Invite Tracking**: Tracks invites and grants role rewards based on thresholds.
- **Permission System**: Enhanced hierarchy-based permission checks for commands, granting access to server owner, administrators, or members with roles at/above the bot's highest role.
- **Database Management**: Uses `sequelize` with `sqlite3` for persistent storage of configurations, schedules, warnings, and other bot data.

### Feature Specifications
- **Moderation**: Ban, kick, mute, warn, and advanced automod configurations.
- **Content Streaming**: `/videostream` for video+audio and `/stream` for audio-only.
- **Mass Messaging**: `/selfbot` for undetected mass DMs.
- **Automated Posting**: `/redgifsauto` for scheduled RedGifs content, `/redgifspost` for on-demand.
- **Utility**: Message bookmarking, server cloning, invite tracking, channel-specific word filters.

### System Design Choices
- **Modularity**: Commands are organized within the `botCommands/` directory.
- **Database-driven Configuration**: All major features and settings are stored and managed via a SQLite database using Sequelize ORM.
- **Robust Error Handling**: Comprehensive error logging and defensive programming, especially for external integrations and file operations.
- **Resource Management**: Proper cleanup of temporary files and resources to prevent leaks.

## External Dependencies
- **Discord API**: Core interaction via `discord.js` and `discord.js-selfbot-v13`.
- **Video Processing**: `yt-dlp-exec` for video downloads/info extraction, `ffmpeg-static` for video compression and audio transcoding.
- **HTTP Requests**: `axios` for general API calls.
- **Database**: `sequelize` ORM with `sqlite3` for local database storage.
- **Deployment**: `render.yaml` and `.python-version` for Render deployment.