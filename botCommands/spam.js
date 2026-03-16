const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spam')
    .setDescription('Spam a message 1000 times in this channel')
    .addStringOption(opt =>
      opt.setName('message').setDescription('Message to spam').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('Number of times to send (1-1000, default 1000)').setRequired(false).setMinValue(1).setMaxValue(1000)),

  async execute(interaction) {
    const message = interaction.options.getString('message');
    const amount = interaction.options.getInteger('amount') ?? 1000;

    await interaction.reply({ content: `📨 Spamming **"${message}"** × **${amount}** times...`, ephemeral: true });

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < amount; i++) {
      try {
        await interaction.channel.send(message);
        sent++;
      } catch (err) {
        failed++;
        // If we get rate limited, wait a moment then continue
        if (err.status === 429 || err.code === 429) {
          const wait = err.rawError?.retry_after ? err.rawError.retry_after * 1000 : 5000;
          await new Promise(r => setTimeout(r, wait));
          try {
            await interaction.channel.send(message);
            sent++;
            failed--;
          } catch (e) { /* give up on this one */ }
        }
      }
    }

    try {
      await interaction.channel.send(`✅ Done! Sent **${sent}** messages. Failed: **${failed}**`);
    } catch (e) {}
  }
};
