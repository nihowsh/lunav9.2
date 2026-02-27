const express = require("express");
const app = express();

app.use((req, res, next) => {
  res.setTimeout(5000, () => {
    console.log("Request timeout");
    res.status(503).send("Timeout");
  });
  next();
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});


app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server running");
});

const { Client, GatewayIntentBits, Collection, Partials, EmbedBuilder } = require('discord.js');
const { Client: SelfbotClient } = require('discord.js-selfbot-v13');
const Sequelize = require('sequelize');
const fs = require('fs');
const path = require('path');
const { AttachmentRules: SharedAttachmentRules, AutoModConfig, WordFilter, ScheduledMentions, LogSettings, Warnings, RedGifsSchedule, GuildSettings, ChannelWordFilter } = require('./database');
require('dotenv').config();

// ============== CONFIGURATION ==============
let config = {};
if (fs.existsSync('config.json')) {
  config = JSON.parse(fs.readFileSync('config.json'));
}

const BOT_TOKEN = process.env.BOT_TOKEN || config.token;
const OWNER_ID = process.env.OWNER_ID || null;
const PASSCODE = process.env.PASSCODE || config.passcode;
const HEARTBEAT_CHANNEL = process.env.HEARTBEAT_CHANNEL || 'bot-logs';
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS) || 1000 * 60 * 60 * 3;

// ============== REGULAR BOT ==============
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

// ============== SELFBOT CLIENT (for sending DMs from user account) ==============
let selfbotClient = null;
let currentSelfbotToken = null;

client.commands = new Collection();

// Load slash commands
const commandsPath = path.join(__dirname, 'botCommands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) client.commands.set(command.data.name, command);
  }
}

// ============== DATABASE SETUP ==============
const sequelize = new Sequelize("database", "username", "password", {
  host: "localhost",
  dialect: "sqlite",
  storage: "database.sqlite",
  logging: false
});

const Prefix = sequelize.define("prefix", {
  userId: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  prefix: {
    type: Sequelize.STRING,
  },
});

// Moderation settings
const ModSettings = sequelize.define("modSettings", {
  guildId: {
    type: Sequelize.STRING,
    primaryKey: true,
  },
  automodEnabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
  spamLimit: {
    type: Sequelize.INTEGER,
    defaultValue: 5,
  },
  spamTime: {
    type: Sequelize.INTEGER,
    defaultValue: 2000, // 2 seconds
  },
  linkBlacklist: {
    type: Sequelize.JSON,
    defaultValue: ["discord.gg", "discordapp.com/invite", "youtube.com", "youtu.be", "spotify.com"],
  },
  mutedRoleId: {
    type: Sequelize.STRING,
  },
  automodLogChannel: {
    type: Sequelize.STRING,
  },
});

sequelize.sync();

// Expose models to client for command access
client.scheduledMentionsModel = ScheduledMentions;

// ============== PERSISTENCE FILES ==============
const inviteCountsFile = path.join(__dirname, 'invite_counts.json');
let inviteCounts = {};
try { inviteCounts = JSON.parse(fs.readFileSync(inviteCountsFile)); } catch (e) { inviteCounts = {}; }

const triggerFile = path.join(__dirname, 'selfbot_trigger.json');
let lastTriggerTimestamp = 0;

// Clear old trigger file on startup to prevent using stale tokens
if (fs.existsSync(triggerFile)) {
  try {
    const data = JSON.parse(fs.readFileSync(triggerFile));
    const now = Date.now();
    const fileAge = now - (data.timestamp || 0);
    // If trigger file is older than 5 minutes, delete it
    if (fileAge > 300000) {
      fs.unlinkSync(triggerFile);
      console.log('🗑️ Cleared old selfbot trigger file');
    }
  } catch (err) {
    // If file is corrupt, delete it
    fs.unlinkSync(triggerFile);
    console.log('🗑️ Cleared corrupt selfbot trigger file');
  }
}

// Global broadcast state variables
global.broadcastInProgress = false;
global.stopBroadcast = false;

// invite cache: map guildId -> Map<code, uses>
client.inviteCache = new Map();

// spam tracker
const messageWindows = new Map();

// ============== UTILITY FUNCTIONS ==============
async function logEvent(guild, text) {
  console.log(text);
  try {
    const channel = guild ? guild.channels.cache.find(ch => ch.name === HEARTBEAT_CHANNEL && ch.isTextBased()) : null;
    if (channel) channel.send(text).catch(() => {});
  } catch (err) { console.error('logEvent error', err); }
}

// Log to moderation/command log channel
async function logToModChannel(guild, embed) {
  try {
    let logSettings = await LogSettings.findOne({ where: { guildId: guild.id } });
    if (!logSettings || !logSettings.logChannelId) return;
    
    const channel = guild.channels.cache.get(logSettings.logChannelId);
    if (!channel || !channel.isTextBased()) return;
    
    await channel.send({ embeds: [embed] }).catch(err => console.error('Failed to send log embed:', err.message));
  } catch (err) { console.error('logToModChannel error:', err); }
}

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============== ERROR HANDLERS ==============
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
  // Suppress the known ClientUserSettingManager bug in selfbot library
  if (err && err.message && err.message.includes('ClientUserSettingManager')) {
    return; // Ignore this specific error
  }
  if (err && err.stack && err.stack.includes('ClientUserSettingManager')) {
    return; // Ignore this specific error
  }
  console.error('Unhandled Rejection:', err);
});

