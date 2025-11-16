const { Client } = require('discord.js-selfbot-v13');
const { spawn } = require('child_process');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

const client = new Client({
  checkUpdate: false,
});

let currentStream = null;

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
      url: info.url,
    };
  } catch (error) {
    throw new Error(`Failed to fetch video: ${error.message}`);
  }
}

async function streamVideo(voiceChannel, videoUrl, loop = true) {
  try {
    const connection = await voiceChannel.join();
    
    const ffmpegPath = require('ffmpeg-static');
    
    const streamProcess = spawn(ffmpegPath, [
      '-re',
      '-i', videoUrl,
      '-vn',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1'
    ]);

    streamProcess.stderr.on('data', (data) => {
      console.log('FFmpeg:', data.toString());
    });

    streamProcess.on('error', (error) => {
      console.error('Stream error:', error);
    });

    connection.play(streamProcess.stdout, { type: 'converted' });
    
    console.log('✅ Started streaming video with audio!');
    
    return {
      connection,
      process: streamProcess,
      loop,
    };
  } catch (error) {
    console.error('Failed to stream:', error);
    throw error;
  }
}

client.on('ready', () => {
  console.log(`✅ Selfbot logged in as ${client.user.tag}`);
  console.log('Ready to stream video! Use commands:');
  console.log('!stream <video_url> - Start streaming');
  console.log('!stop - Stop streaming');
});

client.on('messageCreate', async (message) => {
  if (message.author.id !== client.user.id) return;

  const args = message.content.split(' ');
  const command = args[0].toLowerCase();

  if (command === '!stream') {
    const url = args[1];
    if (!url) {
      return message.reply('❌ Please provide a video URL!');
    }

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply('❌ You must be in a voice channel!');
    }

    try {
      await message.reply('🔄 Fetching video and starting stream...');
      
      const metadata = await getVideoMetadata(url);
      
      if (currentStream) {
        currentStream.connection.disconnect();
        if (currentStream.process) currentStream.process.kill();
      }

      currentStream = await streamVideo(voiceChannel, metadata.url, true);
      
      await message.reply(`✅ **Now Streaming:**\n🎵 ${metadata.title}\n⏱️ Duration: ${Math.floor(metadata.duration / 60)}:${String(Math.floor(metadata.duration % 60)).padStart(2, '0')}\n🔁 Loop: Enabled`);
      
    } catch (error) {
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  if (command === '!stop') {
    if (!currentStream) {
      return message.reply('❌ No active stream!');
    }

    currentStream.connection.disconnect();
    if (currentStream.process) currentStream.process.kill();
    currentStream = null;
    
    await message.reply('✅ Stream stopped!');
  }
});

const userToken = process.env.DISCORD_USER_TOKEN;

if (!userToken) {
  console.error('❌ DISCORD_USER_TOKEN not found in environment variables!');
  console.log('\n📝 To use video streaming:');
  console.log('1. Get your Discord user token');
  console.log('2. Add it to Secrets as DISCORD_USER_TOKEN');
  console.log('3. Run this file: node videostream_selfbot.js');
  process.exit(1);
}

client.login(userToken).catch(err => {
  console.error('❌ Failed to login:', err.message);
  console.log('\nMake sure your DISCORD_USER_TOKEN is valid!');
});
