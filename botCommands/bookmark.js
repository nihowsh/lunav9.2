const { ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Bookmark Message')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    const message = interaction.targetMessage;
    const { Bookmarks } = require('../database');

    try {
      await Bookmarks.create({
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        channelId: message.channel.id,
        messageId: message.id,
        messageContent: message.content || '[No text content]',
        messageAuthor: message.author.tag,
        messageUrl: message.url,
        createdAt: new Date(),
      });

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('📌 Message Bookmarked!')
        .setDescription(`Saved message from ${message.author.tag}`)
        .addFields(
          { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
          { name: 'Jump to Message', value: `[Click here](${message.url})`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Bookmark error:', error);
      await interaction.reply({ 
        content: '❌ Failed to bookmark message. You may have already bookmarked this message.', 
        ephemeral: true 
      });
    }
  },
};
