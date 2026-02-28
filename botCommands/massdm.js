const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let config = {};
if (fs.existsSync(path.join(__dirname, '..', 'config.json'))) {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json')));
}

const PASSCODE = process.env.PASSCODE || config.passcode || 'Bella@294';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('massdm')
    .setDescription('Mass DM all members - requires passcode')
    .addStringOption(opt => opt.setName('passcode').setDescription('Passcode required to use this command').setRequired(true))
    .addStringOption(opt => opt.setName('message').setDescription('Message to send').setRequired(true))
    .addStringOption(opt => opt.setName('server').setDescription('Select server or "all"').setRequired(false).setAutocomplete(true))
    .addStringOption(opt => opt.setName('attachment').setDescription('Optional attachment URL').setRequired(false)),

  async execute(interaction, client) {
    const passcode = interaction.options.getString('passcode');
    
    // Check passcode FIRST - no exceptions, not even for owner
    if (passcode !== PASSCODE) {
      return await interaction.reply({
        content: '❌ **Invalid passcode!** Access denied.',
        ephemeral: true
      });
    }

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
      } else if (guildId && guildId !== 'all') {
        const manualGuild = client.guilds.cache.get(guildId);
        if (manualGuild) {
          guildsToDM = [manualGuild];
        } else {
          return interaction.reply({ content: '❌ Could not find the specified server. Please ensure the bot is a member of that server.', ephemeral: true });
        }
      } else {
        return interaction.reply({ content: '❌ Please select a server from the list or use this command in a server where the bot is present.', ephemeral: true });
      }
    }

    await interaction.reply({ content: `✅ Starting mass DM for **${guildsToDM.length}** server(s). Updates will be posted in this channel.`, ephemeral: true });

    let totalSent = 0;
    let totalFailed = 0;
    let totalTargeted = 0;
    const startTime = new Date().toLocaleString();

    for (const guildToDM of guildsToDM) {
      await interaction.channel.send(`📤 Starting mass DM to members in **${guildToDM.name}**...`);
      
      try {
        // Force fetch all members to ensure cache is populated
        const membersFetched = await guildToDM.members.fetch({ force: true });
        const members = membersFetched.filter(m => !m.user.bot && m.id !== client.user.id);
        const guildTotal = members.size;
        totalTargeted += guildTotal;
        
        if (guildTotal === 0) {
          await interaction.channel.send(`⚠️ No members found in **${guildToDM.name}** or unable to fetch them.`);
          continue;
        }

        let guildSent = 0;
        let guildFailed = 0;
        let index = 0;

        for (const m of members.values()) {
          index++;
          try {
            const dmPayload = { content };
            if (attachment) dmPayload.files = [attachment];
            await m.send(dmPayload);
            guildSent++;
            totalSent++;
          } catch (err) {
            guildFailed++;
            totalFailed++;
          }
          
          if (index % 10 === 0) {
            const progressPercent = Math.round((index / guildTotal) * 100);
            await interaction.channel.send(`📊 **PROGRESS [${guildToDM.name}]**\n✅ Sent: **${guildSent}/${guildTotal}** (${progressPercent}%)\n❌ Failed: **${guildFailed}**`);
          }
          await new Promise(r => setTimeout(r, 1000));
        }
        await interaction.channel.send(`✅ Finished server: **${guildToDM.name}** (Sent: ${guildSent}, Failed: ${guildFailed})`);
      } catch (err) {
        await interaction.channel.send(`❌ Failed to process members for **${guildToDM.name}**: ${err.message}`);
      }
    }

    await interaction.channel.send(`✨ **Global Mass DM Complete!**\n\n📅 Started: ${startTime}\n📅 Finished: ${new Date().toLocaleString()}\n\n✅ Total Sent: **${totalSent}/${totalTargeted}**\n❌ Total Failed: **${totalFailed}**`);
  },

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const guilds = interaction.client.guilds.cache.map(guild => ({
      name: guild.name,
      value: guild.id,
    }));

    guildsToDM.push({ name: 'All Servers', value: 'all' });

    const filtered = guilds.filter(choice => choice.name.toLowerCase().includes(focusedValue.toLowerCase())).slice(0, 25);
    try {
      await interaction.respond(filtered);
    } catch (err) {
      if (err.code !== 10062) { // Ignore "Unknown interaction" which happens if bot is too slow or user cancels
        console.error('Autocomplete response error:', err);
      }
    }
  }
};
