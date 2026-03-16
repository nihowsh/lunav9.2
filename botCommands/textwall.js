const { SlashCommandBuilder } = require('discord.js');

// Build a single max-length (2000 char) wall block
function buildWallBlock(fillChar, customText, isLast) {
  if (isLast && customText) {
    const reserved = customText.length;
    const fill = fillChar.repeat(Math.max(0, 2000 - reserved));
    return fill + customText;
  }
  return fillChar.repeat(2000);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('textwall')
    .setDescription('Send the biggest textwall ever')
    .addStringOption(opt =>
      opt.setName('text').setDescription('Custom text to appear at the very end').setRequired(false))
    .addIntegerOption(opt =>
      opt.setName('messages').setDescription('Number of wall messages to send (1-100, default 100)').setRequired(false).setMinValue(1).setMaxValue(100)),

  async execute(interaction) {
    const customText = interaction.options.getString('text') || '';
    const msgCount = interaction.options.getInteger('messages') ?? 100;

    // Defer so we have time to send all messages
    await interaction.deferReply({ ephemeral: true });

    const wallChar = '█';

    for (let i = 0; i < msgCount; i++) {
      const isLast = i === msgCount - 1;
      const block = buildWallBlock(wallChar, customText, isLast);
      try {
        await interaction.followUp({ content: block, ephemeral: false });
      } catch (err) {
        console.error('textwall send error:', err.message);
      }
    }

    try {
      await interaction.editReply({ content: `⬛ Textwall done — ${msgCount} messages sent.` });
    } catch (e) {}
  }
};