// Cache bot members for each guild to avoid refetching on every message
client.botMembersCache = new Map();

// ============== BOT: READY ==============
client.once('ready', async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);

  // cache invites and bot members for all guilds
  for (const [guildId, guild] of client.guilds.cache) {
    // Cache invites
    try {
      const invites = await guild.invites.fetch();
      const map = new Map();
      for (const [code, invite] of invites) map.set(code, invite.uses || 0);
      client.inviteCache.set(guildId, map);
      console.log(`Cached invites for guild ${guild.name} (${guildId})`);
    } catch (err) {
      console.error(`Failed to fetch invites for guild ${guildId}:`, err.message);
    }
    
    // Cache bot member (independent of invite fetching)
    try {
      const botMember = await guild.members.fetch(client.user.id);
      client.botMembersCache.set(guildId, botMember);
    } catch (err) {
      console.error(`Failed to cache bot member for guild ${guildId}:`, err.message);
    }
  }

  // heartbeat
  setInterval(async () => {
    for (const [id, guild] of client.guilds.cache) {
      try {
        await logEvent(guild, `💓 Still alive — ${new Date().toISOString()}`);
      } catch (err) { }
    }
  }, HEARTBEAT_INTERVAL_MS);
});

// ============== BOT: GUILD JOIN HANDLER ==============
client.on('guildCreate', async guild => {
  // Cache invites for this new guild
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    for (const [code, invite] of invites) map.set(code, invite.uses || 0);
    client.inviteCache.set(guild.id, map);
    console.log(`Cached invites for new guild ${guild.name} (${guild.id})`);
  } catch (err) {
    console.error(`Failed to fetch invites for new guild ${guild.id}:`, err.message);
  }
  
  // Cache bot member for this guild (independent of invite fetching)
  try {
    const botMember = await guild.members.fetch(client.user.id);
    client.botMembersCache.set(guild.id, botMember);
    console.log(`Cached bot member for new guild ${guild.name}`);
  } catch (err) {
    console.error(`Failed to cache bot member for new guild ${guild.id}:`, err.message);
  }
});

// ============== BOT: INVITE CACHE MANAGEMENT ==============
client.on('inviteCreate', invite => {
  const guildId = invite.guild.id;
  const map = client.inviteCache.get(guildId) || new Map();
  map.set(invite.code, invite.uses || 0);
  client.inviteCache.set(guildId, map);
});
client.on('inviteDelete', invite => {
  const guildId = invite.guild.id;
  const map = client.inviteCache.get(guildId) || new Map();
  map.delete(invite.code);
  client.inviteCache.set(guildId, map);
});

// ============== BOT: MEMBER JOIN HANDLER ==============
// Anti-raid tracking
if (!global.guildJoinTimestamps) global.guildJoinTimestamps = new Map();

client.on('guildMemberAdd', async member => {
  try {
    const guild = member.guild;
    const accountAgeMs = Date.now() - member.user.createdTimestamp;
    const threeDaysMs = 1000 * 60 * 60 * 24 * 3;
    const isAlt = accountAgeMs < threeDaysMs;

    // Anti-raid detection (configurable)
    let config = await AutoModConfig.findOne({ where: { guildId: guild.id } });
    if (!config) {
      config = await AutoModConfig.create({ guildId: guild.id });
    }

    if (config.raidProtectionEnabled) {
      const now = Date.now();
      const guildJoins = global.guildJoinTimestamps.get(guild.id) || [];
      guildJoins.push(now);
      const recentJoins = guildJoins.filter(t => now - t < config.raidTimeWindow);
      global.guildJoinTimestamps.set(guild.id, recentJoins);
      
      if (recentJoins.length >= config.raidJoinThreshold) {
        await logEvent(guild, `🚨 **RAID ALERT!** ${recentJoins.length} members joined in the last ${config.raidTimeWindow / 1000} seconds!`);
        
        // Auto-lockdown if enabled
        if (config.autoLockdownOnRaid) {
          try {
            const everyoneRole = guild.roles.everyone;
            await logEvent(guild, `🔒 **AUTO-LOCKDOWN ACTIVATED!** Locking all channels due to raid detection.`);
            
            // Lock all text channels by denying SendMessages permission
            let lockedCount = 0;
            for (const channel of guild.channels.cache.values()) {
              if (channel.isTextBased() && channel.permissionsFor(everyoneRole).has('SendMessages')) {
                await channel.permissionOverwrites.edit(everyoneRole, {
                  SendMessages: false,
                }).catch(() => {});
                lockedCount++;
              }
            }
            await logEvent(guild, `🔒 Locked ${lockedCount} channels. Use /unlockdown to restore normal permissions.`);
          } catch (err) {
            console.error('Auto-lockdown error:', err);
            await logEvent(guild, `⚠️ Failed to activate auto-lockdown: ${err.message}`);
          }
        }
      }
    }

    let usedInviterId = null;
    try {
      const newInvites = await guild.invites.fetch();
      const cached = client.inviteCache.get(guild.id) || new Map();
      for (const [code, invite] of newInvites) {
        const prev = cached.get(code) || 0;
        const nowUses = invite.uses || 0;
        if (nowUses > prev) {
          usedInviterId = invite.inviter ? invite.inviter.id : null;
          break;
        }
      }
      const newMap = new Map();
      for (const [code, inv] of newInvites) newMap.set(code, inv.uses || 0);
      client.inviteCache.set(guild.id, newMap);
    } catch (err) {
      console.error('Error fetching invites on guildMemberAdd:', err.message);
    }

    await logEvent(guild, `🟢 Member joined: ${member.user.tag} (ID: ${member.user.id}) ${isAlt ? '[ALT]' : ''}`);

    if (isAlt) {
      console.log(`Ignoring invite count for alt account ${member.user.tag}`);
      return;
    }

    if (usedInviterId) {
      inviteCounts[usedInviterId] = (inviteCounts[usedInviterId] || 0) + 1;
      fs.writeFileSync(inviteCountsFile, JSON.stringify(inviteCounts, null, 2));
      await logEvent(guild, `📈 Invite recorded: Inviter ${usedInviterId} now has ${inviteCounts[usedInviterId]} invites`);

      try {
        // Get guild settings
        let guildSettings = await GuildSettings.findOne({ where: { guildId: guild.id } });
        if (!guildSettings) {
          guildSettings = await GuildSettings.create({ guildId: guild.id });
        }

        const inviteCount = inviteCounts[usedInviterId];
        const inviteRoles = guildSettings.inviteRoles || {};
        
        // Check if this invite count triggers any role
        if (inviteRoles[inviteCount]) {
          const roleId = inviteRoles[inviteCount];
          const role = guild.roles.cache.get(roleId);
          if (!role) {
            await logEvent(guild, `⚠️ Auto-role failed: Role not found for threshold ${inviteCount}`);
          } else {
            const inviter = await guild.members.fetch(usedInviterId).catch(() => null);
            if (inviter && !inviter.roles.cache.has(role.id)) {
              inviter.roles.add(role).then(() => logEvent(guild, `✅ Gave '${role.name}' role to ${inviter.user.tag} (${inviteCount} invites)`)).catch(err => logEvent(guild, `Failed to add role: ${err.message}`));
            }
          }
        }
      } catch (err) { console.error('Auto-role error', err); }
    }
  } catch (err) {
    console.error('guildMemberAdd handler error', err);
  }
});

