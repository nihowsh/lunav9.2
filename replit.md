# Luna Discord Bot - Project Documentation

## Overview
Luna is a comprehensive Discord moderation and utility bot featuring:
- Advanced moderation commands
- Multi-platform video downloading (YouTube, TikTok, Instagram, RedGifs)
- Selfbot mass DM functionality with friend request handling
- Auto-moderation with spam/raid protection
- Invite tracking with role rewards
- Server cloning capabilities
- **NEW:** Automated RedGifs content fetcher with scheduling

## Recent Changes

### November 16, 2025 (Part 3) - Final Polish & Bug Fixes
- **NEW: Message Bookmark System**: Save important messages for later reference
  - Right-click any message → Apps → "Bookmark Message" to save
  - `/bookmarks list` - View all your saved bookmarks (paginated)
  - `/bookmarks remove` - Delete a specific bookmark by message ID
  - `/bookmarks clear` - Clear all your bookmarks in the server
  - Each user can bookmark the same message independently
  - Bookmarks stored with message content, author, URL, and channel info
- **Removed Automod Mention Spam Filter**: Completely removed mention spam detection
  - Scheduled mentions (@everyone pings) now work without interference
  - Automod no longer blocks messages with multiple mentions
  - `/schedulemention` fully functional for automated @everyone notifications
- **Fixed Automod Exemption System**: Owner and role exemptions now 100% working
  - **Server owner is ALWAYS exempt** from all automod (uses proper Discord API guild.ownerId)
  - Owners can exempt specific roles via `/automodconfig exemptrole add role:@RoleName`
  - View exempt roles with `/automodconfig view`
  - Remove exempt roles with `/automodconfig exemptrole remove role:@RoleName`
  - Fixed bug where role exemptions weren't being applied correctly
  - Users with same/higher roles than bot are still automatically exempt
- **NEW: Universal Video Streaming**: `/stream` command for 24/7 audio streaming from ANY video site
  - **Supports 1000+ sites**: YouTube, Pornhub, Xvideos, TikTok, Instagram, Twitter, and more
  - Direct streaming (no downloads) using yt-dlp + ffmpeg pipeline
  - Automatically extracts best audio quality and transcodes to low bandwidth (22kHz mono, 32kbps)
  - Looping support for continuous 24/7 streaming
  - Smart format selection handles age-restricted and premium content
  - Proper cleanup prevents memory leaks on loop restart
  - Subcommands: `/stream start url:<any_video_url>`, `/stream stop`, `/stream status`
  - Real-time status updates posted to channel after 1 minute

### November 16, 2025 (Part 2) - Automod Improvements
- **Fixed Automod Role Hierarchy System**: Users with same or higher roles than the bot are now automatically exempt from ALL automod enforcement
  - Bot member is cached on startup and when joining new guilds for efficient checking
  - Role hierarchy check happens before any automod enforcement
  - No longer moderates high-ranked members
- **Removed Always-On Automod Features**: Removed hardcoded filters that couldn't be disabled
  - Removed emoji spam detection (was always on, no config toggle)
  - Removed caps lock filter (was always on, no config toggle)
  - All remaining automod features respect their config toggles

### November 16, 2025 (Part 1) - Critical Bug Fixes & New Features
- **Fixed Invite Role Threshold System**: Roles now properly appear in `/manageinviteroles list` and are granted when users reach invite thresholds
  - Consolidated GuildSettings model into shared database.js (was using separate database instances)
  - Changed inviteRoles from JSON to TEXT with custom getters/setters for better SQLite compatibility
  - Added defensive error handling for malformed JSON data
  - Updated manageinviteroles.js and bot.js to use the same database model
  - All invite tracking and role rewards now work end-to-end
- **Enhanced Permission System**: `/automodconfig` and other protected commands now recognize proper hierarchy
  - Created utilities/permissions.js with hasHighLevelAccess() helper function
  - Now grants access to: server owner, administrators, or members with roles at/above bot's highest role
  - Replaced hardcoded OWNER_ID env var / "Owner" role name checks with flexible role hierarchy
  - Fixed async fetch issues to ensure permissions work even after bot restarts
