const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

async function sendViaUserToken(channelId, content, token) {
  await axios.post(
    `https://discord.com/api/v9/channels/${channelId}/messages`,
    { content },
    { headers: { Authorization: token, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
  );
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
    const channelId = interaction.channelId;
    const userToken = process.env.DISCORD_VIDEO_TOKEN;

    await interaction.deferReply({ ephemeral: true });

    // Determine send method: direct channel (bot in server) or user token (external app)
    let useUserToken = false;
    if (interaction.channel) {
      try {
        const test = await interaction.channel.send('\u200b');
        await test.delete().catch(() => {});
      } catch {
        useUserToken = true;
      }
    } else {
      useUserToken = true;
    }

    if (useUserToken && !userToken) {
      return interaction.editReply({ content: '❌ No user token configured. Set `DISCORD_VIDEO_TOKEN` to use this in external servers.' });
    }

    let sent = 0;
    let i = 0;
    while (i < amount) {
      try {
        if (useUserToken) {
          await sendViaUserToken(channelId, message, userToken);
        } else {
          await interaction.channel.send(message);
        }
        sent++;
        i++;
      } catch (err) {
        if (err.response?.status === 429) {
          const retryAfter = (err.response.data?.retry_after ?? 1) * 1000;
          await new Promise(r => setTimeout(r, retryAfter));
          continue; // retry same message
        }
        console.error('spam error:', err.message);
        i++;
      }
      // Brief pause every 5 messages
      if (sent % 5 === 0 && i < amount) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    await interaction.editReply({ content: `✅ Done! Sent **${sent}** / **${amount}** messages.` });
  }
};