// Helper function to add warning and check for auto-actions
async function addWarningAndCheckActions(guild, user, reason) {
  try {
    await Warnings.create({
      userId: user.id,
      guildId: guild.id,
      reason: reason,
      moderatorId: client.user.id,
      timestamp: new Date(),
    });

    const warnCount = await Warnings.count({
      where: { guildId: guild.id, userId: user.id },
    });

    const config = await AutoModConfig.findOne({ where: { guildId: guild.id } });
    if (!config) return warnCount;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return warnCount;

    if (warnCount >= config.autoBanThreshold) {
      await member.ban({ reason: `Auto-ban: ${warnCount} warnings` }).catch(() => {});
      await logEvent(guild, `🔨 Auto-banned ${user.tag} (${warnCount} warnings)`);
    } else if (warnCount >= config.autoKickThreshold) {
      await member.kick(`Auto-kick: ${warnCount} warnings`).catch(() => {});
      await logEvent(guild, `👢 Auto-kicked ${user.tag} (${warnCount} warnings)`);
    } else if (warnCount >= config.autoMuteThreshold) {
      const muteRole = guild.roles.cache.find(r => r.name === 'Muted');
      if (muteRole) {
        await member.roles.add(muteRole).catch(() => {});
        await logEvent(guild, `🔇 Auto-muted ${user.tag} (${warnCount} warnings)`);
      }
    }

    return warnCount;
  } catch (err) {
    console.error('addWarningAndCheckActions error:', err);
    return 0;
  }
}