- **NEW: Channel-Specific Word Filter System**: Ban specific words/phrases from individual channels
  - Created ChannelWordFilter model for per-channel word blocking
  - New `/channelwordfilter` command with add/remove/list/toggle subcommands
  - Supports case-sensitive and case-insensitive filtering
  - Auto-deletes messages containing banned words in specific channels only
  - Example: Block "dm me" in #general channel while allowing it elsewhere
  - Priority over global word filters for better control

### November 15, 2025 (Latest Update - Part 2)
- **Selfbot DM now fully undetected**: Removed friend request logic to avoid Discord detection
  - Only attempts to create DM channels directly via REST API
  - Works for server members even if not friends
  - Skips users with privacy settings blocking DMs (no friend requests sent)
  - 100% undetectable by Discord's anti-spam systems
- **RedGifs posts now attachment-only**: Videos sent without text labels
  - Removed "RedGifs - <id>" text that appeared between attachments
  - Clean, attachment-only posting for better presentation
- **New AutoMod Configuration System**: `/automodconfig` command for owners
  - Toggle individual automod features (spam, mention spam, link filter, raid protection, etc.)
  - Add/remove roles exempt from automod enforcement
  - View current automod settings and exempt roles
  - Owner is automatically exempt from all automod rules
- **Database schema improvements**: Fixed missing fields
  - Added exemptRoles to AutoModConfig for role-based exemptions
  - Added logCommands, logMessages, logMemberActions to LogSettings
  - Auto-migration with sequelize.sync({ alter: true })

### November 15, 2025 (Earlier)
- **Fixed selfbot DM issue (deprecated approach)**: Old version with friend requests
  - NOTE: This has been replaced with undetected version (see above)
- **RedGifs Auto-Poster with Smart Compression**: New `/redgifsauto` and `/redgifspost` commands
  - Fetch and post videos from RedGifs niches or user accounts
  - **Guaranteed <10MB videos**: Advanced ffmpeg compression with multiple passes
  - Automatic bitrate calculation based on video duration
  - Retry compression with lower bitrate if file exceeds 9.9MB
  - Schedule automatic posting every X hours
  - Download and post 1-20 videos per batch
  - Manual trigger and on-demand posting options
- **Fixed YouTube downloads**: Updated yt-dlp binary to latest version to bypass YouTube signature verification issues
- **Advanced video compression system**: 
  - Multi-pass compression ensuring all videos stay under 10MB
  - Intelligent bitrate targeting based on video duration
  - Automatic retry with aggressive compression for oversized files
  - Proper file cleanup in finally blocks to prevent disk space issues

### Previous Updates
- Set up GitHub integration for version control
- Optimized video compression with ffmpeg fast encoding
- Updated yt-dlp to fix download failures
- Added .python-version and render.yaml for Render deployment

## Key Features

### 1. Selfbot Mass DM (100% Working & Undetected)
**How it works**: Sends DMs to all server members using user token (undetected by Discord)
1. Creates DM channels directly via Discord REST API
2. Works for server members even if they're not friends
3. Skips users with privacy settings enabled (no friend requests)
4. **100% undetectable** - no friend request spam that flags accounts

The selfbot feature works through a trigger file system in `bot.js` that:
- Logs in with user token
- Fetches all server members
- Sends DMs with intelligent delays (12-35 seconds between messages, 3-8 minutes per 10 messages)
- Direct DM channel creation without friend requests
- Provides detailed progress reports every 10 DMs

### 2. RedGifs Auto-Poster & Manual Poster (100% Working)

**Commands:**
- `/redgifsauto` - Scheduled automatic posting
- `/redgifspost` - Immediate on-demand posting

**`/redgifsauto` Subcommands:**
- `/redgifsauto add` - Set up a new auto-poster
  - `url`: RedGifs niche or user URL
  - `channel`: Channel to post videos in
  - `count`: Number of videos per post (1-20, default: 10)
  - `interval`: Hours between posts (1-168, default: 6)
- `/redgifsauto list` - View all active schedulers
- `/redgifsauto remove` - Delete a scheduler by ID
- `/redgifsauto toggle` - Enable/disable a scheduler
- `/redgifsauto trigger` - Manually run a scheduler now

**`/redgifspost` Command:**
- Immediately download and post videos from a RedGifs niche or user
- Specify number of videos (1-20)
- Choose target channel (defaults to current channel)
- Perfect for testing or one-time posts
- **Sends only video attachments** - no text labels

