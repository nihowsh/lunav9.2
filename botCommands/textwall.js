const { SlashCommandBuilder, ChannelType } = require('discord.js');

function buildWallBlock(customText, isLast) {
  const wallChar = '█';
  if (isLast && customText) {
    const fill = wallChar.repeat(Math.max(0, 2000 - customText.length));
    return fill + customText;
  }
  return wallChar.repeat(2000);
}

// Returns a send function and optional cleanup
async function getSender(interaction) {
  const ch = interaction.channel;
  if (!ch) return { send: null };

  // Try direct channel send first (bot is in this server)
  try {
    await ch.send({ content: '\u200b' }).then(m => m.delete().catch(() => {}));
    return { send: (content) => ch.send(content) };
  } catch (e) {}

  // Fallback: create a temporary webhook (works in user-install contexts if user has Manage Webhooks)
  if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) {
    try {
      const wh = await ch.createWebhook({ name: 'Heisenberg Wall', reason: 'Textwall command' });
      return {
        send: (content) => wh.send(content),
        cleanup: () => wh.delete().catch(() => {})
      };
    } catch (e) {}
  }

  return { send: null };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('textwall')
    .setDescription('Send the biggest textwall ever')
    .addStringOption(opt =>
      opt.setName('text').setDescription('Custom text at the very end').setRequired(false))
    .addIntegerOption(opt =>
      opt.setName('messages').setDescription('Number of wall messages (1-100, default 100)').setRequired(false).setMinValue(1).setMaxValue(100)),

  async execute(interaction) {
    const customText = interaction.options.getString('text') || '';
    const msgCount = interaction.options.getInteger('messages') ?? 100;

    await interaction.deferReply({ ephemeral: true });

    const { send, cleanup } = await getSender(interaction);

    if (!send) {
      return interaction.editReply({ content: '❌ Cannot send messages here. Make sure the bot has Send Messages permission.' });
    }

    let sent = 0;
    // Send in batches of 5, brief pause between batches to stay under rate limits
    const BATCH = 5;
    for (let i = 0; i < msgCount; i += BATCH) {
      const batchSize = Math.min(BATCH, msgCount - i);
      const batch = [];
      for (let j = 0; j < batchSize; j++) {
        const idx = i + j;
        const isLast = idx === msgCount - 1;
        batch.push(
          send(buildWallBlock(customText, isLast))
            .then(() => sent++)
            .catch(() => {})
        );
      }
      await Promise.all(batch);
      if (i + BATCH < msgCount) await new Promise(r => setTimeout(r, 600));
    }

    if (cleanup) await cleanup();
    await interaction.editReply({ content: `⬛ Done — **${sent}** wall messages sent (${sent * 2000} characters total).` });
  }
};