// ============== BOT: MODERATION FILTERS ==============
client.on('messageCreate', async message => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    const member = message.member;
    
    // ALWAYS EXEMPT SERVER OWNER FROM AUTOMOD
    if (message.author.id === message.guild.ownerId) {
      return;
    }

    const now = Date.now();

    let config = await AutoModConfig.findOne({ where: { guildId: message.guild.id } });
    if (!config) {
      config = await AutoModConfig.create({ guildId: message.guild.id });
    }

    // Check if user has any exempt roles (configured via /automodconfig exemptrole)
    const exemptRoles = config.exemptRoles || [];
    if (Array.isArray(exemptRoles) && exemptRoles.length > 0) {
      const hasExemptRole = exemptRoles.some(roleId => member.roles.cache.has(roleId));
      if (hasExemptRole) return;
    }

    // Check if user has same or higher role than bot (ALWAYS EXEMPT THESE USERS)
    try {
      const botMember = client.botMembersCache.get(message.guild.id);
      if (botMember) {
        const botHighestRole = botMember.roles.highest;
        const memberHighestRole = member.roles.highest;
        
        if (memberHighestRole.position >= botHighestRole.position) {
          return; // User has same or higher role than bot, exempt from all automod
        }
      }
    } catch (err) {
      console.error('Error checking role hierarchy:', err);
      // Continue with other automod checks if this fails
    }

    // Check attachment rules
    if (message.attachments.size > 0) {
      const rule = await SharedAttachmentRules.findOne({
        where: {
          guildId: message.guild.id,
          channelId: message.channel.id,
          enabled: true,
        },
      });

      if (rule) {
        const hasRequiredPhrase = message.content.toLowerCase().includes(rule.requiredPhrase.toLowerCase());
        if (!hasRequiredPhrase) {
          try {
            await message.delete();
            await message.channel.send(`${message.author}, your message was deleted because attachments in this channel must include the phrase: \`${rule.requiredPhrase}\``).then(msg => {
              setTimeout(() => msg.delete().catch(() => {}), 10000);
            });
            await logEvent(message.guild, `📎 Deleted attachment from ${message.author.tag} in ${message.channel.name}: Missing required phrase "${rule.requiredPhrase}"`);
          } catch (err) {
            console.error('Failed to delete attachment rule violation:', err);
          }
          return;
        }
      }
    }

    // Channel-specific word filter check
    const channelWordFilters = await ChannelWordFilter.findAll({
      where: { guildId: message.guild.id, channelId: message.channel.id, enabled: true },
    });

    for (const filter of channelWordFilters) {
      const messageContent = filter.caseSensitive ? message.content : message.content.toLowerCase();
      const filterWord = filter.caseSensitive ? filter.word : filter.word.toLowerCase();
      
      if (messageContent.includes(filterWord)) {
        await message.delete().catch(() => {});
        await logEvent(message.guild, `🚫 Deleted message from ${message.author.tag} in ${message.channel.name} containing blocked word: ${filter.word}`);
        return;
      }
    }

    // Word filter check
    const wordFilters = await WordFilter.findAll({
      where: { guildId: message.guild.id, enabled: true },
    });

    for (const filter of wordFilters) {
      if (message.content.toLowerCase().includes(filter.word.toLowerCase())) {
        await message.delete().catch(() => {});
        
        if (filter.action === 'warn') {
          const warnCount = await addWarningAndCheckActions(message.guild, message.author, `Used filtered word: ${filter.word}`);
          await message.channel.send(`${message.author}, you have been warned for using a filtered word. (Warning ${warnCount})`).then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 10000);
          });
        } else if (filter.action === 'mute') {
          const muteRole = message.guild.roles.cache.find(r => r.name === 'Muted');
          if (muteRole) {
            await member.roles.add(muteRole).catch(() => {});
            await logEvent(message.guild, `🔇 Muted ${message.author.tag} for using filtered word: ${filter.word}`);
          }
        }
        
        await logEvent(message.guild, `🚫 Deleted message from ${message.author.tag} containing filtered word: ${filter.word}`);
        return;
      }
    }

    // Link filtering (configurable)
    if (config.linkFilterEnabled) {
      const linkRegex = /(discord\.gg|discordapp\.com\/invite|youtube\.com|youtu\.be|spotify\.com|https?:\/\/)/i;
      if (linkRegex.test(message.content)) {
        await message.delete().catch(() => {});
        await logEvent(message.guild, `🔗 Deleted link message from ${message.author.tag}: ${message.content}`);
        return;
      }
    }

    // Spam detection (configurable)
    if (config.spamEnabled) {
      const window = messageWindows.get(message.author.id) || [];
      window.push(now);
      const cutoff = now - config.spamTimeWindow;
      const recent = window.filter(t => t > cutoff);
      messageWindows.set(message.author.id, recent);
      
      if (recent.length >= config.spamMessageLimit) {
        try {
          const fetched = await message.channel.messages.fetch({ limit: 20 });
          const userMsgs = fetched.filter(m => m.author.id === message.author.id && Date.now() - m.createdTimestamp < config.spamTimeWindow);
          for (const m of userMsgs.values()) await m.delete().catch(() => {});
        } catch (err) { }
        
        if (config.spamMuteEnabled) {
          const muteRole = message.guild.roles.cache.find(r => r.name === 'Muted');
          if (muteRole) {
            await member.roles.add(muteRole).catch(() => {});
            await logEvent(message.guild, `🔇 Auto-muted ${message.author.tag} for spamming`);
            setTimeout(async () => {
              await member.roles.remove(muteRole).catch(() => {});
            }, config.spamMuteDuration);
          }
        }
        
        await logEvent(message.guild, `💨 Anti-spam: Deleted messages from ${message.author.tag}`);
        return;
      }
    }

    // Duplicate message detection (configurable)
    if (config.duplicateMessageEnabled) {
      if (!global.userLastMessages) global.userLastMessages = new Map();
      const userLastMsg = global.userLastMessages.get(message.author.id);
      if (userLastMsg && userLastMsg.content === message.content && userLastMsg.content.length > 10) {
        const timeDiff = now - userLastMsg.timestamp;
        if (timeDiff < 30000) {
          await message.delete().catch(() => {});
          await logEvent(message.guild, `📋 Duplicate message deleted from ${message.author.tag}`);
          return;
        }
      }
      global.userLastMessages.set(message.author.id, { content: message.content, timestamp: now });
    }
  } catch (err) { console.error('messageCreate filter error', err); }
});