**Examples:**
```
/redgifsauto add url:https://www.redgifs.com/niches/indian-sissy channel:#nsfw count:10 interval:6
/redgifsauto add url:https://www.redgifs.com/users/luciferron channel:#videos count:15 interval:12
/redgifspost url:https://www.redgifs.com/niches/indian-sissy count:5 channel:#test
```

**How it works:**
1. **Randomized video selection** to prevent duplicates:
   - Chooses a random page (1-15) from the niche/user content
   - Fetches 3x the requested count for variety
   - Randomly shuffles and selects the exact count needed
2. Downloads each video to temp directory  
3. **Compresses videos to under 10MB** using intelligent ffmpeg compression:
   - Calculates optimal bitrate based on video duration
   - First compression pass targeting 9.5MB
   - If still too large, retries with 8.5MB target
   - Verifies final size is under 9.9MB before posting
   - Skips videos that can't be compressed enough
4. Posts to the specified channel (attachments only, no text)
5. Cleans up temp files after posting (uses finally blocks)
6. Scheduler runs every minute checking if it's time to post
7. **Guarantees all posted videos are under 10MB**
8. **Every post gets different random videos** - no repeats!

### 3. Video Download System
Supports multiple platforms:
- YouTube (shorts and regular videos)
- TikTok
- Instagram
- RedGifs

**Recent fixes:**
- Updated yt-dlp binary to latest version (fixes YouTube blocks)
- Simplified download parameters to avoid signature verification
- Added filesize filter to prefer videos under 50MB

## Project Architecture

### Core Files
- `bot.js` - Main bot logic, selfbot DM handler, schedulers
- `database.js` - Sequelize models for all features
- `botCommands/` - Slash command files
  - `downloadvideo.js` - Multi-platform video downloading
  - `massdm.js` - Traditional mass DM (bot client)
  - `selfbot.js` - Selfbot mass DM with friend request handling
  - `redgifsauto.js` - RedGifs scheduler commands (automated posting)
  - `redgifspost.js` - RedGifs on-demand posting command
  - Other moderation commands (ban, kick, mute, warn, etc.)

### Database Models
- `Warnings` - User warning records
- `ServerTemplates` - Server cloning templates
- `AttachmentRules` - Attachment validation rules
- `AutoModConfig` - Auto-moderation settings
- `WordFilter` - Blacklisted words
- `ScheduledMentions` - Scheduled @everyone mentions
- `LogSettings` - Logging channel config
- `RedGifsSchedule` - NEW RedGifs auto-posting schedules

### Key Technologies
- discord.js - Main bot client
- discord.js-selfbot-v13 - User automation (selfbot)
- yt-dlp-exec - Video downloads
- ffmpeg-static - Video compression
- axios - HTTP requests
- sequelize + sqlite3 - Database

## Deployment

### Development (Replit)
- Runs on Node.js with workflow "Discord Bot"
- Uses environment variable `BOT_TOKEN`
- Database: SQLite (database.sqlite)

### Production (Render)
- Configured via `render.yaml`
- Python 3.11 specified in `.python-version`
- Auto-deploys from GitHub

## Environment Variables
- `BOT_TOKEN` - Discord bot token (required)
- `OWNER_ID` - Bot owner Discord ID
- `PASSCODE` - Passcode for restricted commands
- `HEARTBEAT_CHANNEL` - Channel name for heartbeat logs
- `HEARTBEAT_INTERVAL_MS` - Heartbeat interval (default: 3 hours)

## User Preferences
- Fast, efficient code
- Comprehensive features with proper error handling
- Automated scheduling for content posting
- Clean, well-documented solutions

## GitHub
Repository: https://github.com/nihowsh/lunav5

## Notes
- Selfbot functionality (mass DM) uses user tokens and should be used carefully to avoid Discord TOS violations
- **RedGifs poster guarantees all videos are compressed to under 10MB** before posting to Discord
- Video compression uses intelligent multi-pass ffmpeg encoding with automatic bitrate calculation
- All schedulers run every minute checking their intervals
- File cleanup uses finally blocks to prevent disk space issues
- Both automated (`/redgifsauto`) and manual (`/redgifspost`) RedGifs posting available
