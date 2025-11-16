const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState, StreamType } = require('@discordjs/voice');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

let activeStreams = new Map();

async function getVideoMetadata(url) {
  const ytdlp = require('yt-dlp-exec').create('/tmp/yt-dlp');
  
  try {
    const info = await ytdlp(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      preferFreeFormats: true,
      format: 'bestaudio',
      noCheckCertificates: true,
      extractAudio: true,
      addHeader: [
        'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
    });

    let audioUrl = info.url;
    
    if (!audioUrl && info.formats && info.formats.length > 0) {
      const audioFormat = info.formats.find(f => f.acodec && f.acodec !== 'none' && f.url) || 
                         info.formats.find(f => f.url);
      if (audioFormat) {
        audioUrl = audioFormat.url;
      }
    }
    
    if (!audioUrl) {
      throw new Error('Could not extract audio URL from video. The video may be private, age-restricted, or require login.');
    }

    return {
      title: info.title || 'Unknown',
      duration: info.duration || 0,
      uploader: info.uploader || 'Unknown',
      url: audioUrl,
    };
  } catch (error) {
    console.error('yt-dlp error:', error);
    throw new Error(`Failed to fetch video info: ${error.message}`);
  }
}

function streamAudioFromUrl(url, loop = true) {
  const ffmpegPath = require('ffmpeg-static');
  
  const streamController = {
    currentFfmpeg: null,
    player: null,
    loop: loop,
    
    spawnFfmpeg() {
      if (this.currentFfmpeg) {
        try {
          this.currentFfmpeg.kill();
        } catch (err) {}
      }
      
      this.currentFfmpeg = spawn(ffmpegPath, [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', url,
        '-vn',
        '-ar', '22050',
        '-ac', '1',
        '-b:a', '32k',
        '-f', 'mp3',
        'pipe:1'
      ]);

      this.currentFfmpeg.stderr.on('data', (data) => {
      });

      return this.currentFfmpeg;
    },
    
    cleanup() {
      if (this.currentFfmpeg) {
        try {
          this.currentFfmpeg.kill();
        } catch (err) {}
        this.currentFfmpeg = null;
      }
      if (this.player) {
        try {
          this.player.stop();
        } catch (err) {}
      }
    }
  };

  const player = createAudioPlayer();
  streamController.player = player;
  
  const ffmpeg = streamController.spawnFfmpeg();
  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });

  resource.volume.setVolume(0.5);
  player.play(resource);

  player.on(AudioPlayerStatus.Idle, () => {
    if (streamController.loop) {
      setTimeout(() => {
        const newFfmpeg = streamController.spawnFfmpeg();
        const newResource = createAudioResource(newFfmpeg.stdout, {
          inputType: StreamType.Arbitrary,
          inlineVolume: true,
        });

        newResource.volume.setVolume(0.5);
        player.play(newResource);
      }, 500);
    }
  });

  player.on('error', error => {
    console.error('Audio player error:', error);
  });

  return streamController;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stream')
    .setDescription('Stream audio from any video URL (YouTube, Pornhub, TikTok, etc.)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Start streaming from a video URL')
        .addStringOption(option =>
          option
            .setName('url')
            .setDescription('Video URL from any supported site (YouTube, Pornhub, Xvideos, etc.)')
            .setRequired(true))
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Voice channel to stream in (defaults to your current channel)')
            .setRequired(false))
        .addBooleanOption(option =>
          option
            .setName('loop')
            .setDescription('Loop the audio continuously (default: true)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('stop')
        .setDescription('Stop the current stream'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check current streaming status'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'start') {
      await interaction.deferReply();

      const url = interaction.options.getString('url');
      const targetChannel = interaction.options.getChannel('channel');
      const loop = interaction.options.getBoolean('loop') ?? true;

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

      if (activeStreams.has(guildId)) {
        return interaction.editReply('❌ A stream is already active in this server. Use `/stream stop` first.');
      }

      await interaction.editReply('🔄 Fetching video info and preparing stream...');

      try {
        const metadata = await getVideoMetadata(url);
        
        await interaction.editReply(`🎵 Starting stream: **${metadata.title}**\n⏱️ Duration: ${Math.floor(metadata.duration / 60)}:${String(Math.floor(metadata.duration % 60)).padStart(2, '0')}\n👤 Uploader: ${metadata.uploader}`);

        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
          console.log('Voice connection ready');
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
          } catch {
            connection.destroy();
            const stream = activeStreams.get(guildId);
            if (stream && stream.controller) {
              stream.controller.cleanup();
            }
            activeStreams.delete(guildId);
          }
        });

        const controller = streamAudioFromUrl(metadata.url, loop);
        connection.subscribe(controller.player);

        activeStreams.set(guildId, {
          connection,
          controller,
          voiceChannel,
          loop,
          startedAt: Date.now(),
          metadata,
          originalUrl: url,
        });

        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Stream Started!')
          .setDescription(`**${metadata.title}**`)
          .addFields(
            { name: '📺 Channel', value: voiceChannel.name, inline: true },
            { name: '🔁 Loop', value: loop ? 'Enabled' : 'Disabled', inline: true },
            { name: '⏱️ Duration', value: `${Math.floor(metadata.duration / 60)}:${String(Math.floor(metadata.duration % 60)).padStart(2, '0')}`, inline: true },
            { name: '🎵 Quality', value: '22kHz mono, 32kbps (low bandwidth)', inline: true },
            { name: '👤 Uploader', value: metadata.uploader, inline: true },
            { name: '🎵 Status', value: 'Playing', inline: true }
          )
          .setFooter({ text: 'Use /stream stop to end the stream' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        setTimeout(async () => {
          try {
            const stream = activeStreams.get(guildId);
            if (stream) {
              const uptime = Math.floor((Date.now() - stream.startedAt) / 1000);
              const hours = Math.floor(uptime / 3600);
              const minutes = Math.floor((uptime % 3600) / 60);
              
              const statusEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🎵 Stream Status Update')
                .setDescription(`**${metadata.title}**`)
                .addFields(
                  { name: '⏱️ Uptime', value: `${hours}h ${minutes}m`, inline: true },
                  { name: '📺 Channel', value: voiceChannel.name, inline: true },
                  { name: '🎵 Status', value: 'Playing', inline: true }
                )
                .setTimestamp();
              
              await interaction.followUp({ embeds: [statusEmbed] });
            }
          } catch (err) {
          }
        }, 60000);

      } catch (error) {
        console.error('Stream error:', error);
        
        const errorMessage = error.message.includes('Unsupported URL') 
          ? `❌ This URL is not supported by yt-dlp.\n\n**Supported sites include:** YouTube, Pornhub, Xvideos, TikTok, Instagram, Twitter, and 1000+ others.`
          : `❌ Failed to start stream: ${error.message}`;
        
        return interaction.editReply(errorMessage);
      }

    } else if (subcommand === 'stop') {
      if (!activeStreams.has(guildId)) {
        return interaction.reply({ content: '❌ No active stream in this server.', ephemeral: true });
      }

      const stream = activeStreams.get(guildId);
      
      if (stream.controller) {
        stream.controller.cleanup();
      }
      stream.connection.destroy();
      
      activeStreams.delete(guildId);

      return interaction.reply('✅ Stream stopped and cleaned up.');

    } else if (subcommand === 'status') {
      if (!activeStreams.has(guildId)) {
        return interaction.reply({ content: '❌ No active stream in this server.', ephemeral: true });
      }

      const stream = activeStreams.get(guildId);
      const uptime = Math.floor((Date.now() - stream.startedAt) / 1000);
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = uptime % 60;

      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('📊 Stream Status')
        .setDescription(`**${stream.metadata.title}**`)
        .addFields(
          { name: '📺 Channel', value: stream.voiceChannel.name, inline: true },
          { name: '🔁 Loop', value: stream.loop ? 'Enabled' : 'Disabled', inline: true },
          { name: '⏱️ Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
          { name: '👤 Uploader', value: stream.metadata.uploader, inline: true },
          { name: '🎵 Quality', value: '22kHz mono, 32kbps', inline: true },
          { name: '🎵 Status', value: 'Playing', inline: true }
        )
        .setFooter({ text: `Streaming from: ${stream.originalUrl}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
