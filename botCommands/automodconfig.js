const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { AutoModConfig } = require('../database');
const { hasHighLevelAccess } = require('../utilities/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automodconfig')
    .setDescription('Configure automod settings (Owner only)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('toggle')
        .setDescription('Enable or disable an automod feature')
        .addStringOption(option =>
          option
            .setName('feature')
            .setDescription('The automod feature to toggle')
            .setRequired(true)
            .addChoices(
              { name: 'Spam Detection', value: 'spamEnabled' },
              { name: 'Mention Spam', value: 'mentionSpamEnabled' },
              { name: 'Link Filter', value: 'linkFilterEnabled' },
              { name: 'Raid Protection', value: 'raidProtectionEnabled' },
              { name: 'Auto Lockdown on Raid', value: 'autoLockdownOnRaid' },
              { name: 'Duplicate Message Detection', value: 'duplicateMessageEnabled' }
            ))
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable or disable this feature')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('exemptrole')
        .setDescription('Add or remove a role from automod exemptions')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Add or remove the role')
            .setRequired(true)
            .addChoices(
              { name: 'Add', value: 'add' },
              { name: 'Remove', value: 'remove' }
            ))
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('The role to add/remove from exemptions')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View current automod configuration'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
    }

    const member = await guild.members.fetch(interaction.user.id);
    
    if (!(await hasHighLevelAccess(guild, member, interaction.client))) {
      return interaction.reply({ content: '❌ Only the server owner, administrators, or high-ranking members can use this command.', ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();

    let config = await AutoModConfig.findOne({ where: { guildId: guild.id } });
    if (!config) {
      config = await AutoModConfig.create({ guildId: guild.id });
    }

    if (subcommand === 'toggle') {
      const feature = interaction.options.getString('feature');
      const enabled = interaction.options.getBoolean('enabled');

      await config.update({ [feature]: enabled });

      const featureName = interaction.options._hoistedOptions.find(opt => opt.name === 'feature').value;
      const readableName = interaction.options._hoistedOptions[0].name === 'feature' 
        ? interaction.options._hoistedOptions[0].value 
        : featureName;

      return interaction.reply({
        content: `✅ **${featureName}** has been ${enabled ? 'enabled' : 'disabled'}.`,
        ephemeral: true
      });
    }

    if (subcommand === 'exemptrole') {
      const action = interaction.options.getString('action');
      const role = interaction.options.getRole('role');

      let exemptRoles = config.exemptRoles || [];

      if (action === 'add') {
        if (exemptRoles.includes(role.id)) {
          return interaction.reply({
            content: `⚠️ **${role.name}** is already exempt from automod.`,
            ephemeral: true
          });
        }

        exemptRoles.push(role.id);
        await config.update({ exemptRoles });

        return interaction.reply({
          content: `✅ **${role.name}** has been added to automod exemptions.`,
          ephemeral: true
        });
      }

      if (action === 'remove') {
        if (!exemptRoles.includes(role.id)) {
          return interaction.reply({
            content: `⚠️ **${role.name}** is not in the automod exemptions list.`,
            ephemeral: true
          });
        }

        exemptRoles = exemptRoles.filter(id => id !== role.id);
        await config.update({ exemptRoles });

        return interaction.reply({
          content: `✅ **${role.name}** has been removed from automod exemptions.`,
          ephemeral: true
        });
      }
    }

    if (subcommand === 'view') {
      const exemptRoles = config.exemptRoles || [];
      const exemptRoleNames = exemptRoles.map(id => {
        const role = guild.roles.cache.get(id);
        return role ? role.name : `Unknown (${id})`;
      }).join(', ') || 'None';

      const configMessage = `**🛡️ AutoMod Configuration for ${guild.name}**\n\n` +
        `**Spam Detection:** ${config.spamEnabled ? '✅' : '❌'}\n` +
        `**Mention Spam:** ${config.mentionSpamEnabled ? '✅' : '❌'}\n` +
        `**Link Filter:** ${config.linkFilterEnabled ? '✅' : '❌'}\n` +
        `**Raid Protection:** ${config.raidProtectionEnabled ? '✅' : '❌'}\n` +
        `**Auto Lockdown on Raid:** ${config.autoLockdownOnRaid ? '✅' : '❌'}\n` +
        `**Duplicate Message Detection:** ${config.duplicateMessageEnabled ? '✅' : '❌'}\n\n` +
        `**Exempt Roles:** ${exemptRoleNames}`;

      return interaction.reply({
        content: configMessage,
        ephemeral: true
      });
    }
  }
};
