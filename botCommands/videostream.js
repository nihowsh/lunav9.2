const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

let activeVideoStreams = new Map();

async function getVideoMetadata(url) {
  try {
    const command = `/tmp/yt-dlp --dump-single-json --no-warnings --format "best" --no-check-certificate --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
    
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000
    });

    if (stderr && stderr.includes('ERROR')) {
      throw new Error(stderr);
    }

    const info = JSON.parse(stdout);

    let videoUrl = info.url;
    
    if (!videoUrl && info.formats && info.formats.length > 0) {
      const videoFormat = info.formats.find(f => f.vcodec && f.vcodec !== 'none' && f.url) || 
                         info.formats.find(f => f.url);
      if (videoFormat) {
        videoUrl = videoFormat.url;
      }
    }
    
    if (!videoUrl) {
      throw new Error('Could not extract video URL. The video may be private, age-restricted, or require login.');
    }

    return {
      title: info.title || 'Unknown',
      duration: info.duration || 0,
      uploader: info.uploader || 'Unknown',
      url: videoUrl,
      width: info.width || 1280,
      height: info.height || 720,
    };
  } catch (error) {
    console.error('yt-dlp error:', error);
    throw new Error(`Failed to fetch video info: ${error.message}`);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('videostream')
    .setDescription('Stream VIDEO with audio from any video URL (requires selfbot)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Start video streaming (PornHub, YouTube, etc.)')
        .addStringOption(option =>
          option
            .setName('url')
            .setDescription('Video URL from any supported site')
            .setRequired(true))
        .addStringOption(option =>
          option
            .setName('usertoken')
            .setDescription('Your Discord user token for selfbot streaming')
            .setRequired(true))
        .addBooleanOption(option =>
          option
            .setName('loop')
            .setDescription('Loop the video continuously (default: true)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('stop')
        .setDescription('Stop the current video stream'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check current video streaming status'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'start') {
      await interaction.deferReply({ ephemeral: true });

      const url = interaction.options.getString('url');
      const userToken = interaction.options.getString('usertoken');
      const loop = interaction.options.getBoolean('loop') ?? true;

      const member = await interaction.guild.members.fetch(interaction.user.id);
      const voiceChannel = member.voice.channel;

      if (!voiceChannel) {
        return interaction.editReply('❌ You need to be in a voice channel!');
      }

      if (activeVideoStreams.has(guildId)) {
        return interaction.editReply('❌ A video stream is already active. Use `/videostream stop` first.');
      }

      await interaction.editReply('🔄 Preparing video stream... This may take a moment...');

      try {
        const metadata = await getVideoMetadata(url);
        
        const instructions = `
📺 **Video Streaming Setup Instructions**

To stream video with audio in Discord, you need to use a selfbot. Here's how:

**Step 1:** Download and set up the selfbot streamer:
\`\`\`bash
# Install the streaming tool
npm install -g discord-video-stream
\`\`\`

**Step 2:** Run this command in your terminal:
\`\`\`bash
# Stream the video
ffmpeg -re -i "${metadata.url}" -vcodec libvpx -cpu-used 5 -deadline 1 -g 10 -error-resilient 1 -auto-alt-ref 1 -f webm pipe:1 | discord-stream --token "${userToken.substring(0, 20)}..." --channel ${voiceChannel.id}
\`\`\`

**Alternative: Use OBS Virtual Camera**
1. Open OBS Studio
2. Add Browser Source with URL: \`${url}\`
3. Start Virtual Camera
4. Join voice channel and share your screen (select OBS Virtual Camera)

**Video Info:**
📹 **Title:** ${metadata.title}
⏱️ **Duration:** ${Math.floor(metadata.duration / 60)}:${String(Math.floor(metadata.duration % 60)).padStart(2, '0')}
👤 **Uploader:** ${metadata.uploader}
🎥 **Resolution:** ${metadata.width}x${metadata.height}
🔁 **Loop:** ${loop ? 'Enabled' : 'Disabled'}

⚠️ **Note:** Discord's API doesn't officially support bot video streaming. You'll need to use a user account (selfbot) with screen sharing or Go Live feature.
        `;

        await interaction.editReply(instructions);

      } catch (error) {
        console.error('Video stream error:', error);
        return interaction.editReply(`❌ Failed to prepare stream: ${error.message}`);
      }

    } else if (subcommand === 'stop') {
      return interaction.reply({ 
        content: '✅ To stop video streaming, simply disconnect from the voice channel or stop your screen share.',
        ephemeral: true 
      });

    } else if (subcommand === 'status') {
      return interaction.reply({ 
        content: '📊 Video streaming status: Check your voice channel for active screen shares or Go Live streams.',
        ephemeral: true 
      });
    }
  },
};
