const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { Client: SelfbotClient } = require('discord.js-selfbot-v13');
const { Streamer, streamLivestreamVideo } = require('@dank074/discord-video-stream');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

let activeSelfbotStreamers = new Map();
let selfbotClient = null;

async function getVideoUrl(url) {
  try {
    const command = `/tmp/yt-dlp --get-url --format "best" --no-check-certificate --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
    
    const { stdout } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000
    });

    return stdout.trim();
  } catch (error) {
    console.error('yt-dlp URL fetch error:', error);
    throw new Error(`Failed to fetch video URL: ${error.message}`);
  }
}

async function getVideoMetadata(url) {
  try {
    const command = `/tmp/yt-dlp --dump-single-json --no-warnings --format "best" --no-check-certificate --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
    
    const { stdout } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000
    });

    const info = JSON.parse(stdout);

    return {
      title: info.title || 'Unknown',
      duration: info.duration || 0,
      uploader: info.uploader || 'Unknown',
      width: info.width || 1280,
      height: info.height || 720,
      is_live: info.is_live || false,
    };
  } catch (error) {
    throw new Error(`Failed to fetch video info: ${error.message}`);
  }
}

async function streamVideoLoop(streamer, originalUrl, loop, guildId) {
  const streamData = activeSelfbotStreamers.get(guildId);
  if (!streamData) return;

  console.log(`🎥 Starting video stream loop for guild ${guildId}`);
  
  const playNext = async () => {
    const streamData = activeSelfbotStreamers.get(guildId);
    if (!streamData || streamData.stopping) {
      console.log('Stream stopped by user or cleanup');
      return;
    }

    let streamUdpConn = null;

    try {
      console.log('📹 Refreshing video URL...');
      const freshVideoUrl = await getVideoUrl(originalUrl);
      
      console.log('🔄 Creating new stream connection...');
      streamUdpConn = await streamer.createStream();
      streamData.currentUdpConnection = streamUdpConn;
      
      streamUdpConn.mediaConnection.setSpeaking(true);
      streamUdpConn.mediaConnection.setVideoStatus(true);
      
      console.log('📹 Streaming video...');
      await streamLivestreamVideo(freshVideoUrl, streamUdpConn);
      console.log('✅ Video playback finished');
      
      streamUdpConn.mediaConnection.setSpeaking(false);
      streamUdpConn.mediaConnection.setVideoStatus(false);
      
      if (streamUdpConn.mediaConnection && typeof streamUdpConn.mediaConnection.destroy === 'function') {
        streamUdpConn.mediaConnection.destroy();
      }
      
      streamData.currentUdpConnection = null;
      
      if (loop && activeSelfbotStreamers.has(guildId) && !streamData.stopping) {
        console.log('🔁 Looping video in 2 seconds...');
        const timerId = setTimeout(() => playNext(), 2000);
        streamData.loopTimer = timerId;
      } else {
        console.log('Stream completed (loop disabled or stopped)');
        cleanupStream(guildId);
      }
    } catch (error) {
      console.error('Stream playback error:', error);
      
      if (streamUdpConn) {
        try {
          streamUdpConn.mediaConnection.setSpeaking(false);
          streamUdpConn.mediaConnection.setVideoStatus(false);
          if (streamUdpConn.mediaConnection && typeof streamUdpConn.mediaConnection.destroy === 'function') {
            streamUdpConn.mediaConnection.destroy();
          }
        } catch (cleanupErr) {
          console.error('Error cleaning up failed stream:', cleanupErr);
        }
      }
      
      const streamData = activeSelfbotStreamers.get(guildId);
      if (loop && streamData && !streamData.stopping) {
        console.log('⚠️ Retrying in 5 seconds...');
        const timerId = setTimeout(() => playNext(), 5000);
        streamData.loopTimer = timerId;
      } else {
        cleanupStream(guildId);
      }
    }
  };
  
  await playNext();
}

