const fs = require('fs');
const path = require('path');
let fetchFn;
try {
    if (typeof fetch === 'function') fetchFn = fetch;
} catch (e) { }
if (!fetchFn) {
    try {
        const nf = require('node-fetch');
        fetchFn = (typeof nf === 'function') ? nf : nf.default;
    } catch (e) {
        fetchFn = null;
    }
}
if (!fetchFn) {
    console.error('No fetch() available. Run on Node 18+ or install node-fetch and try again.');
    process.exit(1);
}
const { 
    Client, 
    GatewayIntentBits, 
    ContainerBuilder, 
    SectionBuilder,
    ButtonBuilder, 
    ButtonStyle,
    MessageFlags 
} = require('discord.js');
require('dotenv').config();

const STATE_FILE = path.join(__dirname, 'state.json');

const CONFIG = {
    GeyserAPIURL: 'https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest',
    FloodgateAPIURL: 'https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest',
    GeyserWebURL: 'https://geysermc.org/download/?project=geyser',
    FloodgateWebURL: 'https://geysermc.org/download/?project=floodgate',
    CHECK_INTERVAL_MIN: parseInt(process.env.CHECK_INTERVAL_MIN || '5', 10),
    TOKEN: process.env.DISCORD_TOKEN,
    CHANNEL_ID: process.env.CHANNEL_ID
};

if (!CONFIG.TOKEN || !CONFIG.CHANNEL_ID) {
    console.error('Missing DISCORD_TOKEN or CHANNEL_ID in environment. See .env.example');
    process.exit(1);
}

function loadState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {
        return { lastContent: null, msgId: null };
    }
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

async function fetchProjectFromAPI(apiUrl, projectName) {
    try {
        const res = await fetchFn(apiUrl, { 
            headers: { 
                'User-Agent': 'GeyserMonitorBot/1.0',
                'Accept': 'application/json'
            } 
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        const buildNumber = data.build || data.number;
        const timestamp = data.time || data.timestamp;
        
        if (!buildNumber) {
            console.warn(`No build number found for ${projectName}`);
            return null;
        }
        
        let dateStr = 'Unknown date';
        if (timestamp) {
            const date = new Date(timestamp);
            dateStr = date.toLocaleDateString('en-US', { 
                month: '2-digit', 
                day: '2-digit', 
                year: 'numeric' 
            });
        }
        
        const result = {
            build: `#${buildNumber}`,
            date: dateStr,
            raw: `Build #${buildNumber} · ${dateStr}`,
            timestamp: timestamp
        };
        
        console.log(`Parsed result for ${projectName}:`, result);
        return result;
        
    } catch (err) {
        console.error(`fetchProject error for ${projectName}:`, err.message);
        return null;
    }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

async function sendUpdateMessage(channel, geyserData, floodgateData) {
    try {
        const container = new ContainerBuilder()
            .setAccentColor(0x00d9ff) // Geyser brand cyan color
            .addTextDisplayComponents(
                (textDisplay) => textDisplay.setContent('## 🔄 Latest Builds')
            )
            .addSectionComponents(
                (section) => section
                    .addTextDisplayComponents(
                        (textDisplay) => textDisplay.setContent(
                            `### Geyser ${geyserData.build}\n` +
                            `-# Released ${geyserData.date}`
                        )
                    )
                    .setButtonAccessory((button) => 
                        button
                            .setLabel('Download')
                            .setStyle(ButtonStyle.Link)
                            .setURL(CONFIG.GeyserWebURL)
                    )
            )
            .addSectionComponents(
                (section) => section
                    .addTextDisplayComponents(
                        (textDisplay) => textDisplay.setContent(
                            `### Floodgate ${floodgateData.build}\n` +
                            `-# Released ${floodgateData.date}`
                        )
                    )
                    .setButtonAccessory((button) => 
                        button
                            .setLabel('Download')
                            .setStyle(ButtonStyle.Link)
                            .setURL(CONFIG.FloodgateWebURL)
                    )
            )
            .addTextDisplayComponents(
                (textDisplay) => textDisplay.setContent(
                    `-# Last checked <t:${Math.floor(Date.now() / 1000)}:R>`
                )
            );

        const sent = await channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
        
        console.log('Message sent successfully:', sent.id);
        return sent.id;
    } catch (err) {
        console.error('sendUpdateMessage error:', err);
        return null;
    }
}

async function checkAndNotify(channel) {
    const state = loadState();

    const [geyserData, floodgateData] = await Promise.all([
        fetchProjectFromAPI(CONFIG.GeyserAPIURL, 'Geyser'),
        fetchProjectFromAPI(CONFIG.FloodgateAPIURL, 'Floodgate')
    ]);

    console.log('Geyser data:', geyserData);
    console.log('Floodgate data:', floodgateData);

    if (!geyserData || !floodgateData) {
        console.warn('Could not fetch data for one or both projects');
        return;
    }

    const combinedContent = `${geyserData.build}|${geyserData.date}|${floodgateData.build}|${floodgateData.date}`;
    
    if (!state.lastContent || state.lastContent !== combinedContent) {
        console.log('Build changed, sending update...');
        const messageId = await sendUpdateMessage(channel, geyserData, floodgateData);
        
        state.lastContent = combinedContent;
        state.msgId = messageId;
        state.fetchedAt = new Date().toISOString();
        
        console.log('Update sent:', combinedContent);
    } else {
        console.log('No changes detected');
    }

    saveState(state);
}

client.once('ready', async () => {
    console.log('Bot ready as', client.user.tag);
    const channel = await client.channels.fetch(CONFIG.CHANNEL_ID).catch(err => {
        console.error('Failed to fetch channel', err.message);
        process.exit(1);
    });

    // Do an immediate check then interval
    await checkAndNotify(channel);
    setInterval(() => checkAndNotify(channel), CONFIG.CHECK_INTERVAL_MIN * 60 * 1000);
});

client.login(CONFIG.TOKEN).catch(err => {
    console.error('Login failed', err);
    process.exit(1);
});