// ============== BOT: INTERACTION HANDLING ==============
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command && command.autocomplete) {
        await command.autocomplete(interaction);
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    
    // Log command execution
    if (interaction.guild) {
      try {
        let logSettings = await LogSettings.findOne({ where: { guildId: interaction.guild.id } });
        if (logSettings && logSettings.logChannelId && logSettings.logCommands) {
          const { EmbedBuilder } = require('discord.js');
          const logEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📝 Command Executed')
            .addFields(
              { name: 'Command', value: `\`/${interaction.commandName}\`` },
              { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})` },
              { name: 'Channel', value: `${interaction.channel.name} (${interaction.channelId})` },
              { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
            );
          await logToModChannel(interaction.guild, logEmbed);
        }
      } catch (err) { console.error('Command logging error:', err); }
    }
    
    await command.execute(interaction, client);
  } catch (err) {
    console.error('interactionCreate error', err);
  }
});

// ============== BOT: MESSAGE UPDATE (EDIT) HANDLER ==============
client.on('messageUpdate', async (oldMessage, newMessage) => {
  try {
    if (!newMessage.guild) return;
    if (newMessage.author.bot) return;
    if (oldMessage.content === newMessage.content) return;
    
    let logSettings = await LogSettings.findOne({ where: { guildId: newMessage.guild.id } });
    if (!logSettings || !logSettings.logChannelId || !logSettings.logMessages) return;
    
    const { EmbedBuilder } = require('discord.js');
    const logEmbed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle('✏️ Message Edited')
      .addFields(
        { name: 'User', value: `${newMessage.author.tag} (${newMessage.author.id})` },
        { name: 'Channel', value: `${newMessage.channel.name} (${newMessage.channelId})` },
        { name: 'Old Content', value: oldMessage.content.substring(0, 1024) || '*(empty)*' },
        { name: 'New Content', value: newMessage.content.substring(0, 1024) || '*(empty)*' },
        { name: 'Message Link', value: `[Jump to message](${newMessage.url})` },
        { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
      );
    
    await logToModChannel(newMessage.guild, logEmbed);
  } catch (err) { console.error('messageUpdate handler error:', err); }
});

// ============== BOT: MESSAGE DELETE HANDLER ==============
client.on('messageDelete', async message => {
  try {
    if (!message.guild) return;
    if (message.author && message.author.bot) return;
    
    let logSettings = await LogSettings.findOne({ where: { guildId: message.guild.id } });
    if (!logSettings || !logSettings.logChannelId || !logSettings.logMessages) return;
    
    const { EmbedBuilder } = require('discord.js');
    const logEmbed = new EmbedBuilder()
      .setColor('#ff3333')
      .setTitle('🗑️ Message Deleted')
      .addFields(
        { name: 'User', value: message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown User' },
        { name: 'Channel', value: `${message.channel.name} (${message.channelId})` },
        { name: 'Content', value: message.content.substring(0, 1024) || '*(empty/embed)*' },
        { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
      );
    
    await logToModChannel(message.guild, logEmbed);
  } catch (err) { console.error('messageDelete handler error:', err); }
});

// ============== BOT: TRIGGER WATCHER FOR MASS DM ==============
function watchSelfbotTrigger() {
  setInterval(async () => {
    if (!fs.existsSync(triggerFile)) return;
    try {
      const data = JSON.parse(fs.readFileSync(triggerFile));
      if (!data.serverId || !data.message || !data.userToken) return;
      if (data.timestamp && data.timestamp <= lastTriggerTimestamp) return;
      
      // Helper function to send message to both console and channel
      const sendUpdate = async (message) => {
        console.log(message);
        if (data.channelId) {
          try {
            const channel = await client.channels.fetch(data.channelId);
            if (channel) await channel.send(message);
          } catch (err) {
            console.log(`⚠️ Could not send update to channel: ${err.message}`);
          }
        }
      };
      
      // Only process triggers from the last 10 minutes (prevent old triggers)
      const triggerAge = Date.now() - data.timestamp;
      if (triggerAge > 600000) {
        console.log('⚠️ Ignoring old selfbot trigger (>10 minutes old)');
        fs.unlinkSync(triggerFile);
        return;
      }
      
      lastTriggerTimestamp = data.timestamp;
      
      // Create or reuse selfbot client with the provided token
      if (!selfbotClient || currentSelfbotToken !== data.userToken) {
        currentSelfbotToken = data.userToken;
        selfbotClient = new SelfbotClient({ 
          checkUpdate: false,
          partials: ['USER', 'CHANNEL', 'GUILD_MEMBER', 'MESSAGE']
        });
        
        // Suppress errors
        selfbotClient.on('error', () => {});
        
        let loginSuccess = false;
        
        try {
          await selfbotClient.login(data.userToken);
          loginSuccess = true;
          await sendUpdate(`✅ Selfbot logged in as ${selfbotClient.user.tag}`);
        } catch (err) {
          await sendUpdate(`❌ **Failed to login selfbot:** ${err.message}\n\nPlease check that your user token is valid and try again.`);
          fs.unlinkSync(triggerFile);
          return;
        }
        
        if (loginSuccess) {
          // Wait for guilds to properly load - increased timeout
          await sendUpdate('⏳ Waiting for guilds to load...');
          await sleep(8000); // 8 seconds for full initialization
          
          await sendUpdate(`📊 Selfbot has access to ${selfbotClient.guilds.cache.size} servers`);
          
          if (selfbotClient.guilds.cache.size === 0) {
            await sendUpdate('⚠️ No servers loaded yet, waiting another 5 seconds...');
            await sleep(5000);
            await sendUpdate(`📊 Now has access to ${selfbotClient.guilds.cache.size} servers`);
          }
        }
      }
      
      const guild = selfbotClient.guilds.cache.get(data.serverId);
      if (!guild) {
        const availableServers = Array.from(selfbotClient.guilds.cache.values()).map(g => `${g.name} (${g.id})`).join('\n');
        await sendUpdate(`❌ **Server not found for broadcast!**\n\n**Server ID provided:** ${data.serverId}\n\n**Available servers:**\n${availableServers || 'None'}\n\nPlease check the server ID and try again.`);
        fs.unlinkSync(triggerFile);
        return;
      }
      await guild.members.fetch();
      
      const members = Array.from(guild.members.cache.values()).filter(
        m => !m.user.bot && m.user.id !== selfbotClient.user.id
      );
      
      let sent = 0;
      let failed = 0;
      const startTime = new Date().toLocaleString();
      const totalMembers = members.length;
      
      global.broadcastInProgress = true;
      global.stopBroadcast = false;
      
      await sendUpdate(`📤 Starting broadcast to ${totalMembers} members...`);
      
      for (let i = 0; i < members.length; i++) {
        // Check if stop was requested
        if (global.stopBroadcast) {
          const stopMsg = `⛔ **Broadcast stopped by user!**\n\n✅ Messages sent before stop: **${sent}/${totalMembers}**\n❌ Messages failed: **${failed}**`;
          await sendUpdate(stopMsg);
          global.broadcastInProgress = false;
          global.stopBroadcast = false;
          break;
        }
        
        const member = members[i];
        try {
          // Create DM channel using REST API directly (works for server members even if not friends)
          let dmChannel = null;
          try {
            // Use Discord REST API to create DM channel
            const response = await axios.post('https://discord.com/api/v9/users/@me/channels', {
              recipient_id: member.user.id
            }, {
              headers: {
                'Authorization': data.userToken,
                'Content-Type': 'application/json'
              }
            });
            
            // Fetch the channel from selfbotClient's cache or create from response
            if (response.data && response.data.id) {
              dmChannel = selfbotClient.channels.cache.get(response.data.id);
              if (!dmChannel) {
                // If not in cache, fetch it
                dmChannel = await selfbotClient.channels.fetch(response.data.id).catch(() => null);
              }
            }
          } catch (createErr) {
            // If DM creation fails (privacy settings or blocked), skip this user
            // Do NOT send friend requests - that's detectable by Discord
            failed++;
            continue;
          }
          
          if (!dmChannel) {
            failed++;
            continue;
          }
          
          try {
            // Send the message through the DM channel
            await dmChannel.send(data.message);
            sent++;
          } catch (sendErr) {
            // Message send failed (could be privacy settings, user blocked, etc.)
            failed++;
          }
        } catch (err) {
          failed++;
        }
        
        // Progress report and cooldown every 10 DMs
        if ((i + 1) % 10 === 0) {
          const progressPercent = Math.round(((i + 1) / totalMembers) * 100);
          const progressMsg = `📊 **PROGRESS REPORT - Batch ${Math.ceil((i + 1) / 10)}**\n\n✅ Sent: **${sent}/${totalMembers}** (${progressPercent}%)\n❌ Failed: **${failed}**\n⏰ Time: ${new Date().toLocaleString()}`;
          
          await sendUpdate(progressMsg);
          
          // Wait 3-8 minutes after every 10 DMs (but not after the last batch)
          if (i + 1 < members.length) {
            const cooldownMs = getRandomDelay(180000, 480000);
            const cooldownMin = Math.round(cooldownMs / 60000);
            await sendUpdate(`⏳ Waiting ${cooldownMin} minutes before next batch...`);
            await sleep(cooldownMs);
          }
        } else {
          // Random delay of 12-35 seconds between each DM
          const delayMs = getRandomDelay(12000, 35000);
          await sleep(delayMs);
        }
      }
      
      global.broadcastInProgress = false;
      const finalMsg = `✨ **Broadcast Complete!**\n\n📅 Started: ${startTime}\n📅 Finished: ${new Date().toLocaleString()}\n\n✅ Total Sent: **${sent}/${totalMembers}**\n❌ Total Failed: **${failed}**`;
      
      await sendUpdate(finalMsg);
      fs.unlinkSync(triggerFile);
    } catch (err) {
      console.error('Trigger watcher error:', err);
      global.broadcastInProgress = false;
    }
  }, 5000);
}

watchSelfbotTrigger();

// ============== SCHEDULED MENTIONS ==============
function checkScheduledMentions() {
  setInterval(async () => {
    try {
      const schedules = await ScheduledMentions.findAll({
        where: { enabled: true },
      });

      for (const schedule of schedules) {
        const now = new Date();
        const lastMention = schedule.lastMentionTime ? new Date(schedule.lastMentionTime) : null;
        
        const shouldSend = !lastMention || 
          (now - lastMention) >= (schedule.intervalHours * 60 * 60 * 1000);

        if (shouldSend) {
          try {
            const channel = await client.channels.fetch(schedule.channelId);
            if (channel && channel.isTextBased()) {
              const message = await channel.send('@everyone Scheduled notification');
              setTimeout(async () => {
                try {
                  await message.delete();
                } catch (err) {
                  console.error('Failed to delete scheduled mention:', err);
                }
              }, 2000);

              schedule.lastMentionTime = now;
              await schedule.save();

              console.log(`📢 Sent scheduled mention in ${channel.name} (Guild: ${schedule.guildId})`);
            }
          } catch (err) {
            console.error('Failed to send scheduled mention:', err);
          }
        }
      }
    } catch (err) {
      console.error('Scheduled mentions checker error:', err);
    }
  }, 60000);
}

checkScheduledMentions();

// ============== REDGIFS AUTO-POSTING ==============
const axios = require('axios');
const fsPromises = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

async function getRedGifsToken() {
  try {
    const response = await axios.get('https://api.redgifs.com/v2/auth/temporary', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    return response.data.token;
  } catch (error) {
    console.error('Failed to get RedGifs token:', error.message);
    return null;
  }
}

async function getVideoDuration(filepath) {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filepath
    ]);
    return parseFloat(stdout.trim());
  } catch (err) {
    console.error('Failed to get video duration:', err.message);
    return 0;
  }
}

async function compressVideo(inputPath, outputPath, targetSizeMB = 9.5) {
  try {
    const stats = await fsPromises.stat(inputPath);
    const inputSizeMB = stats.size / (1024 * 1024);
    
    // If already under target size, just copy the file
    if (inputSizeMB <= targetSizeMB) {
      await fsPromises.copyFile(inputPath, outputPath);
      return true;
    }
    
    // Get video duration for bitrate calculation
    const duration = await getVideoDuration(inputPath);
    if (!duration || duration === 0) {
      console.error('Invalid video duration, using default compression');
      // Use aggressive compression settings
      await execFileAsync(ffmpegPath, [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]);
      
      // Check if compression succeeded
      const outputStats = await fsPromises.stat(outputPath);
      const outputSizeMB = outputStats.size / (1024 * 1024);
      return outputSizeMB <= targetSizeMB;
    }
    
    // Calculate target bitrate (in kbits/s)
    // targetSizeMB * 8192 (convert MB to kilobits) / duration
    // Subtract 128k for audio
    const targetBitrate = Math.floor((targetSizeMB * 8192 / duration) - 128);
    
    if (targetBitrate < 100) {
      console.error('Video too long for target size, using minimum bitrate');
      await execFileAsync(ffmpegPath, [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-b:v', '100k',
        '-maxrate', '100k',
        '-bufsize', '200k',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]);
      
      // Check if compression succeeded
      const outputStats = await fsPromises.stat(outputPath);
      const outputSizeMB = outputStats.size / (1024 * 1024);
      return outputSizeMB <= targetSizeMB;
    }
    
    // Compress with calculated bitrate
    await execFileAsync(ffmpegPath, [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-b:v', `${targetBitrate}k`,
      '-maxrate', `${targetBitrate}k`,
      '-bufsize', `${targetBitrate * 2}k`,
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      '-y',
      outputPath
    ]);
    
    // Verify output size
    const outputStats = await fsPromises.stat(outputPath);
    const outputSizeMB = outputStats.size / (1024 * 1024);
    
    if (outputSizeMB > targetSizeMB) {
      // If still too large, try with even lower bitrate
      const lowerBitrate = Math.floor(targetBitrate * 0.7);
      await execFileAsync(ffmpegPath, [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-b:v', `${lowerBitrate}k`,
        '-maxrate', `${lowerBitrate}k`,
        '-bufsize', `${lowerBitrate * 2}k`,
        '-c:a', 'aac',
        '-b:a', '64k',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]);
      
      // Final verification
      const finalStats = await fsPromises.stat(outputPath);
      const finalSizeMB = finalStats.size / (1024 * 1024);
      return finalSizeMB <= targetSizeMB;
    }
    
    return true;
  } catch (err) {
    console.error('Failed to compress video:', err.message);
    return false;
  }
}

async function fetchRedGifsVideos(sourceUrl, sourceType, count, token) {
  try {
    // Random page number between 1 and 15 to get variety
    const randomPage = Math.floor(Math.random() * 15) + 1;
    
    // Fetch 3x the requested count to have more videos to randomly select from
    const fetchCount = Math.min(count * 3, 80); // Cap at 80 to avoid API limits
    
    let apiUrl = '';
    
    if (sourceType === 'niche') {
      const nicheMatch = sourceUrl.match(/niches\/([^\/\?]+)/i);
      if (!nicheMatch) return [];
      const nicheName = nicheMatch[1];
      // Use random page number for variety
      apiUrl = `https://api.redgifs.com/v2/niches/${nicheName}/gifs?order=new&count=${fetchCount}&page=${randomPage}`;
    } else if (sourceType === 'user') {
      const userMatch = sourceUrl.match(/users\/([^\/\?]+)/i);
      if (!userMatch) return [];
      const username = userMatch[1];
      // Use random page number for variety
      apiUrl = `https://api.redgifs.com/v2/users/${username}/gifs?order=new&count=${fetchCount}&page=${randomPage}`;
    }
    
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.redgifs.com/'
      }
    });
    
    const gifs = response.data.gifs || [];
    const allVideos = gifs.map(gif => ({
      id: gif.id,
      url: gif.urls.hd || gif.urls.sd,
      thumbnail: gif.urls.thumbnail,
      title: gif.description || `RedGifs - ${gif.id}`
    }));
    
    // Randomly shuffle the array
    const shuffled = allVideos.sort(() => Math.random() - 0.5);
    
    // Return only the requested count (randomly selected)
    return shuffled.slice(0, count);
  } catch (error) {
    console.error('Failed to fetch RedGifs videos:', error.message);
    return [];
  }
}

