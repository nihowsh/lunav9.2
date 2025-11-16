const Sequelize = require('sequelize');
const path = require('path');

// Create a single shared Sequelize instance
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, 'database.sqlite'),
  logging: false,
});

// Define Warnings model once and export it
const Warnings = sequelize.define('warnings', {
  userId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  guildId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  reason: {
    type: Sequelize.TEXT,
    allowNull: false,
  },
  moderatorId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  timestamp: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
});

// Define ServerTemplates model once and export it
const ServerTemplates = sequelize.define('server_templates', {
  code: {
    type: Sequelize.STRING,
    primaryKey: true,
    allowNull: false,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  creatorId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  data: {
    type: Sequelize.TEXT,
    allowNull: false,
  },
  createdAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
});

// Define AttachmentRules model once and export it
const AttachmentRules = sequelize.define('attachment_rules', {
  guildId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  channelId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  requiredPhrase: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  enabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
});

// Define AutoModConfig model for comprehensive automod settings
const AutoModConfig = sequelize.define('automod_config', {
  guildId: {
    type: Sequelize.STRING,
    primaryKey: true,
    allowNull: false,
  },
  // Anti-spam settings
  spamEnabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
  spamMessageLimit: {
    type: Sequelize.INTEGER,
    defaultValue: 5,
  },
  spamTimeWindow: {
    type: Sequelize.INTEGER,
    defaultValue: 5000,
  },
  spamMuteEnabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
  spamMuteDuration: {
    type: Sequelize.INTEGER,
    defaultValue: 600000,
  },
  // Mention spam
  mentionSpamEnabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
  mentionSpamLimit: {
    type: Sequelize.INTEGER,
    defaultValue: 5,
  },
  // Anti-link settings
  linkFilterEnabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
  },
  allowedDomains: {
    type: Sequelize.TEXT,
    defaultValue: '',
  },
  // Anti-raid settings
  raidProtectionEnabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
  raidJoinThreshold: {
    type: Sequelize.INTEGER,
    defaultValue: 5,
  },
  raidTimeWindow: {
    type: Sequelize.INTEGER,
    defaultValue: 10000,
  },
  autoLockdownOnRaid: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
  },
  // Auto-moderation actions
  autoWarnEnabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
  autoMuteThreshold: {
    type: Sequelize.INTEGER,
    defaultValue: 3,
  },
  autoKickThreshold: {
    type: Sequelize.INTEGER,
    defaultValue: 5,
  },
  autoBanThreshold: {
    type: Sequelize.INTEGER,
    defaultValue: 7,
  },
  // Duplicate message detection
  duplicateMessageEnabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
  duplicateMessageLimit: {
    type: Sequelize.INTEGER,
    defaultValue: 3,
  },
  // Exempt roles from automod
  exemptRoles: {
    type: Sequelize.JSON,
    defaultValue: [],
  },
});

// Define WordFilter model for blacklisted words/phrases
const WordFilter = sequelize.define('word_filter', {
  guildId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  word: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  action: {
    type: Sequelize.ENUM('delete', 'warn', 'mute'),
    defaultValue: 'delete',
  },
  enabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
});

// Define ScheduledMentions model for automatic mentions
const ScheduledMentions = sequelize.define('scheduled_mentions', {
  guildId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  channelId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  intervalHours: {
    type: Sequelize.INTEGER,
    defaultValue: 2,
  },
  lastMentionTime: {
    type: Sequelize.DATE,
    allowNull: true,
  },
  enabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
});

// Define LogSettings model for logging channel config
const LogSettings = sequelize.define('log_settings', {
  guildId: {
    type: Sequelize.STRING,
    primaryKey: true,
    allowNull: false,
  },
  logChannelId: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  logCommands: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
  logMessages: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
  logMemberActions: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
});

// Define RedGifsSchedule model for automatic RedGifs posting
const RedGifsSchedule = sequelize.define('redgifs_schedule', {
  guildId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  channelId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  sourceUrl: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  sourceType: {
    type: Sequelize.ENUM('niche', 'user'),
    allowNull: false,
  },
  videoCount: {
    type: Sequelize.INTEGER,
    defaultValue: 10,
  },
  intervalHours: {
    type: Sequelize.INTEGER,
    defaultValue: 6,
  },
  lastPostTime: {
    type: Sequelize.DATE,
    allowNull: true,
  },
  enabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
});

// Define ChannelWordFilter model for channel-specific word blocking
const ChannelWordFilter = sequelize.define('channel_word_filter', {
  guildId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  channelId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  word: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  caseSensitive: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
  },
  enabled: {
    type: Sequelize.BOOLEAN,
    defaultValue: true,
  },
}, {
  freezeTableName: true,
});

// Define GuildSettings model for invite tracking and role rewards
const GuildSettings = sequelize.define('guild_settings', {
  guildId: {
    type: Sequelize.STRING,
    primaryKey: true,
    allowNull: false,
  },
  inviteThreshold: {
    type: Sequelize.INTEGER,
    defaultValue: 3,
  },
  inviteRoles: {
    type: Sequelize.TEXT,
    defaultValue: '{}',
    get() {
      const rawValue = this.getDataValue('inviteRoles');
      try {
        return rawValue ? JSON.parse(rawValue) : {};
      } catch (err) {
        console.error('Error parsing inviteRoles JSON:', err);
        return {};
      }
    },
    set(value) {
      this.setDataValue('inviteRoles', JSON.stringify(value || {}));
    },
  },
}, {
  freezeTableName: true,
});

const Bookmarks = sequelize.define('bookmarks', {
  userId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  guildId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  channelId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  messageId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  messageContent: {
    type: Sequelize.TEXT,
    allowNull: true,
  },
  messageAuthor: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  messageUrl: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  createdAt: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW,
  },
}, {
  indexes: [
    {
      unique: true,
      fields: ['userId', 'messageId'],
      name: 'user_message_bookmark'
    }
  ]
});

// Sync all models (with alter to add new columns to existing tables)
sequelize.sync({ alter: true }).then(() => {
  console.log('✅ Database synced successfully');
}).catch(err => {
  console.error('❌ Database sync error:', err);
});

module.exports = {
  sequelize,
  Warnings,
  ServerTemplates,
  AttachmentRules,
  AutoModConfig,
  WordFilter,
  ScheduledMentions,
  LogSettings,
  RedGifsSchedule,
  GuildSettings,
  ChannelWordFilter,
  Bookmarks,
};
