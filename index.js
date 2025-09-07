const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Bot đã sẵn sàng!');
});

app.listen(port, () => {
  console.log(`Server đang lắng nghe tại http://localhost:${port}`);
});

// --- THƯ VIỆN ---
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, EmbedBuilder, ChannelType, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActivityType, StringSelectMenuBuilder } = require('discord.js');
const ms = require('ms');
require('dotenv').config();
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
const Database = require('better-sqlite3');

// --- KHỞI TẠO DATABASE ---
const db = new Database('/data/data.db');

// --- BIẾN TOÀN CỤC ---
const queue = new Map(); // Quản lý hàng đợi nhạc cho mỗi server
const noituGames = new Map(); // Quản lý các game Nối Từ đang diễn ra

// --- CÁC HẰNG SỐ CẤU HÌNH ---
const MOD_LOG_CHANNEL_ID = '1413071939395653722';
// FORBIDDEN_WORDS đã bị xóa
const TIMEOUT_DURATION = '60m';
const DEFAULT_FEEDBACK_CHANNEL_ID = '1413878121995960361';
const SUPPORT_ROLE_ID = '1412090993909563534';
const WELCOME_CHANNEL_ID = '1413874004690997378';
const GOODBYE_CHANNEL_ID = '1413893224266993818';
const GOODBYE_GIF_URL = 'https://i.pinimg.com/originals/ec/c6/8e/ecc68e64677d55433d833ac1e6a713fd.gif';
const CHAT_CHANNEL_ID = '1413876927936331878';
const SUPPORT_CHANNEL_ID = '1413878121995960361';
const SUPPORT_TICKET_CATEGORY_ID = '1413009121606631456';
const ADMIN_TICKET_CATEGORY_ID = '1413009227156291634';
const STAFF_ROLE_ID = '1408719686509662340';
const GENERAL_CHAT_CHANNEL_ID = '1413876927936331878';
const RECEPTIONIST_ROLE_ID = '1413902389647249510';