async function downloadRedGifsFile(url, outputPath) {
  const writer = require('fs').createWriteStream(outputPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    headers: { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.redgifs.com/'
    }
  });
  
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

function checkRedGifsSchedules() {
  setInterval(async () => {
    try {
      if (global.triggerRedGifsSchedule) {
        const triggerId = global.triggerRedGifsSchedule;
        global.triggerRedGifsSchedule = null;
        
        const schedule = await RedGifsSchedule.findOne({ where: { id: triggerId } });
        if (schedule) {
          await processRedGifsSchedule(schedule, true);
        }
      }
      
      const schedules = await RedGifsSchedule.findAll({
        where: { enabled: true }
      });
      
      for (const schedule of schedules) {
        const now = new Date();
        const lastPost = schedule.lastPostTime ? new Date(schedule.lastPostTime) : null;
        
        const shouldPost = !lastPost || 
          (now - lastPost) >= (schedule.intervalHours * 60 * 60 * 1000);
        
        if (shouldPost) {
          await processRedGifsSchedule(schedule, false);
        }
      }
    } catch (err) {
      console.error('RedGifs schedule checker error:', err);
    }
  }, 60000);
}

async function processRedGifsSchedule(schedule, isManual) {
  try {
    const channel = await client.channels.fetch(schedule.channelId);
    if (!channel || !channel.isTextBased()) {
      console.error(`Channel ${schedule.channelId} not found or not text-based`);
      return;
    }
    
    const token = await getRedGifsToken();
    if (!token) {
      console.error('Failed to get RedGifs token');
      return;
    }
    
    const videos = await fetchRedGifsVideos(
      schedule.sourceUrl,
      schedule.sourceType,
      schedule.videoCount,
      token
    );
    
    if (videos.length === 0) {
      console.error('No videos found for schedule', schedule.id);
      return;
    }
    
    const tempDir = path.join(__dirname, 'temp_videos');
    if (!require('fs').existsSync(tempDir)) {
      require('fs').mkdirSync(tempDir, { recursive: true });
    }
    
    let posted = 0;
    for (const video of videos) {
      const filename = `redgifs_${video.id}.mp4`;
      const rawFilepath = path.join(tempDir, `raw_${filename}`);
      const compressedFilepath = path.join(tempDir, filename);
      
      try {
        // Download the video
        await downloadRedGifsFile(video.url, rawFilepath);
        
        // Compress to under 10MB
        const compressed = await compressVideo(rawFilepath, compressedFilepath, 9.5);
        
        if (!compressed) {
          console.log(`Failed to compress ${video.id}`);
          continue;
        }
        
        // Verify final size before posting
        const stats = await fsPromises.stat(compressedFilepath);
        const sizeMB = stats.size / (1024 * 1024);
        
        // If still too large, retry with more aggressive compression
        if (sizeMB > 9.9) {
          console.log(`First compression too large (${sizeMB.toFixed(2)}MB), retrying with lower bitrate...`);
          
          // Try again with more aggressive settings
          const retryCompressed = await compressVideo(rawFilepath, compressedFilepath, 8.5);
          
          if (!retryCompressed) {
            console.log(`Failed retry compression for ${video.id}`);
            continue;
          }
          
          // Check again
          const retryStats = await fsPromises.stat(compressedFilepath);
          const retrySizeMB = retryStats.size / (1024 * 1024);
          
          if (retrySizeMB > 9.9) {
            console.log(`Skipped ${video.id} - still too large after retry (${retrySizeMB.toFixed(2)}MB)`);
            continue;
          }
        }
        
        // Final size check before posting
        const finalStats = await fsPromises.stat(compressedFilepath);
        const finalSizeMB = finalStats.size / (1024 * 1024);
        
        if (finalSizeMB > 9.9) {
          console.log(`Skipped ${video.id} - final size too large (${finalSizeMB.toFixed(2)}MB)`);
          continue;
        }
        
        // Send to channel
        await channel.send({
          content: video.title,
          files: [compressedFilepath]
        });
        
        posted++;
        console.log(`✅ Posted ${video.id} (${finalSizeMB.toFixed(2)}MB)`);
        
        await sleep(2000);
      } catch (err) {
        console.error(`Failed to post video ${video.id}:`, err.message);
      } finally {
        // Always cleanup both files
        await fsPromises.unlink(rawFilepath).catch(() => {});
        await fsPromises.unlink(compressedFilepath).catch(() => {});
      }
    }
    
    schedule.lastPostTime = new Date();
    await schedule.save();
    
    const sourceTypeName = schedule.sourceType === 'niche' ? 'niche' : 'user';
    console.log(`📹 Posted ${posted}/${videos.length} RedGifs videos from ${sourceTypeName} to ${channel.name}`);
  } catch (err) {
    console.error('Failed to process RedGifs schedule:', err);
  }
}

checkRedGifsSchedules();

// ============== LOGIN ==============
client.login(BOT_TOKEN).catch(err => console.error('Failed to login:', err));
