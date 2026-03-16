const { SlashCommandBuilder } = require('discord.js');
const { Client: SelfbotClient } = require('discord.js-selfbot-v13');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let config = {};
if (fs.existsSync(path.join(__dirname, '..', 'config.json'))) {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json')));
}

const PASSCODE = process.env.PASSCODE || config.passcode || 'Bella@294';

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('massdm')
    .setDescription('Mass DM all members - requires passcode')
    .addStringOption(opt => opt.setName('passcode').setDescription('Passcode required to use this command').setRequired(true))
    .addStringOption(opt => opt.setName('message').setDescription('Message to send').setRequired(true))
    .addStringOption(opt => opt.setName('server').setDescription('Select server or "all"').setRequired(false).setAutocomplete(true))
    .addStringOption(opt => opt.setName('usertoken').setDescription('User account token for selfbot mode (optional, more reliable)').setRequired(false))
    .addBooleanOption(opt => opt.setName('nodelay').setDescription('Send all at once with no delays (faster but riskier)').setRequired(false))
    .addStringOption(opt => opt.setName('attachment').setDescription('Optional attachment URL').setRequired(false)),

  async execute(interaction, client) {
    const passcode = interaction.options.getString('passcode');

    if (passcode !== PASSCODE) {
      return await interaction.reply({
        content: '❌ **Invalid passcode!** Access denied.',
        ephemeral: true
      });
    }

    const content = interaction.options.getString('message');
    const attachment = interaction.options.getString('attachment');
    const userToken = interaction.options.getString('usertoken');
    const noDelay = interaction.options.getBoolean('nodelay') ?? false;
    const guildId = interaction.options.getString('server');
    let guildsToDM = [];

    if (guildId === 'all') {
      guildsToDM = Array.from(client.guilds.cache.values());
    } else if (guildId) {
      const selectedGuild = client.guilds.cache.get(guildId);
      if (selectedGuild) guildsToDM = [selectedGuild];
    }

    if (guildsToDM.length === 0) {
      if (interaction.guild) {
        guildsToDM = [interaction.guild];
      } else {
        return interaction.reply({ content: '❌ Please select a server from the list or use this command inside a server.', ephemeral: true });
      }
    }

    const mode = userToken ? 'selfbot (user token)' : 'bot account';
    const delayMode = noDelay ? 'no delay' : '12-35s delays + batch cooldowns';
    await interaction.reply({
      content: `✅ Starting mass DM for **${guildsToDM.length}** server(s).\n📡 Mode: **${mode}**\n⏱️ Delay: **${delayMode}**`,
      ephemeral: true
    });

    const sendUpdate = async (msg) => {
      try { await interaction.channel.send(msg); } catch (e) { console.error('sendUpdate error:', e.message); }
    };

    // Setup selfbot if token provided
    let selfbot = null;
    if (userToken) {
      selfbot = new SelfbotClient({ checkUpdate: false });
      selfbot.on('error', () => {});
      try {
        await selfbot.login(userToken);
        await sendUpdate(`✅ Selfbot logged in as **${selfbot.user.tag}**. Starting broadcast...`);
        await sleep(5000);
      } catch (err) {
        await sendUpdate(`❌ **Failed to login with provided token:** ${err.message}\n\nFalling back to bot account mode.`);
        selfbot = null;
      }
    }

    let totalSent = 0;
    let totalFailed = 0;
    let totalTargeted = 0;
    const startTime = new Date().toLocaleString();

    for (const guildToDM of guildsToDM) {
      await sendUpdate(`📤 Fetching members in **${guildToDM.name}**...`);

      try {
        const membersFetched = await guildToDM.members.fetch({ force: true });
        const members = Array.from(membersFetched.filter(m => !m.user.bot && m.id !== client.user.id).values());
        const guildTotal = members.length;
        totalTargeted += guildTotal;

        if (guildTotal === 0) {
          await sendUpdate(`⚠️ No members found in **${guildToDM.name}**.`);
          continue;
        }

        await sendUpdate(`📤 Sending DMs to **${guildTotal}** members in **${guildToDM.name}**...`);

        let guildSent = 0;
        let guildFailed = 0;

        for (let i = 0; i < members.length; i++) {
          const member = members[i];

          try {
            if (selfbot) {
              // Selfbot mode: open DM via REST API with user token
              const dmResponse = await axios.post(
                'https://discord.com/api/v9/users/@me/channels',
                { recipient_id: member.user.id },
                {
                  headers: {
                    'Authorization': userToken,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  }
                }
              );

              if (dmResponse.data && dmResponse.data.id) {
                const channelId = dmResponse.data.id;
                let dmChannel = selfbot.channels.cache.get(channelId);
                if (!dmChannel) dmChannel = await selfbot.channels.fetch(channelId).catch(() => null);

                if (dmChannel) {
                  const msgPayload = { content };
                  if (attachment) msgPayload.files = [attachment];
                  await dmChannel.send(msgPayload);
                  guildSent++;
                  totalSent++;
                } else {
                  guildFailed++;
                  totalFailed++;
                }
              } else {
                guildFailed++;
                totalFailed++;
              }
            } else {
              // Bot account mode
              const dmPayload = { content };
              if (attachment) dmPayload.files = [attachment];
              await member.send(dmPayload);
              guildSent++;
              totalSent++;
            }
          } catch (err) {
            guildFailed++;
            totalFailed++;
          }

          // Progress every 10
          if ((i + 1) % 10 === 0) {
            const progressPercent = Math.round(((i + 1) / guildTotal) * 100);
            await sendUpdate(`📊 **PROGRESS [${guildToDM.name}]**\n✅ Sent: **${guildSent}/${guildTotal}** (${progressPercent}%)\n❌ Failed: **${guildFailed}**`);

            if (!noDelay && selfbot && i + 1 < members.length) {
              const cooldownMs = getRandomDelay(180000, 480000);
              const cooldownMin = Math.round(cooldownMs / 60000);
              await sendUpdate(`⏳ Cooling down for **${cooldownMin} min** before next batch...`);
              await sleep(cooldownMs);
            }
          } else if (!noDelay) {
            if (selfbot) {
              await sleep(getRandomDelay(12000, 35000));
            } else {
              await sleep(1500);
            }
          }
        }

        await sendUpdate(`✅ Finished **${guildToDM.name}** — Sent: ${guildSent}, Failed: ${guildFailed}`);
      } catch (err) {
        await sendUpdate(`❌ Failed to process **${guildToDM.name}**: ${err.message}`);
      }
    }

    if (selfbot) {
      try { selfbot.destroy(); } catch (e) {}
    }

    await sendUpdate(`✨ **Mass DM Complete!**\n\n📅 Started: ${startTime}\n📅 Finished: ${new Date().toLocaleString()}\n\n✅ Total Sent: **${totalSent}/${totalTargeted}**\n❌ Total Failed: **${totalFailed}**`);
  },

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const guilds = interaction.client.guilds.cache.map(guild => ({
      name: guild.name,
      value: guild.id,
    }));

    guilds.push({ name: 'All Servers', value: 'all' });

    const filtered = guilds.filter(choice => choice.name.toLowerCase().includes(focusedValue.toLowerCase())).slice(0, 25);
    try {
      await interaction.respond(filtered);
    } catch (err) {
      if (err.code !== 10062) {
        console.error('Autocomplete response error:', err);
      }
    }
  }
};
