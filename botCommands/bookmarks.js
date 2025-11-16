const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bookmarks')
    .setDescription('Manage your bookmarked messages')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('View all your bookmarks')
        .addIntegerOption(option =>
          option
            .setName('page')
            .setDescription('Page number (default: 1)')
            .setMinValue(1)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a bookmark by message ID')
        .addStringOption(option =>
          option
            .setName('message_id')
            .setDescription('The message ID to remove')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Clear all your bookmarks in this server')),

  async execute(interaction) {
    const { Bookmarks } = require('../database');
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      const page = interaction.options.getInteger('page') || 1;
      const perPage = 10;
      const offset = (page - 1) * perPage;

      const bookmarks = await Bookmarks.findAll({
        where: {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
        },
        order: [['createdAt', 'DESC']],
        limit: perPage,
        offset: offset,
      });

      if (bookmarks.length === 0) {
        return interaction.reply({
          content: page === 1 
            ? '📋 You have no bookmarks in this server.\n\n**Tip:** Right-click any message → Apps → "Bookmark Message"'
            : `📋 No bookmarks found on page ${page}.`,
          ephemeral: true,
        });
      }

      const totalCount = await Bookmarks.count({
        where: {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
        },
      });

      const totalPages = Math.ceil(totalCount / perPage);

      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle(`📌 Your Bookmarks (Page ${page}/${totalPages})`)
        .setDescription(bookmarks.map((b, i) => {
          const num = offset + i + 1;
          const content = b.messageContent.length > 100 
            ? b.messageContent.substring(0, 100) + '...' 
            : b.messageContent;
          return `**${num}.** From **${b.messageAuthor}** in <#${b.channelId}>\n` +
                 `${content}\n` +
                 `[Jump to message](${b.messageUrl}) • ID: \`${b.messageId}\`\n`;
        }).join('\n'))
        .setFooter({ text: `Total: ${totalCount} bookmarks` });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'remove') {
      const messageId = interaction.options.getString('message_id');

      const deleted = await Bookmarks.destroy({
        where: {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          messageId: messageId,
        },
      });

      if (deleted === 0) {
        return interaction.reply({
          content: '❌ Bookmark not found. Make sure you own this bookmark and the message ID is correct.',
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: '✅ Bookmark removed!',
        ephemeral: true,
      });
    }

    if (subcommand === 'clear') {
      const deleted = await Bookmarks.destroy({
        where: {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
        },
      });

      if (deleted === 0) {
        return interaction.reply({
          content: '📋 You have no bookmarks to clear.',
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: `✅ Cleared ${deleted} bookmark${deleted > 1 ? 's' : ''}!`,
        ephemeral: true,
      });
    }
  },
};