function cleanupStream(guildId) {
  const streamData = activeSelfbotStreamers.get(guildId);
  if (!streamData) return;

  console.log(`🧹 Cleaning up stream for guild ${guildId}`);
  streamData.stopping = true;

  if (streamData.loopTimer) {
    clearTimeout(streamData.loopTimer);
    streamData.loopTimer = null;
  }

  if (streamData.currentUdpConnection) {
    try {
      streamData.currentUdpConnection.mediaConnection.setSpeaking(false);
      streamData.currentUdpConnection.mediaConnection.setVideoStatus(false);
      if (streamData.currentUdpConnection.mediaConnection && typeof streamData.currentUdpConnection.mediaConnection.destroy === 'function') {
        streamData.currentUdpConnection.mediaConnection.destroy();
      }
    } catch (err) {
      console.error('Error stopping media connection:', err);
    }
  }

  if (streamData.streamer) {
    try {
      streamData.streamer.leaveVoice().catch(err => console.error('Error leaving voice:', err));
    } catch (err) {
      console.error('Error during streamer cleanup:', err);
    }
  }

  activeSelfbotStreamers.delete(guildId);
  console.log(`✅ Stream cleanup completed for guild ${guildId}`);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('videostream')
    .setDescription('🔴 Stream VIDEO with audio on loop 24/7 (PornHub, YouTube, etc.)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Start 24/7 video streaming with audio')
        .addStringOption(option =>
          option
            .setName('url')
            .setDescription('Video URL (PornHub, YouTube, Xvideos, etc.)')
            .setRequired(true))
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Voice channel to stream in (defaults to your current channel)')
            .setRequired(false))
        .addBooleanOption(option =>
          option
            .setName('loop')
            .setDescription('Loop the video continuously 24/7 (default: true)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('stop')
        .setDescription('Stop the current video stream'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check current video streaming status'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('setup')
        .setDescription('Show setup instructions for video streaming'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'setup') {
      const setupEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🔴 Video Streaming Setup Guide')
        .setDescription('**CRITICAL:** Video streaming requires a DEDICATED Discord account configured server-side.')
        .addFields(
          { 
            name: '⚠️ SEVERE SECURITY WARNING', 
            value: '**DO NOT use your personal Discord account for this feature!**\n\n' +
                   '• Selfbots violate Discord Terms of Service\n' +
                   '• Your account WILL be permanently banned\n' +
                   '• Create a NEW, DEDICATED account ONLY for streaming\n' +
                   '• NEVER share or expose your main account token', 
            inline: false 
          },
          {
            name: '📝 Server Administrator Setup (Required)',
            value: '**Only server administrators should perform this setup:**\n\n' +
                   '1. Create a **brand new Discord account** (dedicated streaming account)\n' +
                   '2. Add this account to your server\n' +
                   '3. Get the account\'s user token (see below)\n' +
                   '4. In Replit Secrets, add: `DISCORD_VIDEO_TOKEN` = your dedicated account token\n' +
                   '5. Restart the bot\n' +
                   '6. The streaming account will join voice and stream videos',
            inline: false
          },
          {
            name: '🔑 How to Get Token (Dedicated Account Only)',
            value: '1. Log into your **DEDICATED streaming account** in browser\n' +
                   '2. Press F12 (Developer Tools)\n' +
                   '3. Go to **Console** tab\n' +
                   '4. Paste this and press Enter:\n' +
                   '```js\n(webpackChunkdiscord_app.push([[\'\'],{},e=>{m=[];for(let c in e.c)m.push(e.c[c])}]),m).find(m=>m?.exports?.default?.getToken!==void 0).exports.default.getToken()\n```\n' +
                   '5. Copy the token shown\n' +
                   '6. Add to Secrets as `DISCORD_VIDEO_TOKEN`',
            inline: false
          },
          {
            name: '✅ Best Practices',
            value: '• Use a dedicated account created specifically for streaming\n' +
                   '• Keep the token in environment secrets (Replit Secrets)\n' +
                   '• Never paste tokens in Discord messages\n' +
                   '• Expect the streaming account to eventually be banned by Discord\n' +
                   '• Have multiple backup accounts ready',
            inline: false
          },
          {
            name: '🎯 After Setup',
            value: 'Once `DISCORD_VIDEO_TOKEN` is configured, use:\n' +
                   '`/videostream start <url>` - Start streaming\n' +
                   '`/videostream stop` - Stop streaming\n' +
                   '`/videostream status` - Check stream status',
            inline: false
          }
        )
        .setFooter({ text: 'Use this feature at your own risk • Not recommended for production' });

      return interaction.reply({ embeds: [setupEmbed], ephemeral: true });
    }

    if (subcommand === 'start') {
      await interaction.deferReply({ ephemeral: true });

      const url = interaction.options.getString('url');
      const targetChannel = interaction.options.getChannel('channel');
      const loop = interaction.options.getBoolean('loop') ?? true;

      const userToken = process.env.DISCORD_VIDEO_TOKEN;
      
      if (!userToken) {
        return interaction.editReply('❌ **Video streaming not configured!**\n\nServer administrators must configure `DISCORD_VIDEO_TOKEN` in Replit Secrets.\n\nUse `/videostream setup` for instructions.');
      }

      let voiceChannel;
      if (targetChannel) {
        voiceChannel = targetChannel;
      } else {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        voiceChannel = member.voice.channel;
      }

      if (!voiceChannel) {
        return interaction.editReply('❌ You need to be in a voice channel or specify one!');
      }

      if (activeSelfbotStreamers.has(guildId)) {
        return interaction.editReply('❌ A video stream is already active in this server. Use `/videostream stop` first.');
      }

      await interaction.editReply('🔄 Fetching video and preparing stream... This may take 30-60 seconds...');

      try {
        const metadata = await getVideoMetadata(url);
        
        await interaction.editReply(`📹 **Preparing Video Stream:**\n🎬 ${metadata.title}\n⏱️ Duration: ${Math.floor(metadata.duration / 60)}:${String(Math.floor(metadata.duration % 60)).padStart(2, '0')}\n${metadata.is_live ? '🔴 LIVE Stream' : '🎥 On-demand video'}\n🔄 Initializing streaming account...`);

        if (!selfbotClient || !selfbotClient.isReady()) {
          selfbotClient = new SelfbotClient({
            checkUpdate: false,
          });
          
          console.log('🔐 Logging in streaming account...');
          await selfbotClient.login(userToken);
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          console.log('✅ Streaming account logged in');
        }

        const streamer = new Streamer(selfbotClient);
        
        await interaction.editReply('🔄 Joining voice channel...');
        await streamer.joinVoice(guildId, voiceChannel.id);
        
        await interaction.editReply('🔄 Starting video stream...');
        
        activeSelfbotStreamers.set(guildId, {
          streamer,
          voiceChannel,
          loop,
          startedAt: Date.now(),
          metadata,
          originalUrl: url,
          stopping: false,
          loopTimer: null,
          currentUdpConnection: null,
        });

        streamVideoLoop(streamer, url, loop, guildId).catch(err => {
          console.error('Stream loop fatal error:', err);
          cleanupStream(guildId);
        });

        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('✅ Video Stream Started!')
          .setDescription(`**${metadata.title}**`)
          .addFields(
            { name: '📺 Channel', value: voiceChannel.name, inline: true },
            { name: '🔁 Loop', value: loop ? 'Enabled (24/7)' : 'Disabled', inline: true },
            { name: '⏱️ Duration', value: `${Math.floor(metadata.duration / 60)}:${String(Math.floor(metadata.duration % 60)).padStart(2, '0')}`, inline: true },
            { name: '🎥 Resolution', value: `${metadata.width}x${metadata.height}`, inline: true },
            { name: '👤 Uploader', value: metadata.uploader, inline: true },
            { name: '🎵 Status', value: metadata.is_live ? '🔴 LIVE' : '▶️ Playing', inline: true }
          )
          .setFooter({ text: 'Use /videostream stop to end the stream • URLs refresh automatically for 24/7 playback' })
          .setTimestamp();

        await interaction.editReply({ content: '', embeds: [embed] });

      } catch (error) {
        console.error('Video stream error:', error);
        
        cleanupStream(guildId);
        
        const errorMessage = error.message.includes('Incorrect token') || error.message.includes('Unauthorized')
          ? `❌ Invalid streaming account token! Check your \`DISCORD_VIDEO_TOKEN\` secret.\n\nUse \`/videostream setup\` for configuration instructions.`
          : `❌ Failed to start video stream: ${error.message}`;
        
        return interaction.editReply(errorMessage);
      }

    } else if (subcommand === 'stop') {
      if (!activeSelfbotStreamers.has(guildId)) {
        return interaction.reply({ content: '❌ No active video stream in this server.', ephemeral: true });
      }

      cleanupStream(guildId);

      return interaction.reply('✅ Video stream stopped, all resources cleaned up.');

    } else if (subcommand === 'status') {
      if (!activeSelfbotStreamers.has(guildId)) {
        return interaction.reply({ content: '❌ No active video stream in this server.', ephemeral: true });
      }

      const stream = activeSelfbotStreamers.get(guildId);
      const uptime = Math.floor((Date.now() - stream.startedAt) / 1000);
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = uptime % 60;

      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('📊 Video Stream Status')
        .setDescription(`**${stream.metadata.title}**`)
        .addFields(
          { name: '📺 Channel', value: stream.voiceChannel.name, inline: true },
          { name: '🔁 Loop', value: stream.loop ? 'Enabled (24/7)' : 'Disabled', inline: true },
          { name: '⏱️ Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
          { name: '👤 Uploader', value: stream.metadata.uploader, inline: true },
          { name: '🎥 Resolution', value: `${stream.metadata.width}x${stream.metadata.height}`, inline: true },
          { name: '🎵 Status', value: stream.metadata.is_live ? '🔴 LIVE' : '▶️ Playing', inline: true }
        )
        .setFooter({ text: `Streaming from: ${stream.originalUrl}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
