const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ChannelWordFilter } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channelwordfilter')
    .setDescription('Manage word filters for specific channels')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Block a word or phrase in a specific channel')
        .addChannelOption(option =>
          option.setName('channel').setDescription('Channel to block the word in').setRequired(true))
        .addStringOption(option =>
          option.setName('word').setDescription('Word or phrase to block').setRequired(true))
        .addBooleanOption(option =>
          option.setName('case_sensitive').setDescription('Make the filter case-sensitive (default: false)').setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a word filter from a channel')
        .addChannelOption(option =>
          option.setName('channel').setDescription('Channel with the filter').setRequired(true))
        .addStringOption(option =>
          option.setName('word').setDescription('Word or phrase to unblock').setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all word filters for a channel')
        .addChannelOption(option =>
          option.setName('channel').setDescription('Channel to list filters for').setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Enable or disable a word filter')
        .addChannelOption(option =>
          option.setName('channel').setDescription('Channel with the filter').setRequired(true))
        .addStringOption(option =>
          option.setName('word').setDescription('Word or phrase to toggle').setRequired(true))
        .addBooleanOption(option =>
          option.setName('enabled').setDescription('Enable or disable').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    try {
      if (subcommand === 'add') {
        const channel = interaction.options.getChannel('channel');
        const word = interaction.options.getString('word');
        const caseSensitive = interaction.options.getBoolean('case_sensitive') || false;

        const existing = await ChannelWordFilter.findOne({
          where: { guildId, channelId: channel.id, word }
        });

        if (existing) {
          return await interaction.editReply({
            content: `⚠️ The word "${word}" is already blocked in ${channel}`
          });
        }

        await ChannelWordFilter.create({
          guildId,
          channelId: channel.id,
          word,
          caseSensitive,
          enabled: true
        });

        await interaction.editReply({
          content: `✅ **Word filter added!**\n\n🔒 Word: **${word}**\n📍 Channel: ${channel}\n🔤 Case Sensitive: **${caseSensitive ? 'Yes' : 'No'}**\n\nMessages containing this word will be automatically deleted in ${channel}.`
        });

      } else if (subcommand === 'remove') {
        const channel = interaction.options.getChannel('channel');
        const word = interaction.options.getString('word');

        const deleted = await ChannelWordFilter.destroy({
          where: { guildId, channelId: channel.id, word }
        });

        if (deleted === 0) {
          return await interaction.editReply({
            content: `❌ No filter found for "${word}" in ${channel}`
          });
        }

        await interaction.editReply({
          content: `✅ **Filter removed!**\n\n🔓 Word: **${word}**\n📍 Channel: ${channel}\n\nMessages containing this word will no longer be filtered in ${channel}.`
        });

      } else if (subcommand === 'list') {
        const channel = interaction.options.getChannel('channel');

        const filters = await ChannelWordFilter.findAll({
          where: channel ? { guildId, channelId: channel.id } : { guildId }
        });

        if (filters.length === 0) {
          return await interaction.editReply({
            content: channel 
              ? `❌ No word filters configured for ${channel}` 
              : '❌ No word filters configured for any channel'
          });
        }

        const filtersByChannel = {};
        for (const filter of filters) {
          if (!filtersByChannel[filter.channelId]) {
            filtersByChannel[filter.channelId] = [];
          }
          filtersByChannel[filter.channelId].push(filter);
        }

        let response = '📋 **Channel Word Filters:**\n\n';
        for (const [channelId, channelFilters] of Object.entries(filtersByChannel)) {
          const ch = interaction.guild.channels.cache.get(channelId);
          const channelName = ch ? `<#${channelId}>` : `(Deleted Channel: ${channelId})`;
          response += `**${channelName}:**\n`;
          for (const filter of channelFilters) {
            const status = filter.enabled ? '✅' : '❌';
            const caseInfo = filter.caseSensitive ? ' (Case Sensitive)' : '';
            response += `${status} ${filter.word}${caseInfo}\n`;
          }
          response += '\n';
        }

        await interaction.editReply({ content: response });

      } else if (subcommand === 'toggle') {
        const channel = interaction.options.getChannel('channel');
        const word = interaction.options.getString('word');
        const enabled = interaction.options.getBoolean('enabled');

        const filter = await ChannelWordFilter.findOne({
          where: { guildId, channelId: channel.id, word }
        });

        if (!filter) {
          return await interaction.editReply({
            content: `❌ No filter found for "${word}" in ${channel}`
          });
        }

        await filter.update({ enabled });

        await interaction.editReply({
          content: `✅ **Filter ${enabled ? 'enabled' : 'disabled'}!**\n\n📝 Word: **${word}**\n📍 Channel: ${channel}\n\nThe filter is now **${enabled ? 'active' : 'inactive'}**.`
        });
      }

    } catch (err) {
      console.error('Error managing channel word filter:', err);
      await interaction.editReply({ content: '❌ Error managing word filter. Please try again.' });
    }
  },
};
