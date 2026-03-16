const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not found in environment variables!');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'botCommands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    // Convert to JSON then add integration_types + contexts for user-install support
    const json = command.data.toJSON();
    json.integration_types = [0, 1]; // 0 = guild install, 1 = user install
    json.contexts = [0, 1, 2];       // 0 = guild, 1 = bot DM, 2 = private channel
    commands.push(json);
    console.log(`✅ Loaded command: ${command.data.name}`);
  }
}

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
  try {
    console.log(`\n🔄 Started registering ${commands.length} application (/) commands...`);

    const data = await rest.put(
      Routes.applicationCommands(await getClientId()),
      { body: commands },
    );

    console.log(`✅ Successfully registered ${data.length} application (/) commands globally!`);
    console.log('\n📝 Registered commands:');
    data.forEach(cmd => console.log(`   - /${cmd.name}`));
    console.log('\n✅ All commands support: Guild install + User install (external servers/DMs/PCs)');
    console.log('⚠️  Note: Global commands may take up to 1 hour to appear in Discord.\n');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();

async function getClientId() {
  const { Client, GatewayIntentBits } = require('discord.js');
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(BOT_TOKEN);
  const clientId = client.user.id;
  await client.destroy();
  return clientId;
}
