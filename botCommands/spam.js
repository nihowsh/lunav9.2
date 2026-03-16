const { SlashCommandBuilder, ChannelType } = require('discord.js');

// Returns a send function and optional cleanup
async function getSender(interaction) {
  const ch = interaction.channel;
  if (!ch) return { send: null };

  // Try direct channel send first (bot is in this server)
  try {
    await ch.send({ content: '\u200b' }).then(m => m.delete().catch(() => {}));
    return { send: (content) => ch.send(content) };
  } catch (e) {}

  // Fallback: temporary webhook
  if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) {
    try {
      const wh = await ch.createWebhook({ name: 'Heisenberg Spam', reason: 'Spam command' });
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
    .setName('spam')
    .setDescription('Spam a message up to 1000 times in this channel')
    .addStringOption(opt =>
      opt.setName('message').setDescription('Message to spam').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('How many times (1-1000, default 1000)').setRequired(false).setMinValue(1).setMaxValue(1000)),

  async execute(interaction) {
    const message = interaction.options.getString('message');
    const amount = interaction.options.getInteger('amount') ?? 1000;

    await interaction.deferReply({ ephemeral: true });

    const { send, cleanup } = await getSender(interaction);

    if (!send) {
      return interaction.editReply({ content: '❌ Cannot send messages here. Make sure the bot has Send Messages permission.' });
    }

    let sent = 0;
    // Send in batches of 10 for max speed
    const BATCH = 10;
    for (let i = 0; i < amount; i += BATCH) {
      const batchSize = Math.min(BATCH, amount - i);
      const batch = [];
      for (let j = 0; j < batchSize; j++) {
        batch.push(
          send(message)
            .then(() => sent++)
            .catch(async (err) => {
              if (err.status === 429) {
                const wait = (err.rawError?.retry_after ?? 1) * 1000;
                await new Promise(r => setTimeout(r, wait));
                return send(message).then(() => sent++).catch(() => {});
              }
            })
        );
      }
      await Promise.all(batch);
      if (i + BATCH < amount) await new Promise(r => setTimeout(r, 400));
    }

    if (cleanup) await cleanup();
    await interaction.editReply({ content: `✅ Done! Sent **${sent}** / **${amount}** messages.` });
  }
};
