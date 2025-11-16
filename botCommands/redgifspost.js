const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

async function getRedGifsToken() {
  try {
    const response = await axios.get('https://api.redgifs.com/v2/auth/temporary', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    return response.data.token;
  } catch (error) {
    console.error('Failed to get RedGifs token:', error.message);
    return null;
  }
}

async function fetchRedGifsVideos(sourceUrl, sourceType, count, token) {
  try {
    // Random page number between 1 and 15 to get variety
    const randomPage = Math.floor(Math.random() * 15) + 1;
    
    // Fetch 3x the requested count to have more videos to randomly select from
    const fetchCount = Math.min(count * 3, 80); // Cap at 80 to avoid API limits
    
    let apiUrl = '';
    
    if (sourceType === 'niche') {
      const nicheMatch = sourceUrl.match(/niches\/([^\/\?]+)/i);
      if (!nicheMatch) return [];
      const nicheName = nicheMatch[1];
      // Use random page number for variety
      apiUrl = `https://api.redgifs.com/v2/niches/${nicheName}/gifs?order=new&count=${fetchCount}&page=${randomPage}`;
    } else if (sourceType === 'user') {
      const userMatch = sourceUrl.match(/users\/([^\/\?]+)/i);
      if (!userMatch) return [];
      const username = userMatch[1];
      // Use random page number for variety
      apiUrl = `https://api.redgifs.com/v2/users/${username}/gifs?order=new&count=${fetchCount}&page=${randomPage}`;
    }
    
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.redgifs.com/'
      }
    });
    
    const gifs = response.data.gifs || [];
    const allVideos = gifs.map(gif => ({
      id: gif.id,
      url: gif.urls.hd || gif.urls.sd,
      thumbnail: gif.urls.thumbnail,
      title: gif.description || `RedGifs - ${gif.id}`
    }));
    
    // Randomly shuffle the array
    const shuffled = allVideos.sort(() => Math.random() - 0.5);
    
    // Return only the requested count (randomly selected)
    return shuffled.slice(0, count);
  } catch (error) {
    console.error('Failed to fetch RedGifs videos:', error.message);
    return [];
  }
}

async function downloadRedGifsFile(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    headers: { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.redgifs.com/'
    }
  });
  
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function getVideoDuration(filepath) {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filepath
    ]);
    return parseFloat(stdout.trim());
  } catch (err) {
    return 0;
  }
}

