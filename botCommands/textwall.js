const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

function buildWallBlock(customText, isLast) {
  const wallChar = '█';
  if (isLast && customText) {
    const fill = wallChar.repeat(Math.max(0, 2000 - customText.length));
    return fill + customText;
  }
  return wallChar.repeat(2000);
}

async function sendViaUserToken(channelId, content, token) {
  await axios.post(
    `https://discord.com/api/v9/channels/${channelId}/messages`,
    { content },
    { headers: { Authorization: token, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
  );
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
    for (let i = 0; i < msgCount; i++) {
      const isLast = i === msgCount - 1;
      const block = buildWallBlock(customText, isLast);
      try {
        if (useUserToken) {
          await sendViaUserToken(channelId, block, userToken);
        } else {
          await interaction.channel.send(block);
        }
        sent++;
      } catch (err) {
        if (err.response?.status === 429) {
          const retryAfter = (err.response.data?.retry_after ?? 1) * 1000;
          await new Promise(r => setTimeout(r, retryAfter));
          i--; // retry this message
          continue;
        }
        console.error('textwall error:', err.message);
      }
      // Small delay every 5 messages to avoid rate limits
      if ((i + 1) % 5 === 0 && i + 1 < msgCount) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    await interaction.editReply({ content: `⬛ Done — **${sent}** wall messages sent (${sent * 2000} █ characters).` });
  }
};
