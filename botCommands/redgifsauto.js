const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { RedGifsSchedule } = require('../database.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('redgifsauto')
    .setDescription('Manage automatic RedGifs video posting')
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a new RedGifs auto-poster')
      .addStringOption(opt => opt
        .setName('url')
        .setDescription('RedGifs niche or user URL (e.g., redgifs.com/niches/indian-sissy)')
        .setRequired(true))
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to post videos in')
        .setRequired(true))
      .addIntegerOption(opt => opt
        .setName('count')
        .setDescription('Number of videos to post each time (default: 10)')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(false))
      .addIntegerOption(opt => opt
        .setName('interval')
        .setDescription('Hours between posts (default: 6)')
        .setMinValue(1)
        .setMaxValue(168)
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all active RedGifs auto-posters'))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove a RedGifs auto-poster')
      .addIntegerOption(opt => opt
        .setName('id')
        .setDescription('ID of the schedule to remove')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('toggle')
      .setDescription('Enable/disable a RedGifs auto-poster')
      .addIntegerOption(opt => opt
        .setName('id')
        .setDescription('ID of the schedule to toggle')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('trigger')
      .setDescription('Manually trigger a RedGifs auto-poster now')
      .addIntegerOption(opt => opt
        .setName('id')
        .setDescription('ID of the schedule to trigger')
        .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      const url = interaction.options.getString('url');
      const channel = interaction.options.getChannel('channel');
      const count = interaction.options.getInteger('count') || 10;
      const interval = interaction.options.getInteger('interval') || 6;

      let sourceType = null;
      if (url.includes('/niches/')) {
        sourceType = 'niche';
      } else if (url.includes('/users/')) {
        sourceType = 'user';
      } else {
        return interaction.reply({
          content: '❌ Invalid URL! Must be a RedGifs niche or user URL.\n\n**Examples:**\n- `https://www.redgifs.com/niches/indian-sissy`\n- `https://www.redgifs.com/users/luciferron`',
          ephemeral: true
        });
      }

      if (!channel.isTextBased()) {
        return interaction.reply({
          content: '❌ Selected channel must be a text channel!',
          ephemeral: true
        });
      }

      const schedule = await RedGifsSchedule.create({
        guildId: interaction.guild.id,
        channelId: channel.id,
        sourceUrl: url,
        sourceType: sourceType,
        videoCount: count,
        intervalHours: interval,
        enabled: true
      });

      return interaction.reply({
        content: `✅ **RedGifs Auto-Poster Created!**\n\n📺 **Source:** ${url}\n📁 **Type:** ${sourceType}\n📹 **Videos per post:** ${count}\n⏰ **Interval:** Every ${interval} hours\n📍 **Channel:** <#${channel.id}>\n🆔 **Schedule ID:** ${schedule.id}\n\nThe first batch will post in ${interval} hours!`,
        ephemeral: true
      });
    }

    if (subcommand === 'list') {
      const schedules = await RedGifsSchedule.findAll({
        where: { guildId: interaction.guild.id }
      });

      if (schedules.length === 0) {
        return interaction.reply({
          content: '📭 No RedGifs auto-posters configured for this server.',
          ephemeral: true
        });
      }

      const list = schedules.map(s => {
        const status = s.enabled ? '✅ Active' : '❌ Disabled';
        const lastPost = s.lastPostTime 
          ? `Last: ${new Date(s.lastPostTime).toLocaleString()}`
          : 'Never posted yet';
        return `**ID ${s.id}** - ${status}\n📺 ${s.sourceUrl}\n📹 ${s.videoCount} videos every ${s.intervalHours}h → <#${s.channelId}>\n${lastPost}\n`;
      }).join('\n');

      return interaction.reply({
        content: `📋 **RedGifs Auto-Posters**\n\n${list}`,
        ephemeral: true
      });
    }

    if (subcommand === 'remove') {
      const id = interaction.options.getInteger('id');
      const deleted = await RedGifsSchedule.destroy({
        where: {
          id: id,
          guildId: interaction.guild.id
        }
      });

      if (deleted === 0) {
        return interaction.reply({
          content: `❌ Schedule ID ${id} not found in this server.`,
          ephemeral: true
        });
      }

      return interaction.reply({
        content: `✅ RedGifs auto-poster ID ${id} has been removed!`,
        ephemeral: true
      });
    }

    if (subcommand === 'toggle') {
      const id = interaction.options.getInteger('id');
      const schedule = await RedGifsSchedule.findOne({
        where: {
          id: id,
          guildId: interaction.guild.id
        }
      });

      if (!schedule) {
        return interaction.reply({
          content: `❌ Schedule ID ${id} not found in this server.`,
          ephemeral: true
        });
      }

      schedule.enabled = !schedule.enabled;
      await schedule.save();

      const status = schedule.enabled ? '✅ Enabled' : '❌ Disabled';
      return interaction.reply({
        content: `${status} RedGifs auto-poster ID ${id}`,
        ephemeral: true
      });
    }

    if (subcommand === 'trigger') {
      const id = interaction.options.getInteger('id');
      const schedule = await RedGifsSchedule.findOne({
        where: {
          id: id,
          guildId: interaction.guild.id
        }
      });

      if (!schedule) {
        return interaction.reply({
          content: `❌ Schedule ID ${id} not found in this server.`,
          ephemeral: true
        });
      }

      await interaction.reply({
        content: `🎬 Triggering RedGifs auto-poster now... Please wait while I fetch and post ${schedule.videoCount} videos.`,
        ephemeral: true
      });

      global.triggerRedGifsSchedule = id;
    }
  }
};