async function compressVideo(inputPath, outputPath, targetSizeMB = 9.5) {
  try {
    const stats = await fsPromises.stat(inputPath);
    const inputSizeMB = stats.size / (1024 * 1024);
    
    if (inputSizeMB <= targetSizeMB) {
      await fsPromises.copyFile(inputPath, outputPath);
      return true;
    }
    
    const duration = await getVideoDuration(inputPath);
    if (!duration || duration === 0) {
      await execFileAsync(ffmpegPath, [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]);
      
      const outputStats = await fsPromises.stat(outputPath);
      const outputSizeMB = outputStats.size / (1024 * 1024);
      return outputSizeMB <= targetSizeMB;
    }
    
    const targetBitrate = Math.floor((targetSizeMB * 8192 / duration) - 128);
    
    if (targetBitrate < 100) {
      await execFileAsync(ffmpegPath, [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-b:v', '100k',
        '-maxrate', '100k',
        '-bufsize', '200k',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]);
      
      const outputStats = await fsPromises.stat(outputPath);
      const outputSizeMB = outputStats.size / (1024 * 1024);
      return outputSizeMB <= targetSizeMB;
    }
    
    await execFileAsync(ffmpegPath, [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-b:v', `${targetBitrate}k`,
      '-maxrate', `${targetBitrate}k`,
      '-bufsize', `${targetBitrate * 2}k`,
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      '-y',
      outputPath
    ]);
    
    const outputStats = await fsPromises.stat(outputPath);
    const outputSizeMB = outputStats.size / (1024 * 1024);
    
    if (outputSizeMB > targetSizeMB) {
      const lowerBitrate = Math.floor(targetBitrate * 0.7);
      await execFileAsync(ffmpegPath, [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-b:v', `${lowerBitrate}k`,
        '-maxrate', `${lowerBitrate}k`,
        '-bufsize', `${lowerBitrate * 2}k`,
        '-c:a', 'aac',
        '-b:a', '64k',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]);
      
      const finalStats = await fsPromises.stat(outputPath);
      const finalSizeMB = finalStats.size / (1024 * 1024);
      return finalSizeMB <= targetSizeMB;
    }
    
    return true;
  } catch (err) {
    console.error('Failed to compress video:', err.message);
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('redgifspost')
    .setDescription('Immediately post RedGifs videos to a channel')
    .addStringOption(opt => opt
      .setName('url')
      .setDescription('RedGifs niche or user URL')
      .setRequired(true))
    .addIntegerOption(opt => opt
      .setName('count')
      .setDescription('Number of videos to post (default: 10)')
      .setMinValue(1)
      .setMaxValue(20)
      .setRequired(false))
    .addChannelOption(opt => opt
      .setName('channel')
      .setDescription('Channel to post in (defaults to current channel)')
      .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const url = interaction.options.getString('url');
    const count = interaction.options.getInteger('count') || 10;
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    
    let sourceType = null;
    if (url.includes('/niches/')) {
      sourceType = 'niche';
    } else if (url.includes('/users/')) {
      sourceType = 'user';
    } else {
      return interaction.editReply({
        content: '❌ Invalid URL! Must be a RedGifs niche or user URL.\n\n**Examples:**\n- `https://www.redgifs.com/niches/indian-sissy`\n- `https://www.redgifs.com/users/luciferron`'
      });
    }
    
    if (!targetChannel.isTextBased()) {
      return interaction.editReply({
        content: '❌ Target channel must be a text channel!'
      });
    }
    
    await interaction.editReply({
      content: `🎬 Fetching and processing ${count} videos from ${sourceType}...\nThis may take a few minutes.`
    });
    
    try {
      const token = await getRedGifsToken();
      if (!token) {
        return interaction.editReply({
          content: '❌ Failed to authenticate with RedGifs API'
        });
      }
      
      const videos = await fetchRedGifsVideos(url, sourceType, count, token);
      
      if (videos.length === 0) {
        return interaction.editReply({
          content: '❌ No videos found at that URL'
        });
      }
      
      const tempDir = path.join(__dirname, '..', 'temp_videos');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      let posted = 0;
      let failed = 0;
      
      for (const video of videos) {
        const filename = `redgifs_${video.id}.mp4`;
        const rawFilepath = path.join(tempDir, `raw_${filename}`);
        const compressedFilepath = path.join(tempDir, filename);
        
        try {
          await downloadRedGifsFile(video.url, rawFilepath);
          const compressed = await compressVideo(rawFilepath, compressedFilepath, 9.5);
          
          if (!compressed) {
            failed++;
            continue;
          }
          
          // Verify final size before posting
          const stats = await fsPromises.stat(compressedFilepath);
          const sizeMB = stats.size / (1024 * 1024);
          
          // If still too large, retry with more aggressive compression
          if (sizeMB > 9.9) {
            const retryCompressed = await compressVideo(rawFilepath, compressedFilepath, 8.5);
            
            if (!retryCompressed) {
              failed++;
              continue;
            }
            
            const retryStats = await fsPromises.stat(compressedFilepath);
            const retrySizeMB = retryStats.size / (1024 * 1024);
            
            if (retrySizeMB > 9.9) {
              failed++;
              continue;
            }
          }
          
          // Final size check before posting
          const finalStats = await fsPromises.stat(compressedFilepath);
          const finalSizeMB = finalStats.size / (1024 * 1024);
          
          if (finalSizeMB > 9.9) {
            failed++;
            continue;
          }
          
          await targetChannel.send({
            files: [compressedFilepath]
          });
          
          posted++;
          await sleep(2000);
        } catch (err) {
          console.error(`Failed to post video ${video.id}:`, err.message);
          failed++;
        } finally {
          // Always cleanup both files
          await fsPromises.unlink(rawFilepath).catch(() => {});
          await fsPromises.unlink(compressedFilepath).catch(() => {});
        }
      }
      
      await interaction.editReply({
        content: `✅ **Posted ${posted}/${videos.length} videos to ${targetChannel}**\n${failed > 0 ? `❌ Failed: ${failed}` : ''}`
      });
      
    } catch (err) {
      console.error('RedGifs post command error:', err);
      await interaction.editReply({
        content: `❌ An error occurred: ${err.message}`
      });
    }
  }
};