// --- THIẾT LẬP DATABASE ---
function setupDatabase() {
    db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.exec(`CREATE TABLE IF NOT EXISTS temp_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL, guildId TEXT NOT NULL, roleId TEXT NOT NULL, expiresAt INTEGER NOT NULL)`);
    db.exec(`CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL, guildId TEXT NOT NULL, reason TEXT, timestamp INTEGER)`);
    db.exec(`CREATE TABLE IF NOT EXISTS giveaways (messageId TEXT PRIMARY KEY, channelId TEXT NOT NULL, guildId TEXT NOT NULL, prize TEXT NOT NULL, winnerCount INTEGER NOT NULL, endsAt INTEGER NOT NULL, hostedBy TEXT NOT NULL, ended INTEGER DEFAULT 0)`);
    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`).run('ticketCounter', '1');
    console.log('✅ Database đã được thiết lập và sẵn sàng.');
}
setupDatabase();

// --- ĐỊNH NGHĨA CÁC LỆNH SLASH ---
const commands = [
    new SlashCommandBuilder().setName('noitu')
        .setDescription('Chơi game nối từ Tiếng Việt.')
        .addSubcommand(sub => sub.setName('start').setDescription('Bắt đầu một ván nối từ trong kênh này.'))
        .addSubcommand(sub => sub.setName('stop').setDescription('Dừng ván nối từ và tuyên bố người thắng cuộc.'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder().setName('info').setDescription('Hiển thị thông tin người dùng hoặc server.').addSubcommand(sub => sub.setName('user').setDescription('Hiển thị thông tin người dùng.').addUserOption(opt => opt.setName('user').setDescription('Người bạn muốn xem thông tin').setRequired(true))).addSubcommand(sub => sub.setName('server').setDescription('Hiển thị thông tin về server hiện tại.')),
    new SlashCommandBuilder().setName('ping').setDescription('Kiểm tra độ trễ của bot'),
    new SlashCommandBuilder().setName('hi1').setDescription('Gửi lời chào thân thương đến một người đáng yêu.').addUserOption(opt => opt.setName('người').setDescription('Người bạn muốn chào').setRequired(true)),
    new SlashCommandBuilder().setName('hi2').setDescription('Gửi lời chúc theo buổi tới một người dễ thương.').addUserOption(opt => opt.setName('người').setDescription('Người bạn muốn chúc').setRequired(true)).addStringOption(opt => opt.setName('chon_buoi').setDescription('Chọn một buổi có sẵn trong ngày.').setRequired(false).addChoices({ name: '☀️ Buổi Sáng', value: 'sáng' }, { name: '🕛 Buổi Trưa', value: 'trưa' }, { name: '🌇 Buổi Chiều', value: 'chiều' }, { name: '🌙 Buổi Tối', value: 'tối' })).addStringOption(opt => opt.setName('loi_chuc').setDescription('Hoặc tự nhập một lời chúc riêng.').setRequired(false)),
    new SlashCommandBuilder().setName('time').setDescription('Xem thời gian hiện tại ở các quốc gia').addStringOption(opt => opt.setName('quoc_gia').setDescription('Chọn quốc gia muốn xem giờ.').setRequired(false).addChoices({ name: '🇻🇳 Việt Nam', value: 'Asia/Ho_Chi_Minh' }, { name: '🇯🇵 Nhật Bản', value: 'Asia/Tokyo' }, { name: '🇹🇼 Đài Loan', value: 'Asia/Taipei' }, { name: '🇹🇭 Thái Lan', value: 'Asia/Bangkok' }, { name: '🇺🇸 Bờ Tây Hoa Kỳ (Los Angeles, San Francisco)', value: 'America/Los_Angeles' }, { name: '🇷🇺 Nga (Moscow)', value: 'Europe/Moscow' }, { name: '🇬🇧 Vương quốc Anh', value: 'Europe/London' })),
    new SlashCommandBuilder().setName('feedback').setDescription('Mở một form để gửi phản hồi trực tiếp.').addChannelOption(opt => opt.setName('kênh').setDescription('Kênh để gửi phản hồi. Bỏ trống sẽ gửi đến kênh mặc định.').addChannelTypes(ChannelType.GuildText).setRequired(false)),
    new SlashCommandBuilder().setName('avatar').setDescription('Xem ảnh đại diện của một người dùng.').addUserOption(opt => opt.setName('người').setDescription('Người bạn muốn xem avatar').setRequired(false)),
    new SlashCommandBuilder().setName('poll').setDescription('Tạo một cuộc bình chọn nhanh.').addStringOption(opt => opt.setName('câu_hỏi').setDescription('Nội dung câu hỏi bình chọn.').setRequired(true)).addStringOption(opt => opt.setName('lựa_chọn').setDescription('Các lựa chọn, cách nhau bởi dấu phẩy (,). Tối đa 10.').setRequired(true)),
    new SlashCommandBuilder().setName('announce').setDescription('Gửi một thông báo dưới dạng embed tới một kênh.').addChannelOption(opt => opt.setName('kênh').setDescription('Kênh để gửi thông báo.').setRequired(true).addChannelTypes(ChannelType.GuildText)).addStringOption(opt => opt.setName('nội_dung').setDescription('Nội dung thông báo. Dùng \\n để xuống dòng.').setRequired(true)).addStringOption(opt => opt.setName('tiêu_đề').setDescription('Tiêu đề của thông báo.')).addStringOption(opt => opt.setName('màu').setDescription('Mã màu Hex cho embed (vd: #3498db).')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('clear').setDescription('Xóa một số lượng tin nhắn trong kênh hiện tại.').addIntegerOption(opt => opt.setName('số_lượng').setDescription('Số tin nhắn cần xóa (từ 1 đến 100).').setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder().setName('kick').setDescription('Kick một thành viên khỏi server.').addUserOption(opt => opt.setName('người').setDescription('Thành viên cần kick').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Lý do kick')).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).setDMPermission(false),
    new SlashCommandBuilder().setName('ban').setDescription('Ban một thành viên khỏi server.').addUserOption(opt => opt.setName('người').setDescription('Thành viên cần ban').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Lý do ban')).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).setDMPermission(false),
    new SlashCommandBuilder().setName('unban').setDescription('Gỡ ban cho một thành viên bằng ID.').addStringOption(opt => opt.setName('userid').setDescription('ID của người dùng cần gỡ ban').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).setDMPermission(false),
    new SlashCommandBuilder().setName('timeout').setDescription('Timeout một thành viên.').addUserOption(opt => opt.setName('người').setDescription('Thành viên cần timeout').setRequired(true)).addStringOption(opt => opt.setName('time').setDescription('Thời gian mute (vd: 10m, 1h, 2d)').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Lý do mute')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setDMPermission(false),
    new SlashCommandBuilder().setName('untimeout').setDescription('Gỡ timeout cho một thành viên.').addUserOption(opt => opt.setName('người').setDescription('Thành viên cần gỡ timeout').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setDMPermission(false),
    new SlashCommandBuilder().setName('rename').setDescription('Đổi nickname cho một thành viên.').addUserOption(opt => opt.setName('người').setDescription('Thành viên cần đổi tên').setRequired(true)).addStringOption(opt => opt.setName('nickname').setDescription('Nickname mới').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames).setDMPermission(false),
    new SlashCommandBuilder().setName('move').setDescription('Di chuyển một thành viên sang kênh thoại khác.').addUserOption(opt => opt.setName('người').setDescription('Thành viên cần di chuyển').setRequired(true)).addChannelOption(opt => opt.setName('channel').setDescription('Kênh thoại muốn chuyển đến').addChannelTypes(ChannelType.GuildVoice).setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers).setDMPermission(false),
    new SlashCommandBuilder().setName('roletemp').setDescription('Gán một vai trò tạm thời cho thành viên.').addUserOption(opt => opt.setName('người').setDescription('Thành viên bạn muốn gán vai trò.').setRequired(true)).addRoleOption(opt => opt.setName('vai_trò').setDescription('Vai trò bạn muốn gán.').setRequired(true)).addStringOption(opt => opt.setName('thời_hạn').setDescription('Thời hạn (ví dụ: 10m, 1h, 7d).').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    new SlashCommandBuilder().setName('unroletemp').setDescription('Gỡ một vai trò tạm thời khỏi thành viên ngay lập tức.').addUserOption(opt => opt.setName('người').setDescription('Thành viên bạn muốn gỡ vai trò.').setRequired(true)).addRoleOption(opt => opt.setName('vai_trò').setDescription('Vai trò bạn muốn gỡ.').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    new SlashCommandBuilder().setName('ticketsetup').setDescription('Cài đặt bảng điều khiển ticket có tùy chỉnh.').addStringOption(opt => opt.setName('tieu_de').setDescription('Tiêu đề chính của bảng điều khiển.').setRequired(true)).addStringOption(opt => opt.setName('mo_ta').setDescription('Nội dung mô tả chi tiết. Dùng \\n để xuống dòng.').setRequired(true)).addStringOption(opt => opt.setName('content').setDescription('Nội dung tin nhắn riêng bên trên embed (để ping role, thêm emoji...).')).addStringOption(opt => opt.setName('hinh_anh').setDescription('URL hình ảnh (ảnh bìa) của bảng điều khiển.')).addStringOption(opt => opt.setName('anh_banner').setDescription('URL của hình ảnh lớn hiển thị phía trên embed.')).addStringOption(opt => opt.setName('mau_sac').setDescription('Mã màu Hex cho đường viền (ví dụ: #FF5733).')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('formsetup').setDescription('Cài đặt bảng điều khiển để mở form feedback.').addStringOption(opt => opt.setName('tieu_de').setDescription('Tiêu đề chính của bảng điều khiển.').setRequired(true)).addStringOption(opt => opt.setName('mo_ta').setDescription('Nội dung mô tả chi tiết. Dùng \\n để xuống dòng.').setRequired(true)).addStringOption(opt => opt.setName('content').setDescription('Nội dung tin nhắn riêng bên trên embed (để ping role, thêm emoji...).')).addChannelOption(opt => opt.setName('kenh_nhan_form').setDescription('Kênh sẽ nhận kết quả form. Mặc định là kênh feedback chung.')).addStringOption(opt => opt.setName('hinh_anh').setDescription('URL hình ảnh (ảnh bìa) của bảng điều khiển.')).addStringOption(opt => opt.setName('mau_sac').setDescription('Mã màu Hex cho đường viền (ví dụ: #FF5733).')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('warn').setDescription('Gửi cảnh cáo đến một thành viên.').addUserOption(opt => opt.setName('người').setDescription('Thành viên cần cảnh cáo').setRequired(true)).addStringOption(opt => opt.setName('lý_do').setDescription('Lý do cảnh cáo').setRequired(true)).addStringOption(opt => opt.setName('nơi_gửi').setDescription('Chọn nơi gửi cảnh cáo.').setRequired(true).addChoices({ name: 'Gửi trong Server (Công khai)', value: 'server' }, { name: 'Gửi qua Tin nhắn riêng (DM)', value: 'dm' })).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder().setName('resettickets').setDescription('Reset số đếm của ticket về lại 1.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('warnings').setDescription('Kiểm tra số lần cảnh cáo của một thành viên.').addUserOption(opt => opt.setName('người').setDescription('Thành viên cần kiểm tra.').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder().setName('resetwarnings').setDescription('Xóa toàn bộ cảnh cáo của một thành viên.').addUserOption(opt => opt.setName('người').setDescription('Thành viên cần xóa cảnh cáo.').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('giveaway').setDescription('Quản lý hệ thống giveaway.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false).addSubcommand(sub => sub.setName('start').setDescription('Bắt đầu một giveaway mới.').addStringOption(opt => opt.setName('duration').setDescription('Thời gian giveaway (vd: 1d, 12h, 30m)').setRequired(true)).addIntegerOption(opt => opt.setName('winners').setDescription('Số lượng người thắng.').setRequired(true).setMinValue(1)).addStringOption(opt => opt.setName('prize').setDescription('Giải thưởng là gì?').setRequired(true)).addChannelOption(opt => opt.setName('channel').setDescription('Kênh để tổ chức giveaway (mặc định là kênh hiện tại).').addChannelTypes(ChannelType.GuildText).setRequired(false))).addSubcommand(sub => sub.setName('reroll').setDescription('Chọn lại một người thắng khác cho giveaway đã kết thúc.').addStringOption(opt => opt.setName('message_id').setDescription('ID tin nhắn của giveaway đã kết thúc.').setRequired(true))).addSubcommand(sub => sub.setName('end').setDescription('Kết thúc một giveaway ngay lập tức.').addStringOption(opt => opt.setName('message_id').setDescription('ID tin nhắn của giveaway đang chạy.').setRequired(true))),
    new SlashCommandBuilder().setName('help').setDescription('Hiển thị danh sách các lệnh hoặc thông tin chi tiết về một lệnh cụ thể.').addStringOption(opt => opt.setName('lệnh').setDescription('Tên lệnh bạn muốn xem chi tiết.').setRequired(false)),
    new SlashCommandBuilder().setName('play').setDescription('Phát một bài hát từ YouTube.').addStringOption(opt => opt.setName('bài_hát').setDescription('Tên bài hát hoặc link YouTube.').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hát hiện tại.'),
    new SlashCommandBuilder().setName('stop').setDescription('Dừng phát nhạc và xóa hàng đợi.'),
    new SlashCommandBuilder().setName('queue').setDescription('Hiển thị hàng đợi bài hát.'),
    new SlashCommandBuilder().setName('pause').setDescription('Tạm dừng bài hát hiện tại.'),
    new SlashCommandBuilder().setName('resume').setDescription('Tiếp tục phát bài hát đã tạm dừng.'),
    new SlashCommandBuilder().setName('nowplaying').setDescription('Hiển thị thông tin bài hát đang phát.'),
    new SlashCommandBuilder().setName('loop').setDescription('Lặp lại bài hát hoặc hàng đợi.').addStringOption(opt => opt.setName('chế_độ').setDescription('Chọn chế độ lặp.').setRequired(true).addChoices({ name: 'Tắt', value: 'off' }, { name: 'Bài hát', value: 'song' }, { name: 'Hàng đợi', value: 'queue' })),
    new SlashCommandBuilder().setName('applysetup').setDescription('Cài đặt bảng đăng ký tuyển dụng Staff chuyên nghiệp.').addChannelOption(opt => opt.setName('kênh_nhận_đơn').setDescription('Kênh riêng tư để bot gửi đơn đăng ký của thành viên vào.').setRequired(true).addChannelTypes(ChannelType.GuildText)).addStringOption(opt => opt.setName('tiêu_đề').setDescription('Tiêu đề chính của embed.').setRequired(true)).addStringOption(opt => opt.setName('mô_tả').setDescription('Nội dung chi tiết của embed. Dùng \\n để xuống dòng.').setRequired(true)).addStringOption(opt => opt.setName('menu_placeholder').setDescription('Chữ mờ trong menu khi chưa chọn (ví dụ: Make a selection).').setRequired(true)).addStringOption(opt => opt.setName('menu_label').setDescription('Chữ trong tùy chọn của menu (ví dụ: Đăng kí Staff).').setRequired(true)).addStringOption(opt => opt.setName('content').setDescription('Nội dung chữ bên trên embed (dùng để ping role...).')).addStringOption(opt => opt.setName('image_url').setDescription('URL của ảnh lớn (banner) hiển thị trong embed.')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

// --- ĐĂNG KÝ LỆNH SLASH ---
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
    try {
        console.log('Đang đăng ký các lệnh slash...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('Đã đăng ký thành công các lệnh slash.');
    } catch (error) {
        console.error('Lỗi khi đăng ký lệnh:', error);
    }
})();

// --- KHỞI TẠO CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.GuildMember]
});

// --- CÁC HÀM HỖ TRỢ ---

// Hàm phát nhạc
async function playSong(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.textChannel.send('🎶 Hàng đợi đã hết, tôi sẽ rời kênh thoại sau 1 phút nữa.');
        setTimeout(() => {
            const currentQueue = queue.get(guild.id);
            if (currentQueue && currentQueue.songs.length === 0) {
                if(currentQueue.connection) currentQueue.connection.destroy();
                queue.delete(guild.id);
            }
        }, 60000);
        return;
    }
    try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        serverQueue.player.play(resource);
        serverQueue.playing = true;
        const nowPlayingEmbed = new EmbedBuilder().setColor('Green').setTitle('🎵 Đang phát').setDescription(`**[${song.title}](${song.url})**`).setThumbnail(song.thumbnail).addFields({ name: 'Thời lượng', value: song.duration, inline: true }, { name: 'Yêu cầu bởi', value: song.requestedBy.toString(), inline: true }).setTimestamp();
        await serverQueue.textChannel.send({ embeds: [nowPlayingEmbed] });
    } catch (error) {
        console.error(`Lỗi khi phát bài hát "${song.title}":`, error);
        await serverQueue.textChannel.send(`❌ Đã có lỗi xảy ra khi cố gắng phát bài: **${song.title}**. Đang tự động chuyển sang bài tiếp theo.`);
        serverQueue.songs.shift();
        playSong(guild, serverQueue.songs[0]);
    }
}

// Hàm kết thúc giveaway
async function endGiveaway(messageId) {
    const giveaway = db.prepare('SELECT * FROM giveaways WHERE messageId = ? AND ended = 0').get(messageId);
    if (!giveaway) return;
    db.prepare('UPDATE giveaways SET ended = 1 WHERE messageId = ?').run(messageId);
    const channel = await client.channels.cache.get(giveaway.channelId);
    if (!channel) return;
    try {
        const message = await channel.messages.fetch(messageId);
        const reaction = message.reactions.cache.get('🎉');
        const users = await reaction.users.fetch();
        const participants = users.filter(user => !user.bot).map(user => user.id);
        if (participants.length === 0) {
            const endedEmbed = EmbedBuilder.from(message.embeds[0]).setColor('Red').setDescription(`Không có ai tham gia, không thể chọn người thắng!`);
            await message.edit({ embeds: [endedEmbed], components: [] });
            return channel.send(`Giveaway cho **${giveaway.prize}** đã kết thúc mà không có người tham gia.`);
        }
        const winners = [];
        for (let i = 0; i < giveaway.winnerCount; i++) {
            if (participants.length === 0) break;
            const winnerIndex = Math.floor(Math.random() * participants.length);
            winners.push(participants.splice(winnerIndex, 1)[0]);
        }
        const winnerTags = winners.map(id => `<@${id}>`).join(', ');
        const endedEmbed = EmbedBuilder.from(message.embeds[0]).setColor('Gold').setDescription(`**Giveaway đã kết thúc!**\nNgười thắng: ${winnerTags}`);
        await message.edit({ embeds: [endedEmbed], components: [] });
        await channel.send(`🎉 Chúc mừng ${winnerTags}! Bạn đã thắng **${giveaway.prize}**! 🎉`);
    } catch (error) {
        console.error(`Lỗi khi kết thúc giveaway (ID: ${messageId}):`, error);
        channel.send(`Đã có lỗi khi cố gắng kết thúc giveaway cho **${giveaway.prize}**. Vui lòng kiểm tra lại tin nhắn gốc.`);
    }
}

// Hàm lên lịch giveaway khi bot khởi động
async function scheduleGiveawaysOnStartup() {
    const activeGiveaways = db.prepare('SELECT * FROM giveaways WHERE ended = 0').all();
    console.log(`🔎 Tìm thấy ${activeGiveaways.length} giveaway đang hoạt động...`);
    for (const giveaway of activeGiveaways) {
        const remainingTime = giveaway.endsAt - Date.now();
        if (remainingTime <= 0) {
            console.log(`Giveaway (ID: ${giveaway.messageId}) đã hết hạn, đang kết thúc...`);
            await endGiveaway(giveaway.messageId);
        } else {
            console.log(`Khôi phục lịch hẹn kết thúc giveaway (ID: ${giveaway.messageId}) sau ${ms(remainingTime)}.`);
            setTimeout(() => endGiveaway(giveaway.messageId), remainingTime);
        }
    }
}

// Hàm gỡ vai trò tạm thời
async function removeTempRole(userId, guildId, roleId) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member && member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            console.log(`Đã gỡ vai trò ${roleId} khỏi ${userId} trong server ${guild.name}`);
        }
    } catch (error) {
        console.error(`Lỗi khi gỡ vai trò ${roleId} khỏi ${userId}:`, error);
    } finally {
        db.prepare(`DELETE FROM temp_roles WHERE userId = ? AND roleId = ? AND guildId = ?`).run(userId, roleId, guildId);
    }
}

// Hàm khôi phục lịch gỡ vai trò tạm thời khi bot khởi động
function restoreTempRoles() {
    const rolesToRestore = db.prepare(`SELECT * FROM temp_roles`).all();
    console.log(`🔎 Tìm thấy ${rolesToRestore.length} vai trò tạm thời cần khôi phục...`);
    rolesToRestore.forEach(async (entry) => {
        const remainingTime = entry.expiresAt - Date.now();
        if (remainingTime <= 0) {
            console.log(`Vai trò ${entry.roleId} của ${entry.userId} đã hết hạn, đang gỡ...`);
            await removeTempRole(entry.userId, entry.guildId, entry.roleId);
        } else {
            console.log(`Khôi phục lịch hẹn gỡ vai trò ${entry.roleId} cho ${entry.userId} sau ${ms(remainingTime)}.`);
            setTimeout(() => removeTempRole(entry.userId, entry.guildId, entry.roleId), remainingTime);
        }
    });
}

// ================================================================= //
// --- SỰ KIỆN BOT SẴN SÀNG ---
// ================================================================= //
client.once('ready', () => {
    console.log(`✅ Bot đã online! Tên bot: ${client.user.tag}`);
    client.user.setPresence({
        activities: [{
            name: '🌃 Ngắm sao đêm cùng Phúc | /help',
            type: ActivityType.Watching
        }],
        status: 'dnd',
    });
    restoreTempRoles();
    scheduleGiveawaysOnStartup();
});


// ================================================================= //
// --- TRÌNH LẮNG NGHE TƯƠNG TÁC DUY NHẤT (ĐÃ SỬA LỖI) ---
// ================================================================= //
client.on('interactionCreate', async interaction => {

    // --- XỬ LÝ NỘP FORM (MODAL) ---
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('feedbackModal_')) {
            const channelId = interaction.customId.split('_')[1];
            const tieuDe = interaction.fields.getTextInputValue('tieuDeInput');
            const noiDung = interaction.fields.getTextInputValue('noiDungInput');
            const danhGia = interaction.fields.getTextInputValue('danhGiaInput') || 'Chưa đánh giá';
            const feedbackEmbed = new EmbedBuilder().setColor('Green').setTitle(`📝 Phản hồi mới: ${tieuDe}`).setDescription(noiDung).addFields({ name: 'Đánh giá', value: `**${danhGia}**` }).setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }).setTimestamp();
            try {
                const channel = await client.channels.fetch(channelId);
                if (channel) {
                    await channel.send({ embeds: [feedbackEmbed] });
                    await interaction.reply({ content: `Cảm ơn bạn! Phản hồi đã được gửi tới kênh ${channel}.`, ephemeral: true });
                } else {
                    await interaction.reply({ content: 'Lỗi: Không tìm thấy kênh được chỉ định.', ephemeral: true });
                }
            } catch (error) {
                console.error("Lỗi khi gửi feedback:", error);
                await interaction.reply({ content: 'Đã có lỗi xảy ra. Có thể tôi không có quyền gửi tin nhắn vào kênh đó.', ephemeral: true });
            }
        } else if (interaction.customId.startsWith('staff_application_modal_')) {
            const receivingChannelId = interaction.customId.split('_')[3];
            await interaction.deferReply({ ephemeral: true });
            const answer1 = interaction.fields.getTextInputValue('apply_q1');
            const answer2 = interaction.fields.getTextInputValue('apply_q2');
            const answer3 = interaction.fields.getTextInputValue('apply_q3');
            const applicationEmbed = new EmbedBuilder().setColor('Green').setTitle(`📝 Đơn đăng ký Staff mới`).setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }).addFields({ name: '👤 Người nộp đơn', value: interaction.user.toString(), inline: true }, { name: '🆔 User ID', value: `\`${interaction.user.id}\``, inline: true }, { name: '\u200B', value: '\u200B' }, { name: 'Tên trong game/Tên gọi của bạn là gì?', value: `\`\`\`${answer1}\`\`\`` }, { name: 'Bạn bao nhiêu tuổi?', value: `\`\`\`${answer2}\`\`\`` }, { name: 'Tại sao bạn muốn ứng tuyển vào vị trí Staff?', value: `\`\`\`${answer3}\`\`\`` }).setTimestamp();
            try {
                const channel = await client.channels.fetch(receivingChannelId);
                if (channel) {
                    await channel.send({ embeds: [applicationEmbed] });
                    await interaction.followUp({ content: '✅ Đã gửi đơn đăng ký của bạn thành công! Vui lòng chờ phản hồi từ Staff.' });
                } else {
                    await interaction.followUp({ content: '❌ Lỗi: Không tìm thấy kênh để nộp đơn. Vui lòng báo cho Admin.' });
                }
            } catch (error) {
                console.error("Lỗi khi gửi đơn đăng ký:", error);
                await interaction.followUp({ content: '❌ Đã có lỗi xảy ra khi gửi đơn của bạn.' });
            }
        }
        return;
    }

    // --- XỬ LÝ BẤM NÚT (BUTTON) ---
    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId === 'show_ticket_options') {
            const selectMenu = new StringSelectMenuBuilder().setCustomId('select_ticket_category').setPlaceholder('Vui lòng chọn một loại hỗ trợ !').addOptions([{ label: 'Hỗ trợ Chung', description: 'Các vấn đề về lỗi, kỹ thuật hoặc cần hướng dẫn.', value: 'technical_support', emoji: '<a:chat:1413005097633583214>' }, { label: 'Liên hệ Admin', description: 'Liên hệ với em Phúc.', value: 'admin_contact', emoji: '<a:Purp_Alert:1413004990037098547>' }]);
            const row = new ActionRowBuilder().addComponents(selectMenu);
            await interaction.reply({ content: '**Bạn cần hỗ trợ về vấn đề gì? Hãy chọn ở danh sách dưới nhé ! <:PridecordWarning:1412665674026717207> **', components: [row], ephemeral: true });
        } else if (customId === 'close_ticket') {
            if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: 'Chỉ đội ngũ hỗ trợ mới có thể đóng ticket.', ephemeral: true });
            }
            await interaction.reply({ content: 'Đang xóa kênh...', ephemeral: true });
            interaction.channel.delete().catch(err => console.error("Không thể xóa kênh ticket:", err));
        } else if (customId.startsWith('open_feedback_form_')) {
            const feedbackChannelId = customId.split('_')[3];
            const modal = new ModalBuilder().setCustomId(`feedbackModal_${feedbackChannelId}`).setTitle('Gửi phản hồi cho Phúc');
            const tieuDeInput = new TextInputBuilder().setCustomId('tieuDeInput').setLabel("Tên của bạn ?").setStyle(TextInputStyle.Short).setPlaceholder('Ghi ở đây !').setRequired(true);
            const noiDungInput = new TextInputBuilder().setCustomId('noiDungInput').setLabel("Nội dung").setStyle(TextInputStyle.Paragraph).setPlaceholder('Bạn muốn nói điều gì ? Hãy ghi ở đây !').setRequired(true).setMinLength(10);
            const danhGiaInput = new TextInputBuilder().setCustomId('danhGiaInput').setLabel("Nội dung 2").setStyle(TextInputStyle.Paragraph).setPlaceholder('Bạn muốn nói điều gì ? Hãy ghi ở đây ! Không có thì bỏ trống.').setRequired(false);
            modal.addComponents(new ActionRowBuilder().addComponents(tieuDeInput), new ActionRowBuilder().addComponents(noiDungInput), new ActionRowBuilder().addComponents(danhGiaInput));
            await interaction.showModal(modal);
        } else if (customId.startsWith('start_application_form_')) {
            const ids = customId.split('_');
            const guildId = ids[3];
            const receivingChannelId = ids[4];
            const questions = ['1/6. Họ và tên đầy đủ của bạn ở ngoài đời là gì?', '2/6. Ngày tháng năm sinh của bạn là gì?', '3/6. Bạn có kinh nghiệm làm Staff ở server nào khác chưa? Nếu có hãy kể tên.', '4/6. Bạn có thể dành bao nhiêu thời gian mỗi ngày cho server?', '5/6. Tại sao bạn nghĩ mình phù hợp với vị trí này?', '6/6. Bạn có câu hỏi hay đề xuất nào khác cho server không?'];
            const answers = [];
            const user = interaction.user;
            const dmChannel = interaction.channel;
            const disabledStartButton = ButtonBuilder.from(interaction.component).setDisabled(true);
            const disabledCancelButton = ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true);
            const row = new ActionRowBuilder().addComponents(disabledStartButton, disabledCancelButton);
            await interaction.update({ components: [row] });
            await dmChannel.send('✅ **Bắt đầu.** Vui lòng trả lời lần lượt các câu hỏi bên dưới.\n*Gõ `cancel` để hủy bỏ bất cứ lúc nào.*');
            const collector = dmChannel.createMessageCollector({ filter: m => m.author.id === user.id });
            let questionIndex = 0;
            const questionEmbed = new EmbedBuilder().setColor('Blue').setTitle('📝 Đăng kí Staff').setDescription(questions[questionIndex]);
            await dmChannel.send({ embeds: [questionEmbed] });
            collector.on('collect', message => {
                if (message.content.toLowerCase() === 'cancel') {
                    collector.stop('cancelled');
                    return;
                }
                answers.push(message.content);
                questionIndex++;
                if (questionIndex < questions.length) {
                    const nextQuestionEmbed = new EmbedBuilder().setColor('Blue').setTitle('📝 Đăng kí Staff').setDescription(questions[questionIndex]);
                    dmChannel.send({ embeds: [nextQuestionEmbed] });
                } else {
                    collector.stop('completed');
                }
            });
            collector.on('end', async (collected, reason) => {
                if (reason === 'cancelled') return dmChannel.send('❌ Bạn đã hủy quá trình đăng ký.');
                if (reason !== 'completed') return;
                await dmChannel.send('✅ Cảm ơn bạn! Đơn đăng ký của bạn đã được ghi nhận và sẽ được xem xét sớm.');
                const applicationEmbed = new EmbedBuilder().setColor('Yellow').setTitle(`📝 Đơn đăng ký Staff mới - Chờ duyệt`).setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() }).addFields({ name: '👤 Người nộp đơn', value: user.toString(), inline: true }, { name: '🆔 User ID', value: `\`${user.id}\``, inline: true }, { name: '\u200B', value: '\u200B' }).setTimestamp().setFooter({ text: `ID Người nộp đơn: ${user.id}` });
                questions.forEach((question, index) => {
                    applicationEmbed.addFields({ name: `Câu hỏi: ${question}`, value: `\`\`\`${answers[index] || 'Không có câu trả lời'}\`\`\`` });
                });
                const acceptButton = new ButtonBuilder().setCustomId(`accept_application_${user.id}_${guildId}`).setLabel('Chấp thuận').setStyle(ButtonStyle.Success).setEmoji('✅');
                const rejectButton = new ButtonBuilder().setCustomId(`reject_application_${user.id}_${guildId}`).setLabel('Từ chối').setStyle(ButtonStyle.Danger).setEmoji('❌');
                const buttonRow = new ActionRowBuilder().addComponents(acceptButton, rejectButton);
                try {
                    const receivingChannel = await client.channels.fetch(receivingChannelId);
                    if (receivingChannel) {
                        await receivingChannel.send({ embeds: [applicationEmbed], components: [buttonRow] });
                    }
                } catch (error) { console.error("Lỗi khi gửi đơn vào kênh staff:", error); }
            });
        } else if (customId === 'cancel_application') {
            await interaction.update({ content: '❌ Quá trình đăng ký đã được hủy. Bạn có thể bắt đầu lại từ server khi nào sẵn sàng.', components: [] });
        } else if (customId.startsWith('accept_application_')) {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: 'Bạn không có quyền thực hiện hành động này.', ephemeral: true });
            }
            await interaction.deferUpdate();
            const ids = customId.split('_');
            const applicantId = ids[2];
            const guildId = ids[3];
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) return console.error(`Không tìm thấy server với ID: ${guildId}`);
            const applicantMember = await guild.members.fetch(applicantId).catch(() => null);
            if (!applicantMember) return interaction.followUp({ content: 'Lỗi: Không tìm thấy thành viên này trong server.', ephemeral: true });
            const staffRole = guild.roles.cache.get(STAFF_ROLE_ID);
            if (staffRole) await applicantMember.roles.add(staffRole);
            await applicantMember.send(`🎉 Chúc mừng! Đơn đăng ký Staff của bạn tại server **${guild.name}** đã được chấp thuận.`).catch(() => {});
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor('Green').setTitle(`✅ Đã được chấp thuận bởi ${interaction.user.tag}`);
            await interaction.editReply({ embeds: [originalEmbed], components: [] });
        } else if (customId.startsWith('reject_application_')) {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: 'Bạn không có quyền thực hiện hành động này.', ephemeral: true });
            }
            await interaction.deferUpdate();
            const ids = customId.split('_');
            const applicantId = ids[2];
            const guildId = ids[3];
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) return console.error(`Không tìm thấy server với ID: ${guildId}`);
            const applicantMember = await guild.members.fetch(applicantId).catch(() => null);
            if (applicantMember) {
                 await applicantMember.send(`😔 Rất tiếc, đơn đăng ký Staff của bạn tại server **${guild.name}** đã bị từ chối. Cảm ơn bạn đã quan tâm.`).catch(() => {});
            }
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor('Red').setTitle(`❌ Đã bị từ chối bởi ${interaction.user.tag}`);
            await interaction.editReply({ embeds: [originalEmbed], components: [] });
        }
        return;
    }

    // --- XỬ LÝ CHỌN MENU (SELECT MENU) ---
    if (interaction.isStringSelectMenu()) {
        const customId = interaction.customId;

        if (customId === 'select_ticket_category') {
            await interaction.deferReply({ ephemeral: true });
            const selectedValue = interaction.values[0];
            let categoryId, ticketType, welcomeMessage, ticketContent;
            switch (selectedValue) {
                case 'technical_support':
                    categoryId = SUPPORT_TICKET_CATEGORY_ID;
                    ticketType = 'hỗ-trợ';
                    welcomeMessage = `Hỗ trợ bạn về vấn đề **Kỹ thuật/Chung**. Vui lòng trình bày chi tiết vấn đề bạn đang gặp phải.`;
                    ticketContent = `## **<a:vssparkly:1410282814250684487> Chào ${interaction.user}, bạn cần hỗ trợ về vấn đề gì hoặc khiếu nại thì cứ ghi vào nhé <a:vssparkly:1410282814250684487>**`;
                    break;
                case 'admin_contact':
                    categoryId = ADMIN_TICKET_CATEGORY_ID;
                    ticketType = 'admin';
                    welcomeMessage = `**Cần alo ngay em Phúc**`;
                    ticketContent = `## **<a:vssparkly:1410282814250684487> Chào ${interaction.user}, Phúc sẽ có mặt ngay để hỗ trợ <a:vssparkly:1410282814250684487>**`;
                    break;
                default:
                    return interaction.followUp({ content: 'Lựa chọn không hợp lệ.', ephemeral: true });
            }
            try {
                let ticketCounter = parseInt(db.prepare(`SELECT value FROM settings WHERE key = ?`).get('ticketCounter').value);
                const ticketChannelName = `${ticketType}-${ticketCounter}`;
                const ticketChannel = await interaction.guild.channels.create({
                    name: ticketChannelName,
                    type: ChannelType.GuildText,
                    parent: categoryId,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        { id: SUPPORT_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ],
                });
                db.prepare(`UPDATE settings SET value = ? WHERE key = ?`).run((ticketCounter + 1).toString(), 'ticketCounter');
                const ticketWelcomeEmbed = new EmbedBuilder().setColor('#57F287').setTitle(`Ticket ${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)}`).setDescription(`Chào ${interaction.user}, cảm ơn bạn đã liên hệ.\n\nĐội ngũ <@&${SUPPORT_ROLE_ID}> sẽ ${welcomeMessage}`).setTimestamp();
                const closeButton = new ButtonBuilder().setCustomId('close_ticket').setLabel('Đóng Ticket').setStyle(ButtonStyle.Danger).setEmoji('<:close51:1413054667021352960>');
                const row = new ActionRowBuilder().addComponents(closeButton);
                await ticketChannel.send({ content: ticketContent, embeds: [ticketWelcomeEmbed], components: [row] });
                await interaction.followUp({ content: `Đã tạo ticket của bạn tại ${ticketChannel}.` });
            } catch (error) {
                console.error("Lỗi khi tạo ticket theo danh mục:", error);
                await interaction.followUp({ content: 'Đã xảy ra lỗi. Vui lòng kiểm tra lại các ID Category đã khai báo và quyền của bot.' });
            }
        } else if (customId === 'help_category_select') {
            const selectedCategory = interaction.values[0];
            const categories = {
                'fun_info': { label: '✨ Thông tin & Vui vẻ', commands: ['noitu', 'info', 'ping', 'hi1', 'hi2', 'time', 'feedback', 'avatar', 'poll'] },
                'mod_utility': { label: '🛠️ Quản lý & Tiện ích', commands: ['announce', 'clear', 'kick', 'ban', 'unban', 'timeout', 'untimeout', 'rename', 'move', 'warn', 'warnings', 'resetwarnings'] },
                'roles': { label: '👑 Quản lý Vai trò', commands: ['roletemp', 'unroletemp'] },
                'support': { label: '🎫 Ticket & Form', commands: ['ticketsetup', 'formsetup', 'resettickets', 'applysetup'] },
                'giveaway': { label: '🎉 Giveaway', commands: ['giveaway'] },
                'music': { label: '🎶 Nghe nhạc', commands: ['play', 'skip', 'stop', 'queue', 'pause', 'resume', 'nowplaying', 'loop'] }
            };
            const categoryData = categories[selectedCategory];
            if (!categoryData) return;
            const commandList = categoryData.commands.map(cmdName => {
                const cmd = commands.find(c => c.name === cmdName);
                return cmd ? `**\`/${cmd.name}\`**: ${cmd.description}` : '';
            }).filter(Boolean).join('\n');
            const categoryEmbed = new EmbedBuilder().setColor('Aqua').setTitle(categoryData.label).setDescription(commandList || 'Chưa có lệnh nào trong danh mục này.').setFooter({ text: 'Dùng /help [tên lệnh] để xem chi tiết hơn về một lệnh.'});
            await interaction.update({ embeds: [categoryEmbed] });
        } else if (customId.startsWith('staff_apply_menu_')) {
            const receivingChannelId = customId.split('_')[3];
            const guildId = interaction.guild.id;
            const startButton = new ButtonBuilder().setCustomId(`start_application_form_${guildId}_${receivingChannelId}`).setLabel('Bắt đầu điền Form').setStyle(ButtonStyle.Primary).setEmoji('📝');
            const cancelButton = new ButtonBuilder().setCustomId('cancel_application').setLabel('Hủy').setStyle(ButtonStyle.Danger).setEmoji('❌');
            const row = new ActionRowBuilder().addComponents(startButton, cancelButton);
            try {
                await interaction.user.send({ content: `Chào bạn, để bắt đầu quá trình đăng ký Staff tại server **${interaction.guild.name}**, vui lòng bấm nút bên dưới.`, components: [row] });
                await interaction.reply({ content: 'Mình đã gửi hướng dẫn đăng ký vào tin nhắn riêng (DM) của bạn. Hãy kiểm tra nhé!', ephemeral: true });
            } catch (error) {
                console.error("Lỗi khi gửi DM:", error);
                await interaction.reply({ content: 'Lỗi: Mình không thể gửi tin nhắn riêng cho bạn. Vui lòng kiểm tra cài đặt quyền riêng tư và thử lại.', ephemeral: true });
            }
        }
        return;
    }

    // --- XỬ LÝ LỆNH CHAT (/) ---
    if (interaction.isChatInputCommand()) {
        if (!interaction.inGuild()) return;
        const { commandName, user, guild } = interaction;
        
        // --- XỬ LÝ LỆNH /noitu ---
        if (commandName === 'noitu') {
            const subcommand = interaction.options.getSubcommand();
            const channel = interaction.channel;

            if (subcommand === 'start') {
                if (noituGames.has(channel.id)) {
                    return interaction.reply({ content: 'Game nối từ đã được bắt đầu ở kênh này rồi!', ephemeral: true });
                }

                const firstWord = "bắt đầu";
                const gameData = {
                    lastWord: firstWord,
                    lastPlayerId: client.user.id,
                    usedWords: new Set([firstWord]),
                };
                
                const startEmbed = new EmbedBuilder()
                    .setColor('Green')
                    .setTitle('📝 Game Nối Từ Bắt Đầu!')
                    .setDescription(`Luật chơi đã được thay đổi:\n- Nối từ tiếp theo bằng chữ cái cuối cùng của từ trước đó.\n- Từ ngữ phải là Tiếng Việt, có nghĩa và chỉ có một tiếng.\n- **Không có giới hạn thời gian.**\n- Khi ai đó bí, dùng lệnh \`/noitu stop\` để kết thúc và tìm ra người thắng cuộc.`)
                    .addFields({ name: 'Từ bắt đầu là', value: `**${firstWord}**` })
                    .setFooter({ text: `Chúc mọi người chơi vui vẻ!` });

                noituGames.set(channel.id, gameData);
                await interaction.reply({ embeds: [startEmbed] });
                await channel.send(`Từ tiếp theo phải bắt đầu bằng chữ **"${firstWord.slice(-1)}"**. Đến lượt mọi người!`);

            } else if (subcommand === 'stop') {
                if (!noituGames.has(channel.id)) {
                    return interaction.reply({ content: 'Không có game nối từ nào đang diễn ra ở kênh này.', ephemeral: true });
                }

                const game = noituGames.get(channel.id);
                noituGames.delete(channel.id);

                // --- THAY ĐỔI: Tuyên bố người thắng cuộc ---
                if (game.lastPlayerId === client.user.id) {
                     return interaction.reply({ content: '✅ Trò chơi đã kết thúc. Chưa có ai trả lời nên không có người thắng cuộc.' });
                } else {
                    const winner = await client.users.fetch(game.lastPlayerId);
                    return interaction.reply({ content: `**Trò chơi kết thúc!**\n🎉 Người chiến thắng là **${winner.tag}** với từ cuối cùng là **"${game.lastWord}"**! 🎉` });
                }
            }
            return;
        }

        const musicCommands = ['play', 'skip', 'stop', 'queue', 'pause', 'resume', 'nowplaying', 'loop'];
        if (musicCommands.includes(commandName)) {
            const serverQueue = queue.get(interaction.guild.id);
            const voiceChannel = interaction.member.voice.channel;
            if (commandName === 'play') {
                if (!voiceChannel) return interaction.reply({ content: 'Bạn cần phải ở trong một kênh thoại để phát nhạc!', ephemeral: true });
                const permissions = voiceChannel.permissionsFor(interaction.client.user);
                if (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
                    return interaction.reply({ content: 'Tôi không có quyền tham gia và nói trong kênh thoại của bạn!', ephemeral: true });
                }
                await interaction.deferReply();
                const query = interaction.options.getString('bài_hát');
                const searchResult = await play.search(query, { limit: 1 });
                if (searchResult.length === 0) return interaction.followUp({ content: `Không tìm thấy bài hát nào với tên "${query}"` });
                const video = searchResult[0];
                const song = { title: video.title, url: video.url, thumbnail: video.thumbnails[0]?.url, duration: video.durationRaw, requestedBy: interaction.user };
                if (!serverQueue) {
                    const queueConstruct = { textChannel: interaction.channel, voiceChannel: voiceChannel, connection: null, songs: [], player: createAudioPlayer(), playing: true, loop: 'off' };
                    queue.set(interaction.guild.id, queueConstruct);
                    queueConstruct.songs.push(song);
                    try {
                        const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: interaction.guild.id, adapterCreator: interaction.guild.voiceAdapterCreator });
                        queueConstruct.connection = connection;
                        queueConstruct.player.on(AudioPlayerStatus.Idle, () => {
                            const oldSong = queueConstruct.songs.shift();
                            if (queueConstruct.loop === 'song') queueConstruct.songs.unshift(oldSong);
                            else if (queueConstruct.loop === 'queue') queueConstruct.songs.push(oldSong);
                            playSong(interaction.guild, queueConstruct.songs[0]);
                        });
                        queueConstruct.player.on('error', error => { console.error(`Lỗi player: ${error.message}`); queueConstruct.songs.shift(); playSong(interaction.guild, queueConstruct.songs[0]); });
                        connection.subscribe(queueConstruct.player);
                        playSong(interaction.guild, queueConstruct.songs[0]);
                        await interaction.followUp({ content: `Đã bắt đầu phát: **${song.title}**` });
                    } catch (err) {
                        console.error(err);
                        queue.delete(interaction.guild.id);
                        return interaction.followUp({ content: 'Đã có lỗi xảy ra khi kết nối vào kênh thoại.' });
                    }
                } else {
                    serverQueue.songs.push(song);
                    return interaction.followUp({ content: `Đã thêm **${song.title}** vào hàng đợi!` });
                }
            } else if (commandName === 'skip') {
                if (!voiceChannel || !serverQueue) return interaction.reply({ content: 'Bạn phải ở trong kênh thoại và phải có nhạc đang phát!', ephemeral: true });
                if (serverQueue.songs.length <= 1 && serverQueue.loop !== 'queue') {
                    serverQueue.player.stop();
                    serverQueue.connection.destroy();
                    queue.delete(interaction.guild.id);
                    return interaction.reply('Đã bỏ qua. Hàng đợi trống, tôi đã rời kênh thoại.');
                }
                serverQueue.player.stop();
                return interaction.reply('Đã bỏ qua bài hát!');
            } else if (commandName === 'stop') {
                if (!voiceChannel || !serverQueue) return interaction.reply({ content: 'Bạn phải ở trong kênh thoại và phải có nhạc đang phát!', ephemeral: true });
                serverQueue.songs = [];
                serverQueue.player.stop();
                serverQueue.connection.destroy();
                queue.delete(interaction.guild.id);
                return interaction.reply('Đã dừng phát nhạc và xóa hàng đợi.');
            } else if (commandName === 'queue') {
                if (!serverQueue) return interaction.reply({ content: 'Hàng đợi đang trống!', ephemeral: true });
                const queueEmbed = new EmbedBuilder().setColor('Blue').setTitle('🎶 Hàng đợi bài hát').setDescription(`**Đang phát:** [${serverQueue.songs[0].title}](${serverQueue.songs[0].url})\n\n` + (serverQueue.songs.slice(1).map((song, index) => `**${index + 1}.** [${song.title}](${song.url})`).join('\n') || 'Không có bài hát nào tiếp theo.')).setFooter({ text: `Tổng cộng ${serverQueue.songs.length} bài hát.` });
                return interaction.reply({ embeds: [queueEmbed] });
            } else if (commandName === 'pause') {
                if (!serverQueue || !serverQueue.playing) return interaction.reply({ content: 'Không có nhạc đang phát hoặc đã tạm dừng rồi!', ephemeral: true });
                serverQueue.player.pause();
                serverQueue.playing = false;
                return interaction.reply('⏸️ Đã tạm dừng nhạc.');
            } else if (commandName === 'resume') {
                if (!serverQueue || serverQueue.playing) return interaction.reply({ content: 'Không có gì để tiếp tục hoặc nhạc vẫn đang phát!', ephemeral: true });
                serverQueue.player.unpause();
                serverQueue.playing = true;
                return interaction.reply('▶️ Đã tiếp tục phát nhạc.');
            } else if (commandName === 'nowplaying') {
                if (!serverQueue) return interaction.reply({ content: 'Không có bài hát nào đang phát!', ephemeral: true });
                const song = serverQueue.songs[0];
                const nowPlayingEmbed = new EmbedBuilder().setColor('Green').setTitle('🎵 Đang phát').setDescription(`**[${song.title}](${song.url})**`).setThumbnail(song.thumbnail).addFields({ name: 'Thời lượng', value: song.duration, inline: true }, { name: 'Yêu cầu bởi', value: song.requestedBy.toString(), inline: true }).setTimestamp();
                return interaction.reply({ embeds: [nowPlayingEmbed] });
            } else if (commandName === 'loop') {
                if (!serverQueue) return interaction.reply({ content: 'Không có gì để lặp lại!', ephemeral: true });
                const mode = interaction.options.getString('chế_độ');
                serverQueue.loop = mode;
                let modeText = mode === 'off' ? 'Tắt lặp lại' : (mode === 'song' ? 'Lặp lại bài hát hiện tại' : 'Lặp lại toàn bộ hàng đợi');
                return interaction.reply(`🔁 Đã đặt chế độ lặp thành: **${modeText}**.`);
            }
            return;
        }

        if (commandName === 'info') {
            await interaction.deferReply();
            const subcommand = interaction.options.getSubcommand();
            if (subcommand === 'user') {
                const user = interaction.options.getUser('user');
                const member = interaction.guild.members.cache.get(user.id);
                const userEmbed = new EmbedBuilder().setColor('#0099ff').setTitle(`Thông tin về ${user.username}`).setThumbnail(user.displayAvatarURL({ dynamic: true })).addFields({ name: '👤 Tên người dùng', value: user.tag, inline: true }, { name: '🆔 ID', value: user.id, inline: true }, { name: '🤖 Có phải là bot?', value: user.bot ? 'Đúng' : 'Không', inline: true }, { name: '📅 Ngày tạo tài khoản', value: `<t:${parseInt(user.createdAt / 1000)}:F>`, inline: false }).setTimestamp();
                if (member) {
                    userEmbed.addFields({ name: 'Nicknames', value: member.nickname || 'Không có', inline: true }, { name: '🫂 Ngày tham gia server', value: `<t:${parseInt(member.joinedAt / 1000)}:F>`, inline: false }, { name: '🎨 Vai trò cao nhất', value: member.roles.highest.toString(), inline: true },);
                }
                await interaction.followUp({ embeds: [userEmbed] });
            } else if (subcommand === 'server') {
                const { guild } = interaction;
                await guild.members.fetch();
                const owner = await guild.fetchOwner();
                const serverEmbed = new EmbedBuilder().setColor('#0099ff').setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) }).setThumbnail(guild.iconURL({ dynamic: true })).addFields({ name: '👑 Chủ Server', value: owner.user.tag, inline: true }, { name: '📅 Ngày thành lập', value: `<t:${parseInt(guild.createdAt / 1000)}:F>`, inline: true }, { name: '🆔 Server ID', value: guild.id, inline: true }, { name: '👥 Thành viên', value: `Tổng: **${guild.memberCount}**\n👤 Con người: **${guild.members.cache.filter(member => !member.user.bot).size}**\n🤖 Bot: **${guild.members.cache.filter(member => member.user.bot).size}**`, inline: true }, { name: '🎨 Roles', value: `**${guild.roles.cache.size}** roles`, inline: true }, { name: '🙂 Emojis & 💥 Stickers', value: `🙂 **${guild.emojis.cache.size}** emojis\n💥 **${guild.stickers.cache.size}** stickers`, inline: true }).setTimestamp().setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });
                await interaction.followUp({ embeds: [serverEmbed] });
            }
        }
        else if (commandName === 'ping') {
            await interaction.deferReply();
            const botLatency = Date.now() - interaction.createdTimestamp;
            const apiLatency = client.ws.ping;
            const pingEmbed = new EmbedBuilder().setColor('Green').setTitle('🏓 Pong!').addFields({ name: '🤖 Độ trễ Bot', value: `**${botLatency}ms**`, inline: true }, { name: '🌐 Độ trễ API', value: `**${apiLatency}ms**`, inline: true }).setTimestamp().setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });
            await interaction.followUp({ embeds: [pingEmbed] });
        }
        else if (commandName === 'hi1') {
            await interaction.deferReply();
            const targetUser = interaction.options.getUser('người');
            const greetings = [
                `Hellu ${targetUser}, chúc bạn một ngày tốt lành! <:reaction_role_1876:1410282620738339040>`,
                `Helo ${targetUser}! Chúc bạn có nhìu niềm zui`,
                `${targetUser}. Chúc con vợ có nhiều niềm zui <a:emoji_12022:1410282605042995230>`,
                `Hiluu ${targetUser}, chúc bạn một ngày mới an lành <:HeheCat:1412640800877187114>`,
                `Chào ${targetUser}, chúc các bạn một ngày vui <:15597073609823thumbnail:1412641080616419418>`
            ];
            const randomMessage = greetings[Math.floor(Math.random() * greetings.length)];
            await interaction.followUp(randomMessage);
        }
        else if (commandName === 'hi2') {
            await interaction.deferReply(); 
            const targetUser = interaction.options.getUser('người');
            const chonBuoi = interaction.options.getString('chon_buoi');
            const loiChucTuyY = interaction.options.getString('loi_chuc');
            let loiChuc;
            if (loiChucTuyY) {
                loiChuc = `Hii ${targetUser}, ${loiChucTuyY}`;
            } else if (chonBuoi) {
                if (chonBuoi === 'sáng') { loiChuc = `Chào buổi sáng, ${targetUser}! Chúc bạn một ngày mới tràn đầy năng lượng! ☀️`; }
                else if (chonBuoi === 'trưa') { loiChuc = `Buổi trưa vui vẻ nhé, ${targetUser}! Nhớ ăn uống đầy đủ nha. 🕛`; }
                else if (chonBuoi === 'chiều') { loiChuc = `Chúc ${targetUser} một buổi chiều làm việc hiệu quả! 🌇`; }
                else if (chonBuoi === 'tối') { loiChuc = `Buổi tối tốt lành và ngủ thật ngon nhé, ${targetUser}! 🌙`; }
            } else {
                loiChuc = `Hii ${targetUser}, chúc bạn một ngày tốt lành! 💕`;
            }
            await interaction.followUp(loiChuc); 
        }
        else if (commandName === 'time') { 
            await interaction.deferReply(); 
            const timeZone = interaction.options.getString('quoc_gia') || 'Asia/Ho_Chi_Minh'; 
            const choiceName = interaction.options.getString('quoc_gia') ? commands.find(c => c.name === 'time').options[0].choices.find(ch => ch.value === timeZone).name : '🇻🇳 Việt Nam'; 
            const now = new Date(); 
            const timeParts = new Intl.DateTimeFormat('en-GB', { timeZone: timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now); 
            const hour = timeParts.find(part => part.type === 'hour').value; 
            const minute = timeParts.find(part => part.type === 'minute').value; 
            const dateParts = new Intl.DateTimeFormat('vi-VN', { timeZone: timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(now); 
            const dateTimeString = `${hour}:${minute} ${dateParts}`; 
            await interaction.followUp(`Tại ${choiceName}, bây giờ là: ${dateTimeString} 🕒`); 
        }
        else if (commandName === 'feedback') { 
            const targetChannel = interaction.options.getChannel('kênh'); 
            const feedbackChannelId = targetChannel ? targetChannel.id : DEFAULT_FEEDBACK_CHANNEL_ID; 
            const modal = new ModalBuilder().setCustomId(`feedbackModal_${feedbackChannelId}`).setTitle('Gửi phản hồi cho Phúc'); 
            const tieuDeInput = new TextInputBuilder().setCustomId('tieuDeInput').setLabel("Tên của bạn ?").setStyle(TextInputStyle.Short).setPlaceholder('Ghi ở đây !').setRequired(true); 
            const noiDungInput = new TextInputBuilder().setCustomId('noiDungInput').setLabel("Nội dung").setStyle(TextInputStyle.Paragraph).setPlaceholder('Bạn muốn nói điều gì ? Hãy ghi ở đây !').setRequired(true); 
            const danhGiaInput = new TextInputBuilder().setCustomId('danhGiaInput').setLabel("Đánh giá của bạn (Tốt, Cần cải thiện..)").setStyle(TextInputStyle.Short).setPlaceholder('Ghi ở đây !').setRequired(false); 
            modal.addComponents(new ActionRowBuilder().addComponents(tieuDeInput), new ActionRowBuilder().addComponents(noiDungInput), new ActionRowBuilder().addComponents(danhGiaInput)); 
            await interaction.showModal(modal); 
        }
        else if (commandName === 'avatar') {
            await interaction.deferReply();
            const user = interaction.options.getUser('người') || interaction.user;
            const avatarEmbed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`Avatar của ${user.username}`)
                .setImage(user.displayAvatarURL({ dynamic: true, size: 4096 }))
                .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });
            await interaction.followUp({ embeds: [avatarEmbed] });
        }
        else if (commandName === 'poll') {
            await interaction.deferReply({ ephemeral: true });
            const question = interaction.options.getString('câu_hỏi');
            const optionsStr = interaction.options.getString('lựa_chọn');
            const options = optionsStr.split(',').map(opt => opt.trim());

            if (options.length < 2 || options.length > 10) {
                return interaction.followUp({ content: 'Vui lòng cung cấp từ 2 đến 10 lựa chọn, cách nhau bởi dấu phẩy.' });
            }
            
            const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            const description = options.map((opt, index) => `${numberEmojis[index]} ${opt}`).join('\n\n');

            const pollEmbed = new EmbedBuilder()
                .setColor('Aqua')
                .setAuthor({ name: `Bình chọn được tạo bởi ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                .setTitle(`📊 ${question}`)
                .setDescription(description)
                .setTimestamp();
            
            try {
                const pollMessage = await interaction.channel.send({ embeds: [pollEmbed] });
                for (let i = 0; i < options.length; i++) {
                    await pollMessage.react(numberEmojis[i]);
                }
                await interaction.followUp({ content: 'Đã tạo bình chọn thành công!' });
            } catch (error) {
                console.error("Lỗi khi tạo poll:", error);
                await interaction.followUp({ content: 'Đã xảy ra lỗi khi tạo bình chọn.' });
            }
        }
        else if (commandName === 'announce') {
            await interaction.deferReply({ ephemeral: true });
            const channel = interaction.options.getChannel('kênh');
            const content = interaction.options.getString('nội_dung').replace(/\\n/g, '\n');
            const title = interaction.options.getString('tiêu_đề');
            const color = interaction.options.getString('màu');

            const announceEmbed = new EmbedBuilder()
                .setDescription(content)
                .setTimestamp()
                .setAuthor({ name: `Thông báo từ ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

            if (title) announceEmbed.setTitle(title);
            if (color) announceEmbed.setColor(color);

            try {
                await channel.send({ embeds: [announceEmbed] });
                await interaction.followUp({ content: `Đã gửi thông báo tới kênh ${channel} thành công.` });
            } catch (error) {
                console.error("Lỗi khi gửi thông báo:", error);
                await interaction.followUp({ content: 'Đã có lỗi xảy ra. Vui lòng kiểm tra lại quyền của bot trong kênh đó.' });
            }
        }
        else if (commandName === 'clear') {
            await interaction.deferReply({ ephemeral: true });
            const amount = interaction.options.getInteger('số_lượng');

            try {
                const fetched = await interaction.channel.messages.fetch({ limit: amount });
                const deletedMessages = await interaction.channel.bulkDelete(fetched, true);
                await interaction.followUp({ content: `✅ Đã xóa thành công ${deletedMessages.size} tin nhắn.` });
            } catch (error) {
                console.error("Lỗi khi xóa tin nhắn:", error);
                await interaction.followUp({ content: 'Đã có lỗi xảy ra. Vui lòng kiểm tra lại quyền của bot.' });
            }
        }
        else if (commandName === 'kick' || commandName === 'ban') { 
            await interaction.deferReply(); 
            const target = interaction.options.getMember('người'); 
            const reason = interaction.options.getString('reason') ?? 'Không có lý do được cung cấp.'; 
            if (!target) return interaction.followUp({ content: 'Không tìm thấy thành viên này.', ephemeral: true }); 
            if (target.id === interaction.user.id) return interaction.followUp({ content: 'Bạn không thể tự thực hiện hành động này lên chính mình!', ephemeral: true }); 
            if (target.roles.highest.position >= interaction.member.roles.highest.position) return interaction.followUp({ content: 'Bạn không thể thực hiện hành động lên người có vai trò cao hơn hoặc bằng bạn.', ephemeral: true }); 
            const action = commandName === 'kick' ? 'kick' : 'ban'; 
            const actionVerb = commandName === 'kick' ? 'Kick' : 'Ban'; 
            const color = commandName === 'kick' ? 'Orange' : 'Red'; 
            if (!target[action + 'able']) return interaction.followUp({ content: `Tôi không có quyền để ${action} thành viên này.`, ephemeral: true }); 
            try { 
                await target[action]({ reason }); 
                const embed = new EmbedBuilder().setColor(color).setTitle(`${actionVerb} thành công`).setDescription(`**${target.user.tag}** đã bị ${action}.`).addFields({ name: 'Lý do', value: reason }).setTimestamp(); 
                await interaction.followUp({ embeds: [embed] }); 
            } catch (error) { 
                console.error(error); 
                await interaction.followUp({ content: `Đã xảy ra lỗi khi đang cố ${action} thành viên.`, ephemeral: true }); 
            } 
        }
        else if (commandName === 'unban') {
            await interaction.deferReply(); 
            const userId = interaction.options.getString('userid');
            try {
                await interaction.guild.members.unban(userId);
                const embed = new EmbedBuilder().setColor('Green').setTitle('Unban thành công').setDescription(`Đã gỡ ban cho người dùng có ID: **${userId}**.`);
                await interaction.followUp({ embeds: [embed] }); 
            } catch (error) {
                console.error(error);
                await interaction.followUp({ content: 'Đã xảy ra lỗi. Vui lòng kiểm tra lại ID hoặc có thể người dùng này không bị ban.', ephemeral: true }); 
            }
        }
        else if (commandName === 'timeout') { 
            await interaction.deferReply(); 
            const target = interaction.options.getMember('người'); 
            const durationStr = interaction.options.getString('time'); 
            const reason = interaction.options.getString('reason') ?? 'Không có lý do.'; 
            if (!target) return interaction.followUp({ content: 'Không tìm thấy thành viên.', ephemeral: true }); 
            if (target.id === interaction.user.id) return interaction.followUp({ content: 'Bạn không thể tự timeout mình!', ephemeral: true }); 
            if (target.permissions.has(PermissionFlagsBits.Administrator)) return interaction.followUp({ content: 'Bạn không thể timeout một Quản trị viên!', ephemeral: true }); 
            if (target.roles.highest.position >= interaction.member.roles.highest.position) { return interaction.followUp({ content: 'Bạn không thể timeout người có vai trò cao hơn hoặc bằng bạn.', ephemeral: true }); } 
            if (!target.moderatable) { return interaction.followUp({ content: 'Tôi không có quyền để timeout thành viên này. Vui lòng kiểm tra lại vai trò của tôi.', ephemeral: true }); } 
            const durationMs = ms(durationStr); if (!durationMs || durationMs > ms('28d')) return interaction.followUp({ content: 'Thời gian không hợp lệ. Vui lòng dùng định dạng như "10m", "1h", "2d" và không quá 28 ngày.', ephemeral: true }); 
            try { 
                await target.timeout(durationMs, reason); 
                const embed = new EmbedBuilder().setColor('Yellow').setTitle('Timeout thành công').setDescription(`**${target.user.tag}** đã bị timeout.`).addFields({ name: 'Thời gian', value: durationStr }, { name: 'Lý do', value: reason }).setTimestamp(); 
                await interaction.followUp({ embeds: [embed] }); 
            } catch (error) { 
                console.error(error); 
                await interaction.followUp({ content: 'Đã xảy ra lỗi khi đang cố timeout thành viên.', ephemeral: true }); 
            } 
        }
        else if (commandName === 'untimeout') {
            await interaction.deferReply(); 
            const target = interaction.options.getMember('người');
            if (!target) return interaction.followUp({ content: 'Không tìm thấy thành viên.', ephemeral: true }); 
            if (target.id === interaction.user.id) return interaction.followUp({ content: 'Bạn không thể tự gỡ timeout cho mình!', ephemeral: true }); 
            if (target.roles.highest.position >= interaction.member.roles.highest.position) {
                return interaction.followUp({ content: 'Bạn không thể gỡ timeout cho người có vai trò cao hơn hoặc bằng bạn.', ephemeral: true }); 
            }
            if (!target.moderatable) {
                return interaction.followUp({ content: 'Tôi không có quyền để quản lý thành viên này.', ephemeral: true }); 
            }
            if (!target.isCommunicationDisabled()) {
                return interaction.followUp({ content: 'Thành viên này không đang bị timeout.', ephemeral: true }); 
            }
            try {
                await target.timeout(null);
                const embed = new EmbedBuilder().setColor('Green').setTitle('Gỡ Timeout thành công').setDescription(`Đã gỡ timeout cho **${target.user.tag}**.`);
                await interaction.followUp({ embeds: [embed] }); 
            } catch (error) {
                console.error(error);
                await interaction.followUp({ content: 'Đã xảy ra lỗi khi đang cố gỡ timeout.', ephemeral: true }); 
            }
        }
        else if (commandName === 'rename') { 
            await interaction.deferReply(); 
            const target = interaction.options.getMember('người'); 
            const nickname = interaction.options.getString('nickname'); 
            if (!target) return interaction.followUp({ content: 'Không tìm thấy thành viên.', ephemeral: true }); 
            if (target.roles.highest.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) return interaction.followUp({ content: 'Bạn không thể đổi tên người có vai trò cao hơn hoặc bằng bạn.', ephemeral: true }); 
            try { 
                const oldNickname = target.displayName; 
                await target.setNickname(nickname); 
                const embed = new EmbedBuilder().setColor('Blue').setTitle('Đổi tên thành công').setDescription(`Đã đổi nickname của **${target.user.tag}** từ \`${oldNickname}\` thành \`${nickname}\`.`); 
                await interaction.followUp({ embeds: [embed] }); 
            } catch (error) { 
                console.error(error); 
                await interaction.followUp({ content: 'Đã xảy ra lỗi khi đang cố đổi tên thành viên. Có thể nickname quá dài hoặc tôi không có quyền.', ephemeral: true }); 
            } 
        }
        else if (commandName === 'move') { 
            await interaction.deferReply(); 
            const target = interaction.options.getMember('người'); 
            const channel = interaction.options.getChannel('channel'); 
            if (!target) return interaction.followUp({ content: 'Không tìm thấy thành viên.', ephemeral: true }); 
            if (!target.voice.channel) return interaction.followUp({ content: 'Thành viên này không ở trong kênh thoại nào.', ephemeral: true }); 
            try { 
                await target.voice.setChannel(channel); 
                const embed = new EmbedBuilder().setColor('Purple').setTitle('Di chuyển thành công').setDescription(`Đã di chuyển **${target.user.tag}** đến kênh thoại **${channel.name}**.`); 
                await interaction.followUp({ embeds: [embed] }); 
            } catch (error) { 
                console.error(error); 
                await interaction.followUp({ content: 'Đã xảy ra lỗi khi đang cố di chuyển thành viên. Vui lòng kiểm tra lại quyền của tôi.', ephemeral: true });
            } 
        }
        else if (commandName === 'roletemp') {
            await interaction.deferReply({ ephemeral: true });
            const target = interaction.options.getMember('người');
            const role = interaction.options.getRole('vai_trò');
            const durationStr = interaction.options.getString('thời_hạn');
            if (!target || !role) return interaction.followUp({ content: 'Không tìm thấy thành viên hoặc vai trò được chỉ định.' });
            if (role.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) return interaction.followUp({ content: 'Bạn không thể gán vai trò cao hơn hoặc bằng vai trò cao nhất của bạn.' });
            if (role.position >= interaction.guild.members.me.roles.highest.position) return interaction.followUp({ content: 'Tôi không thể quản lý vai trò này vì nó cao hơn hoặc bằng vai trò cao nhất của tôi.' });
            if (role.managed || role.id === interaction.guild.id) return interaction.followUp({ content: 'Tôi không thể gán vai trò này (do được quản lý bởi bot khác hoặc là vai trò @everyone).' });
            if (target.roles.cache.has(role.id)) return interaction.followUp({ content: 'Thành viên này đã có vai trò đó rồi.' });
            const durationMs = ms(durationStr);
            if (!durationMs || durationMs <= 0) return interaction.followUp({ content: 'Thời hạn không hợp lệ. Vui lòng sử dụng định dạng như "10m", "1h", "7d".' });
            const maxTimeoutDays = 24;
            const maxTimeoutMs = maxTimeoutDays * 24 * 60 * 60 * 1000;
            if (durationMs > maxTimeoutMs) return interaction.followUp({ content: `Thời hạn quá dài! Tôi chỉ có thể hẹn giờ gỡ vai trò trong tối đa ${maxTimeoutDays} ngày.` });
            const expiresAt = Date.now() + durationMs;
            try {
                await target.roles.add(role);
                db.prepare(`INSERT INTO temp_roles (userId, guildId, roleId, expiresAt) VALUES (?, ?, ?, ?)`).run(target.id, interaction.guild.id, role.id, expiresAt);
                setTimeout(() => removeTempRole(target.id, interaction.guild.id, role.id), durationMs);
                const embed = new EmbedBuilder().setColor('Green').setTitle('✅ Gán vai trò tạm thời thành công').setDescription(`Đã gán vai trò ${role} cho ${target} trong thời hạn **${durationStr}**. Dữ liệu đã được lưu.`).setTimestamp().setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` });
                await interaction.followUp({ embeds: [embed] });
            } catch (error) {
                console.error('Lỗi chi tiết khi gán vai trò tạm thời:', error); 
                await interaction.followUp({ content: `**Đã xảy ra lỗi khi cố gắng gán vai trò:**\n\`\`\`${error.message}\`\`\`\nĐây là lỗi từ phía Discord, hãy chắc chắn bot có đủ quyền và vai trò của bot cao hơn vai trò cần gán.` });
            }
        }
        else if (commandName === 'unroletemp') {
            await interaction.deferReply({ ephemeral: true });
            const target = interaction.options.getMember('người');
            const role = interaction.options.getRole('vai_trò');
            if (!target || !role) return interaction.followUp({ content: 'Không tìm thấy thành viên hoặc vai trò được chỉ định.' });
            if (!target.roles.cache.has(role.id)) return interaction.followUp({ content: 'Thành viên này không có vai trò đó.' });
            await removeTempRole(target.id, interaction.guild.id, role.id);
            const embed = new EmbedBuilder().setColor('Red').setTitle('✅ Gỡ vai trò tạm thời thành công').setDescription(`Đã gỡ vai trò ${role} khỏi ${target} ngay lập tức.`).setTimestamp().setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` });
            await interaction.followUp({ embeds: [embed] });
        }
        else if (commandName === 'ticketsetup') {
            await interaction.deferReply({ ephemeral: true });
            const tieuDe = interaction.options.getString('tieu_de');
            const moTa = interaction.options.getString('mo_ta').replace(/\\n/g, '\n');
            const content = interaction.options.getString('content');
            const hinhAnh = interaction.options.getString('hinh_anh');
            const bannerUrl = interaction.options.getString('anh_banner');
            const mauSac = interaction.options.getString('mau_sac');
            if (bannerUrl) {
                try {
                    await interaction.channel.send({ files: [bannerUrl] });
                } catch (error) {
                    console.error("Lỗi khi gửi ảnh banner", error);
                    await interaction.followUp({ content: '⚠️ Lỗi: Không thể gửi ảnh banner. Vui lòng kiểm tra lại URL.' });
                }
            }
            const ticketEmbed = new EmbedBuilder().setTitle(tieuDe).setDescription(moTa);
            if (mauSac) ticketEmbed.setColor(mauSac);
            if (hinhAnh) ticketEmbed.setImage(hinhAnh);
            const openButton = new ButtonBuilder().setCustomId('show_ticket_options').setLabel('Mở Ticket').setStyle(ButtonStyle.Danger).setEmoji('<:email49:1412322374891602020>');
            const row = new ActionRowBuilder().addComponents(openButton);
            const messagePayload = { embeds: [ticketEmbed], components: [row] };
            if (content) messagePayload.content = content;
            await interaction.channel.send(messagePayload);
            if (!bannerUrl) await interaction.followUp({ content: 'Đã cài đặt thành công bảng điều khiển ticket.' });
            else await interaction.editReply({ content: 'Đã cài đặt thành công bảng điều khiển ticket và banner.' });
        }
        else if (commandName === 'formsetup') {
            await interaction.deferReply({ ephemeral: true });
            const tieuDe = interaction.options.getString('tieu_de');
            const moTa = interaction.options.getString('mo_ta').replace(/\\n/g, '\n');
            const content = interaction.options.getString('content');
            const hinhAnh = interaction.options.getString('hinh_anh');
            const mauSac = interaction.options.getString('mau_sac');
            const kenhNhanForm = interaction.options.getChannel('kenh_nhan_form');
            const feedbackChannelId = kenhNhanForm ? kenhNhanForm.id : DEFAULT_FEEDBACK_CHANNEL_ID;
            const formEmbed = new EmbedBuilder().setTitle(tieuDe).setDescription(moTa);
            if (mauSac) formEmbed.setColor(mauSac);
            if (hinhAnh) formEmbed.setImage(hinhAnh);
            const openFormButton = new ButtonBuilder().setCustomId(`open_feedback_form_${feedbackChannelId}`).setLabel('Hỗ Trợ').setStyle(ButtonStyle.Danger).setEmoji('<:email49:1412322374891602020>');
            const row = new ActionRowBuilder().addComponents(openFormButton);
            const messagePayload = { embeds: [formEmbed], components: [row] };
            if (content) messagePayload.content = content;
            await interaction.channel.send(messagePayload);
            await interaction.followUp({ content: 'Đã cài đặt thành công bảng điều khiển form.' });
        }
        else if (commandName === 'warn') {
             await interaction.deferReply({ ephemeral: true });
             const target = interaction.options.getMember('người');
             const reason = interaction.options.getString('lý_do');
             const destination = interaction.options.getString('nơi_gửi');
             if (!target) return interaction.followUp({ content: 'Không tìm thấy thành viên này.' });
             if (target.id === interaction.user.id) return interaction.followUp({ content: 'Bạn không thể tự cảnh cáo chính mình!' });
             if (target.permissions.has(PermissionFlagsBits.Administrator)) return interaction.followUp({ content: 'Bạn không thể cảnh cáo một Quản trị viên!' });
             if (target.roles.highest.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) return interaction.followUp({ content: 'Bạn không thể cảnh cáo người có vai trò cao hơn hoặc bằng bạn.' });
             if (destination === 'dm') {
                 const warnEmbedDM = new EmbedBuilder().setColor('Yellow').setTitle('<:PridecordWarning:1412665674026717207> Bạn đã nhận một cảnh cáo').setDescription(`Bạn đã nhận một cảnh cáo trong server **${interaction.guild.name}**.`).addFields({ name: 'Người cảnh cáo', value: interaction.user.tag, inline: true }, { name: 'Lý do', value: reason }).setTimestamp().setFooter({ text: `Hãy tuân thủ nội quy của server.` });
                 try {
                     await target.send({ embeds: [warnEmbedDM] });
                     await interaction.followUp({ content: `✅ Đã gửi cảnh cáo đến ${target.user.tag} qua tin nhắn riêng.` });
                 } catch (error) {
                     console.error("Lỗi khi gửi DM cảnh cáo:", error);
                     await interaction.followUp({ content: `❌ Không thể gửi tin nhắn riêng cho người dùng này. Họ có thể đã chặn bot hoặc tắt tin nhắn riêng.` });
                 }
             } else {
                 const publicWarnEmbed = new EmbedBuilder().setColor('Yellow').setTitle('<:PridecordWarning:1412665674026717207> Thành viên đã bị cảnh cáo').addFields({ name: 'Người bị cảnh cáo', value: target.toString(), inline: true }, { name: 'Người thực hiện', value: interaction.user.toString(), inline: true }, { name: 'Lý do', value: reason }).setTimestamp();
                 await interaction.channel.send({ embeds: [publicWarnEmbed] });
                 await interaction.followUp({ content: '✅ Đã gửi cảnh cáo công khai trong kênh này.' });
             }
        }
        else if (commandName === 'resettickets') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Bạn không có quyền sử dụng lệnh này.', ephemeral: true });
            db.prepare(`UPDATE settings SET value = ? WHERE key = ?`).run('1', 'ticketCounter');
            await interaction.reply({ content: '✅ Đã reset số đếm ticket về lại 1 trong database.', ephemeral: true });
        }
        else if (commandName === 'warnings') {
            await interaction.deferReply();
            const target = interaction.options.getMember('người');
            if (!target) return interaction.followUp({ content: 'Không tìm thấy thành viên này.', ephemeral: true });
            const row = db.prepare('SELECT COUNT(*) as count FROM warnings WHERE userId = ? AND guildId = ?').get(target.id, interaction.guild.id);
            const warnCount = row ? row.count : 0;
            const embed = new EmbedBuilder().setColor('Blue').setDescription(`${target} hiện có **${warnCount}** cảnh cáo.`).setAuthor({ name: target.user.tag, iconURL: target.user.displayAvatarURL() });
            await interaction.followUp({ embeds: [embed] });
        }
        else if (commandName === 'resetwarnings') {
            await interaction.deferReply({ ephemeral: true });
            const target = interaction.options.getMember('người');
            if (!target) return interaction.followUp({ content: 'Không tìm thấy thành viên này.', ephemeral: true });
            db.prepare('DELETE FROM warnings WHERE userId = ? AND guildId = ?').run(target.id, interaction.guild.id);
            await interaction.followUp({ content: `✅ Đã xóa toàn bộ cảnh cáo cho ${target}.` });
        }
        else if (commandName === 'giveaway') {
            const subcommand = interaction.options.getSubcommand();
            if (subcommand === 'start') {
                await interaction.deferReply({ ephemeral: true });
                const durationStr = interaction.options.getString('duration');
                const winnerCount = interaction.options.getInteger('winners');
                const prize = interaction.options.getString('prize');
                const channel = interaction.options.getChannel('channel') || interaction.channel;
                const durationMs = ms(durationStr);
                if (!durationMs || durationMs <= 0) return interaction.followUp({ content: 'Thời gian không hợp lệ. Vui lòng dùng định dạng như "10m", "1h", "2d".' });
                const endsAt = Date.now() + durationMs;
                const giveawayEmbed = new EmbedBuilder().setColor('Aqua').setTitle('🎉 GIVEAWAY 🎉').setDescription(`**Giải thưởng:** ${prize}\n` + `**Số người thắng:** ${winnerCount}\n` + `**Kết thúc:** <t:${Math.floor(endsAt / 1000)}:R>\n` + `**Tổ chức bởi:** ${interaction.user}\n\n` + `React với 🎉 để tham gia!`).setTimestamp(endsAt).setFooter({ text: 'Giveaway sẽ kết thúc vào lúc' });
                try {
                    const message = await channel.send({ embeds: [giveawayEmbed] });
                    await message.react('🎉');
                    db.prepare('INSERT INTO giveaways (messageId, channelId, guildId, prize, winnerCount, endsAt, hostedBy) VALUES (?, ?, ?, ?, ?, ?, ?)')
                      .run(message.id, channel.id, guild.id, prize, winnerCount, endsAt, user.id);
                    setTimeout(() => endGiveaway(message.id), durationMs);
                    await interaction.followUp({ content: `✅ Đã bắt đầu giveaway tại kênh ${channel}!` });
                } catch (error) {
                    console.error('Lỗi khi bắt đầu giveaway:', error);
                    await interaction.followUp({ content: 'Đã có lỗi xảy ra. Vui lòng kiểm tra quyền của bot tại kênh đó.' });
                }
            }
            else if (subcommand === 'reroll') {
                await interaction.deferReply({ ephemeral: true });
                const messageId = interaction.options.getString('message_id');
                const giveaway = db.prepare('SELECT * FROM giveaways WHERE messageId = ? AND ended = 1').get(messageId);
                if (!giveaway) return interaction.followUp({ content: 'Không tìm thấy giveaway đã kết thúc với ID này.' });
                const channel = client.channels.cache.get(giveaway.channelId);
                if (!channel) return interaction.followUp({ content: 'Không tìm thấy kênh của giveaway.' });
                try {
                    const message = await channel.messages.fetch(messageId);
                    const reaction = message.reactions.cache.get('🎉');
                    if (!reaction) return interaction.followUp({ content: 'Không tìm thấy reaction trên tin nhắn giveaway.' });
                    const users = await reaction.users.fetch();
                    const oldWinnersString = message.embeds[0].description.split('Người thắng: ')[1];
                    const oldWinnerIds = oldWinnersString.match(/<@(\d+)>/g).map(tag => tag.slice(2, -1));
                    const participants = users.filter(u => !u.bot && !oldWinnerIds.includes(u.id)).map(u => u.id);
                    if (participants.length < giveaway.winnerCount) return interaction.followUp({ content: 'Không đủ người tham gia mới để chọn lại.' });
                    const newWinners = [];
                     for (let i = 0; i < giveaway.winnerCount; i++) {
                        if (participants.length === 0) break;
                        const winnerIndex = Math.floor(Math.random() * participants.length);
                        newWinners.push(participants.splice(winnerIndex, 1)[0]);
                    }
                    const newWinnerTags = newWinners.map(id => `<@${id}>`).join(', ');
                    await interaction.followUp({ content: `Đã chọn lại người thắng! Chúc mừng ${newWinnerTags}!` });
                    await channel.send(`🔄 Người thắng mới cho **${giveaway.prize}** là ${newWinnerTags}! Chúc mừng!`);
                } catch (error) {
                    console.error("Lỗi khi reroll giveaway:", error);
                    await interaction.followUp({ content: 'Đã xảy ra lỗi khi cố gắng reroll.' });
                }
            }
            else if (subcommand === 'end') {
                await interaction.deferReply({ ephemeral: true });
                const messageId = interaction.options.getString('message_id');
                const giveaway = db.prepare('SELECT * FROM giveaways WHERE messageId = ? AND ended = 0').get(messageId);
                if (!giveaway) return interaction.followUp({ content: 'Không tìm thấy giveaway đang hoạt động với ID này.' });
                const runningTimeout = client.timeouts.find(t => t._call.args[0] === messageId);
                if(runningTimeout) clearTimeout(runningTimeout);
                await endGiveaway(messageId);
                await interaction.followUp({ content: '✅ Đã kết thúc giveaway thành công.' });
            }
        }
        return;
    }
});

// ================================================================= //
// --- SỰ KIỆN: XỬ LÝ TIN NHẮN (CHỈ CÒN GAME NỐI TỪ) ---
// ================================================================= //
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // --- Logic game Nối Từ ---
    if (noituGames.has(message.channel.id)) {
        const game = noituGames.get(message.channel.id);
        const word = message.content.toLowerCase().trim();

        if (word.includes(' ')) return;
        
        if (message.author.id === game.lastPlayerId) {
            const reply = await message.reply('⚠️ Bạn vừa đi lượt trước rồi, hãy đợi người khác nhé!');
            setTimeout(() => reply.delete().catch(console.error), 5000);
            return;
        }

        const requiredLetter = game.lastWord.slice(-1);

        if (word.charAt(0) !== requiredLetter) {
            const reply = await message.reply(`❌ Sai chữ rồi! Từ tiếp theo phải bắt đầu bằng chữ **"${requiredLetter}"**.`);
            setTimeout(() => reply.delete().catch(console.error), 5000);
            await message.react('❌');
            return;
        }

        if (game.usedWords.has(word)) {
            const reply = await message.reply(`❌ Từ **"${word}"** đã được dùng rồi!`);
            setTimeout(() => reply.delete().catch(console.error), 5000);
            await message.react('❌');
            return;
        }

        await message.react('✅');
        
        game.lastWord = word;
        game.lastPlayerId = message.author.id;
        game.usedWords.add(word);
        
        const nextLetter = word.slice(-1);
        await message.channel.send(`Từ tiếp theo bắt đầu bằng chữ **"${nextLetter}"**.`);
        
        noituGames.set(message.channel.id, game);
        return; 
    }

    // --- TOÀN BỘ LOGIC AUTO-MOD ĐÃ BỊ XÓA KHỎI ĐÂY ---
});

// ================================================================= //
// --- SỰ KIỆN: QUẢN LÝ KÊNH THOẠI ---
// ================================================================= //
client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.member.user.bot && newState.id !== client.user.id) return;
    if (oldState.channelId && oldState.channel.members.size === 1 && oldState.channel.members.has(client.user.id)) {
        const serverQueue = queue.get(oldState.guild.id);
        if (serverQueue) {
            serverQueue.connection.destroy();
            queue.delete(oldState.guild.id);
            serverQueue.textChannel.send('Mọi người đã rời đi, tôi cũng đi đây. Hẹn gặp lại!');
        }
    }
});

// ================================================================= //
// --- SỰ KIỆN: THÀNH VIÊN MỚI THAM GIA SERVER ---
// ================================================================= //
client.on('guildMemberAdd', async member => {
    if (member.user.bot) return;
    
    // Gửi tin nhắn chào mừng
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (channel) {
        const welcomeImages = ['https://i.pinimg.com/originals/c2/ce/2d/c2ce2d82a11c90b05ad4abd796ef2fff.gif', 'https://giffiles.alphacoders.com/203/203432.gif', 'https://gifsec.com/wp-content/uploads/2022/09/welcome-gif-24.gif', 'https://i.pinimg.com/originals/8d/ac/4f/8dac4f8274a9ef0381d12b0ca30e1956.gif'];
        const randomImage = welcomeImages[Math.floor(Math.random() * welcomeImages.length)];
        const welcomeEmbed = new EmbedBuilder().setColor('#57F287').setTitle(`🎉 Chào mừng thành viên mới! 🎉`).setDescription(`Chào mừng bạn ${member} đã hạ cánh xuống học viện!\n\n` + `Đừng quên ghé qua **<#${CHAT_CHANNEL_ID}>** & **<#${SUPPORT_CHANNEL_ID}>**\n\n` + `**Hy vọng bạn sẽ có những giây phút vui vẻ và tuyệt vời tại đây. <a:emoji_12022:1410282605042995230>**`).setThumbnail(member.user.displayAvatarURL({ dynamic: true })).setImage(randomImage).setTimestamp().setFooter({ text: `Hiện tại server có ${member.guild.memberCount} thành viên.` });
        try {
            await channel.send({ embeds: [welcomeEmbed] });
        } catch (error) {
            console.error("Lỗi khi gửi tin nhắn chào mừng:", error);
        }
    }
    
    // Gửi thông báo vào kênh chat chung
    const generalChatChannel = member.guild.channels.cache.get(GENERAL_CHAT_CHANNEL_ID);
    if (generalChatChannel) {
        try {
            const generalChatEmbed = new EmbedBuilder().setColor('Blue').setAuthor({ name: `Chào mừng thành viên mới!`, iconURL: member.guild.iconURL() }).setThumbnail(member.user.displayAvatarURL({ dynamic: true })).setDescription(`<:2121announcementbadge:1413912152871272499> Thông báo từ phòng hiệu trưởng: Học sinh mới **${member}** đã gia nhập **${member.guild.name}**! Toàn trường chào đón bạn mới nào <a:rainbowjellydanc:1410282618338934958> \n <a:kurbuk:1410282805652492469> Và chúng ta hãy cùng nhau "cúp tiết", "trốn học", "nói chuyện riêng", "hóng drama", "chia sẻ chuyện thầm kín' <a:Devilcat:1410282696621424673>`).setTimestamp().setFooter({ text: `Hiện tại server có ${member.guild.memberCount} thành viên.` });
            await generalChatChannel.send({ content: `<@&${RECEPTIONIST_ROLE_ID}> ơi, có thành viên mới nè!`, embeds: [generalChatEmbed] });
        } catch (error) {
            console.error("Lỗi khi gửi tin nhắn embed vào kênh chat chung:", error);
        }
    }
});

// ================================================================= //
// --- SỰ KIỆN: THÀNH VIÊN RỜI KHỎI SERVER ---
// ================================================================= //
client.on('guildMemberRemove', async member => {
    if (member.user.bot) return;
    const channel = member.guild.channels.cache.get(GOODBYE_CHANNEL_ID);
    if (!channel) {
        console.log(`Lỗi: Không tìm thấy kênh tạm biệt với ID: ${GOODBYE_CHANNEL_ID}`);
        return;
    }
    try {
        const user = await client.users.fetch(member.id);
        const goodbyeEmbed = new EmbedBuilder().setColor('#FF474D').setTitle(`👋 Một thành viên đã rời đi`).setThumbnail(user.displayAvatarURL({ dynamic: true })).addFields({ name: 'Tên thành viên', value: user.tag, inline: true }, { name: 'ID', value: `\`${user.id}\``, inline: true }).setImage(GOODBYE_GIF_URL).setTimestamp().setFooter({ text: `Hiện tại server còn lại ${member.guild.memberCount} thành viên.` });
        await channel.send({ embeds: [goodbyeEmbed] });
    } catch (error) {
        console.error("Lỗi khi tạo hoặc gửi tin nhắn tạm biệt:", error);
        await channel.send(`Một thành viên với ID: \`${member.id}\` đã rời khỏi server.`).catch(e => console.error("Không thể gửi tin nhắn fallback.", e));
    }
});

// Đăng nhập bot
client.login(process.env.DISCORD_TOKEN);
