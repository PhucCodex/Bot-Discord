const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Bot đã sẵn sàng!');
});

app.listen(port, () => {
  console.log(`Server đang lắng nghe tại http://localhost:${port}`);
});

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, EmbedBuilder, ChannelType, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActivityType, StringSelectMenuBuilder, UserSelectMenuBuilder } = require('discord.js');
const ms = require('ms');
require('dotenv').config();

const Database = require('better-sqlite3');
const db = new Database('/data/data.db');

// --- CẤU HÌNH CHO AUTO-MOD ---
const MOD_LOG_CHANNEL_ID = '1413071939395653722';
const FORBIDDEN_WORDS = ['lồn', 'cặc', 'badword', 'ngu',];
const TIMEOUT_DURATION = '60m';

// ================================================================= //
// --- CẤU HÌNH CHO HỆ THỐNG LEVEL ---
// ================================================================= //
const XP_PER_MESSAGE = 10;
const XP_PER_MINUTE_IN_VOICE = 20;
const DAILY_REWARD = 500; // Lượng XP nhận được từ /daily
const MESSAGE_COOLDOWN_SECONDS = 60; // Chờ 60 giây giữa 2 tin nhắn để nhận XP

// ================================================================= //
// --- VAI TRÒ KHÔNG NHẬN XP ---
// ⚠️ THAY ID VAI TRÒ BẠN MUỐN CHẶN NHẬN XP VÀO ĐÂY
// Để trống ('') nếu bạn không muốn dùng tính năng này.
const NO_XP_ROLE_ID = 'YOUR_ROLE_ID_HERE'; 
// ================================================================= //


function setupDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS temp_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            guildId TEXT NOT NULL,
            roleId TEXT NOT NULL,
            expiresAt INTEGER NOT NULL
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS warnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            guildId TEXT NOT NULL,
            reason TEXT,
            timestamp INTEGER
        )
    `);
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_stats (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            guildId TEXT NOT NULL,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 0,
            lastDaily INTEGER DEFAULT 0,
            voiceJoinTimestamp INTEGER DEFAULT 0,
            UNIQUE(userId, guildId)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS giveaways (
            messageId TEXT PRIMARY KEY,
            channelId TEXT NOT NULL,
            guildId TEXT NOT NULL,
            prize TEXT NOT NULL,
            winnerCount INTEGER NOT NULL,
            endsAt INTEGER NOT NULL,
            hostedBy TEXT NOT NULL,
            ended INTEGER DEFAULT 0
        )
    `);

    // --- BỔ SUNG TABLE CHO TEMP VOICE ---
    db.exec(`
        CREATE TABLE IF NOT EXISTS tempvoice_settings (
            guildId TEXT PRIMARY KEY,
            creatorChannelId TEXT NOT NULL,
            categoryId TEXT NOT NULL
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS tempvoice_channels (
            channelId TEXT PRIMARY KEY,
            ownerId TEXT NOT NULL
        )
    `);

    const stmt = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
    stmt.run('ticketCounter', '1');

    console.log('✅ Database đã được thiết lập và sẵn sàng.');
}

setupDatabase();

// --- HỆ THỐNG LEVEL LŨY TIẾN MỚI ---
function calculateLevel(xp) {
    if (xp < 100) return 0;
    const level = Math.floor((-50 + Math.sqrt(2500 + 200 * xp)) / 100);
    return level;
}

function getUserStats(userId, guildId) {
    let user = db.prepare('SELECT * FROM user_stats WHERE userId = ? AND guildId = ?').get(userId, guildId);
    if (!user) {
        const id = `${userId}-${guildId}`;
        db.prepare('INSERT INTO user_stats (id, userId, guildId) VALUES (?, ?, ?)')
          .run(id, userId, guildId);
        user = { id, userId, guildId, xp: 0, level: 0, lastDaily: 0, voiceJoinTimestamp: 0 };
    }
    return user;
}

function updateUserXP(userId, guildId, newXp) {
    const newLevel = calculateLevel(newXp);
    db.prepare('UPDATE user_stats SET xp = ?, level = ? WHERE userId = ? AND guildId = ?')
      .run(newXp, newLevel, userId, guildId);
    return { newXp, newLevel };
}


const DEFAULT_FEEDBACK_CHANNEL_ID = '1128546415250198539';
const SUPPORT_ROLE_ID = '1412090993909563534';    
const WELCOME_CHANNEL_ID = '1406560267214524527';
const GOODBYE_CHANNEL_ID = '1406559808114393121';
const AUTO_ROLE_ID = '1406560015925514290';
const GOODBYE_GIF_URL = 'https://i.pinimg.com/originals/ec/c6/8e/ecc68e64677d55433d833ac1e6a713fd.gif'
const CHAT_CHANNEL_ID = '1408709235478368267';
const SUPPORT_CHANNEL_ID = '1412323492162174988';
const SUPPORT_TICKET_CATEGORY_ID = '1413009121606631456';
const ADMIN_TICKET_CATEGORY_ID = '1413009227156291634';

const commands = [
    new SlashCommandBuilder()
        .setName('info')
        .setDescription('Hiển thị thông tin người dùng hoặc server.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Hiển thị thông tin người dùng.')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Người bạn muốn xem thông tin')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('server')
                .setDescription('Hiển thị thông tin về server hiện tại.')
        ),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Kiểm tra độ trễ của bot'),

    new SlashCommandBuilder()
        .setName('hi1')
        .setDescription('Gửi lời chào thân thương đến một người đáng yêu.')
        .addUserOption(option =>
            option.setName('người')
                .setDescription('Người bạn muốn chào')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('hi2')
        .setDescription('Gửi lời chúc theo buổi tới một người dễ thương.')
        .addUserOption(option =>
            option.setName('người')
                .setDescription('Người bạn muốn chúc')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('chon_buoi')
                .setDescription('Chọn một buổi có sẵn trong ngày.')
                .setRequired(false)
                .addChoices(
                    { name: '☀️ Buổi Sáng', value: 'sáng' },
                    { name: '🕛 Buổi Trưa', value: 'trưa' },
                    { name: '🌇 Buổi Chiều', value: 'chiều' },
                    { name: '🌙 Buổi Tối', value: 'tối' }
                )
        )
        .addStringOption(option =>
            option.setName('loi_chuc')
                .setDescription('Hoặc tự nhập một lời chúc riêng.')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('time')
        .setDescription('Xem thời gian hiện tại ở các quốc gia')
        .addStringOption(option =>
            option.setName('quoc_gia')
                .setDescription('Chọn quốc gia muốn xem giờ.')
                .setRequired(false)
                .addChoices(
                    { name: '🇻🇳 Việt Nam', value: 'Asia/Ho_Chi_Minh' },
                    { name: '🇯🇵 Nhật Bản', value: 'Asia/Tokyo' },
                    { name: '🇹🇼 Đài Loan', value: 'Asia/Taipei' },
                    { name: '🇹🇭 Thái Lan', value: 'Asia/Bangkok' },
                    { name: '🇺🇸 Bờ Tây Hoa Kỳ (Los Angeles, San Francisco)', value: 'America/Los_Angeles' },
                    { name: '🇷🇺 Nga (Moscow)', value: 'Europe/Moscow' },
                    { name: '🇬🇧 Vương quốc Anh', value: 'Europe/London' }
                )
        ),

    new SlashCommandBuilder()
        .setName('feedback')
        .setDescription('Mở một form để gửi phản hồi trực tiếp.')
        .addChannelOption(option =>
            option.setName('kênh')
                .setDescription('Kênh để gửi phản hồi. Bỏ trống sẽ gửi đến kênh mặc định.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Xem ảnh đại diện của một người dùng.')
        .addUserOption(option => option.setName('người').setDescription('Người bạn muốn xem avatar').setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Tạo một cuộc bình chọn nhanh.')
        .addStringOption(option => option.setName('câu_hỏi').setDescription('Nội dung câu hỏi bình chọn.').setRequired(true))
        .addStringOption(option => option.setName('lựa_chọn').setDescription('Các lựa chọn, cách nhau bởi dấu phẩy (,). Tối đa 10.').setRequired(true)),

    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Gửi một thông báo dưới dạng embed tới một kênh.')
        .addChannelOption(option => option.setName('kênh').setDescription('Kênh để gửi thông báo.').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addStringOption(option => option.setName('nội_dung').setDescription('Nội dung thông báo. Dùng \\n để xuống dòng.').setRequired(true))
        .addStringOption(option => option.setName('tiêu_đề').setDescription('Tiêu đề của thông báo.'))
        .addStringOption(option => option.setName('màu').setDescription('Mã màu Hex cho embed (vd: #3498db).')),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Xóa một số lượng tin nhắn trong kênh hiện tại.')
        .addIntegerOption(option => option.setName('số_lượng').setDescription('Số tin nhắn cần xóa (từ 1 đến 100).').setRequired(true).setMinValue(1).setMaxValue(100))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick một thành viên khỏi server.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần kick').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Lý do kick'))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban một thành viên khỏi server.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần ban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Lý do ban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Gỡ ban cho một thành viên bằng ID.')
        .addStringOption(option => option.setName('userid').setDescription('ID của người dùng cần gỡ ban').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout một thành viên.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần timeout').setRequired(true))
        .addStringOption(option => option.setName('time').setDescription('Thời gian mute (vd: 10m, 1h, 2d)').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Lý do mute'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Gỡ timeout cho một thành viên.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần gỡ timeout').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('rename')
        .setDescription('Đổi nickname cho một thành viên.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần đổi tên').setRequired(true))
        .addStringOption(option => option.setName('nickname').setDescription('Nickname mới').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('move')
        .setDescription('Di chuyển một thành viên sang kênh thoại khác.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần di chuyển').setRequired(true))
        .addChannelOption(option => option.setName('channel').setDescription('Kênh thoại muốn chuyển đến').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('roletemp')
        .setDescription('Gán một vai trò tạm thời cho thành viên.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên bạn muốn gán vai trò.').setRequired(true))
        .addRoleOption(option => option.setName('vai_trò').setDescription('Vai trò bạn muốn gán.').setRequired(true))
        .addStringOption(option => option.setName('thời_hạn').setDescription('Thời hạn (ví dụ: 10m, 1h, 7d).').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('unroletemp')
        .setDescription('Gỡ một vai trò tạm thời khỏi thành viên ngay lập tức.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên bạn muốn gỡ vai trò.').setRequired(true))
        .addRoleOption(option => option.setName('vai_trò').setDescription('Vai trò bạn muốn gỡ.').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('ticketsetup')
        .setDescription('Cài đặt bảng điều khiển ticket có tùy chỉnh.')
        .addStringOption(option => option.setName('tieu_de').setDescription('Tiêu đề chính của bảng điều khiển.').setRequired(true))
        .addStringOption(option => option.setName('mo_ta').setDescription('Nội dung mô tả chi tiết. Dùng \\n để xuống dòng.').setRequired(true))
        .addStringOption(option => option.setName('content').setDescription('Nội dung tin nhắn riêng bên trên embed (để ping role, thêm emoji...).'))
        .addStringOption(option => option.setName('hinh_anh').setDescription('URL hình ảnh (ảnh bìa) của bảng điều khiển.'))
        .addStringOption(option => option.setName('anh_banner').setDescription('URL của hình ảnh lớn hiển thị phía trên embed.'))
        .addStringOption(option => option.setName('mau_sac').setDescription('Mã màu Hex cho đường viền (ví dụ: #FF5733).')),

    new SlashCommandBuilder()
        .setName('formsetup')
        .setDescription('Cài đặt bảng điều khiển để mở form feedback.')
        .addStringOption(option => option.setName('tieu_de').setDescription('Tiêu đề chính của bảng điều khiển.').setRequired(true))
        .addStringOption(option => option.setName('mo_ta').setDescription('Nội dung mô tả chi tiết. Dùng \\n để xuống dòng.').setRequired(true))
        .addStringOption(option => option.setName('content').setDescription('Nội dung tin nhắn riêng bên trên embed (để ping role, thêm emoji...).'))
        .addChannelOption(option => option.setName('kenh_nhan_form').setDescription('Kênh sẽ nhận kết quả form. Mặc định là kênh feedback chung.'))
        .addStringOption(option => option.setName('hinh_anh').setDescription('URL hình ảnh (ảnh bìa) của bảng điều khiển.'))
        .addStringOption(option => option.setName('mau_sac').setDescription('Mã màu Hex cho đường viền (ví dụ: #FF5733).')),
    
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Gửi cảnh cáo đến một thành viên.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần cảnh cáo').setRequired(true))
        .addStringOption(option => option.setName('lý_do').setDescription('Lý do cảnh cáo').setRequired(true))
        .addStringOption(option => option.setName('nơi_gửi')
            .setDescription('Chọn nơi gửi cảnh cáo.')
            .setRequired(true)
            .addChoices(
                { name: 'Gửi trong Server (Công khai)', value: 'server' },
                { name: 'Gửi qua Tin nhắn riêng (DM)', value: 'dm' }
            )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('resettickets')
        .setDescription('Reset số đếm của ticket về lại 1.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
    new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Kiểm tra số lần cảnh cáo của một thành viên.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần kiểm tra.').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('resetwarnings')
        .setDescription('Xóa toàn bộ cảnh cáo của một thành viên.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần xóa cảnh cáo.').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('level')
        .setDescription('Xem thông tin level của bạn hoặc người khác.')
        .addUserOption(option => option.setName('user').setDescription('Người bạn muốn xem level.')),

    new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Nhận phần thưởng XP hàng ngày.'),
    
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Xem bảng xếp hạng level của server.'),

    new SlashCommandBuilder()
        .setName('add-xp')
        .setDescription('[Admin] Cộng XP cho một thành viên.')
        .addUserOption(option => option.setName('user').setDescription('Thành viên cần cộng XP.').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Số XP cần cộng.').setRequired(true).setMinValue(1))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('remove-xp')
        .setDescription('[Admin] Trừ XP của một thành viên.')
        .addUserOption(option => option.setName('user').setDescription('Thành viên cần trừ XP.').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Số XP cần trừ.').setRequired(true).setMinValue(1))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('set-level')
        .setDescription('[Admin] Thiết lập level chính xác cho một thành viên.')
        .addUserOption(option => option.setName('user').setDescription('Thành viên cần set level.').setRequired(true))
        .addIntegerOption(option => option.setName('level').setDescription('Level muốn thiết lập.').setRequired(true).setMinValue(0))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Quản lý hệ thống giveaway.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Bắt đầu một giveaway mới.')
                .addStringOption(option => option.setName('duration').setDescription('Thời gian giveaway (vd: 1d, 12h, 30m)').setRequired(true))
                .addIntegerOption(option => option.setName('winners').setDescription('Số lượng người thắng.').setRequired(true).setMinValue(1))
                .addStringOption(option => option.setName('prize').setDescription('Giải thưởng là gì?').setRequired(true))
                .addChannelOption(option => option.setName('channel').setDescription('Kênh để tổ chức giveaway (mặc định là kênh hiện tại).').addChannelTypes(ChannelType.GuildText).setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reroll')
                .setDescription('Chọn lại một người thắng khác cho giveaway đã kết thúc.')
                .addStringOption(option => option.setName('message_id').setDescription('ID tin nhắn của giveaway đã kết thúc.').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('Kết thúc một giveaway ngay lập tức.')
                .addStringOption(option => option.setName('message_id').setDescription('ID tin nhắn của giveaway đang chạy.').setRequired(true))
        ),
    
    // --- BỔ SUNG LỆNH TEMP VOICE ---
    new SlashCommandBuilder()
        .setName('tempvoice')
        .setDescription('Quản lý hệ thống kênh thoại tạm thời.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Cài đặt hệ thống kênh thoại tạm thời.')
                .addChannelOption(option => 
                    option.setName('create_channel')
                        .setDescription('Chọn kênh thoại dùng để tạo kênh mới khi tham gia.')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true))
                .addChannelOption(option => 
                    option.setName('category')
                        .setDescription('Chọn danh mục để tạo các kênh thoại tạm thời trong đó.')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('control_panel_channel')
                        .setDescription('Chọn kênh văn bản để đặt bảng điều khiển.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
        ),

].map(command => {
    // Gán quyền mặc định cho các lệnh chưa có
    if (!command.default_member_permissions && command.name !== 'level' && command.name !== 'daily' && command.name !== 'leaderboard') {
         command.default_member_permissions = String(PermissionFlagsBits.Administrator);
    }
    return command.toJSON();
});


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

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions] });

// --- CÁC HÀM XỬ LÝ GIVEAWAY ---
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
            const endedEmbed = EmbedBuilder.from(message.embeds[0])
                .setColor('Red')
                .setDescription(`Không có ai tham gia, không thể chọn người thắng!`);
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

        const endedEmbed = EmbedBuilder.from(message.embeds[0])
            .setColor('Gold')
            .setDescription(`**Giveaway đã kết thúc!**\nNgười thắng: ${winnerTags}`);
        await message.edit({ embeds: [endedEmbed], components: [] });

        await channel.send(`🎉 Chúc mừng ${winnerTags}! Bạn đã thắng **${giveaway.prize}**! 🎉`);

    } catch (error) {
        console.error(`Lỗi khi kết thúc giveaway (ID: ${messageId}):`, error);
        channel.send(`Đã có lỗi khi cố gắng kết thúc giveaway cho **${giveaway.prize}**. Vui lòng kiểm tra lại tin nhắn gốc.`);
    }
}

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

client.once('ready', () => {
    console.log(`✅ Bot đã online! Tên bot: ${client.user.tag}`);

    client.user.setPresence({
        activities: [{
            name: '🌠 Sao Băng Rơi', 
            type: ActivityType.Watching 
        }],
        status: 'idle', 
    });

    restoreTempRoles();
    scheduleGiveawaysOnStartup();
});

client.on('interactionCreate', async interaction => {

    if (!interaction.guild) return;

    if (interaction.isChatInputCommand()) {
        const { commandName, user, guild } = interaction;

        if (commandName === 'info') {
             await interaction.deferReply();
             const subcommand = interaction.options.getSubcommand();
 
             if (subcommand === 'user') {
                 const user = interaction.options.getUser('user');
                 const member = interaction.guild.members.cache.get(user.id);
                 const userEmbed = new EmbedBuilder()
                     .setColor('#0099ff')
                     .setTitle(`Thông tin về ${user.username}`)
                     .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                     .addFields(
                         { name: '👤 Tên người dùng', value: user.tag, inline: true },
                         { name: '🆔 ID', value: user.id, inline: true },
                         { name: '🤖 Có phải là bot?', value: user.bot ? 'Đúng' : 'Không', inline: true },
                         { name: '📅 Ngày tạo tài khoản', value: `<t:${parseInt(user.createdAt / 1000)}:F>`, inline: false },
                     )
                     .setTimestamp();
 
                 if (member) {
                      userEmbed.addFields(
                         { name: 'Nicknames', value: member.nickname || 'Không có', inline: true },
                         { name: '🫂 Ngày tham gia server', value: `<t:${parseInt(member.joinedAt / 1000)}:F>`, inline: false },
                         { name: '🎨 Vai trò cao nhất', value: member.roles.highest.toString(), inline: true },
                      );
                 }
                 await interaction.followUp({ embeds: [userEmbed] });
 
             } else if (subcommand === 'server') {
                 const { guild } = interaction;
                 await guild.members.fetch();
                 const owner = await guild.fetchOwner();
 
                 const serverEmbed = new EmbedBuilder()
                     .setColor('#0099ff')
                     .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
                     .setThumbnail(guild.iconURL({ dynamic: true }))
                     .addFields(
                         { name: '👑 Chủ Server', value: owner.user.tag, inline: true },
                         { name: '📅 Ngày thành lập', value: `<t:${parseInt(guild.createdAt / 1000)}:F>`, inline: true },
                         { name: '🆔 Server ID', value: guild.id, inline: true },
                         { name: '👥 Thành viên', value: `Tổng: **${guild.memberCount}**\n👤 Con người: **${guild.members.cache.filter(member => !member.user.bot).size}**\n🤖 Bot: **${guild.members.cache.filter(member => member.user.bot).size}**`, inline: true },
                         { name: '🎨 Roles', value: `**${guild.roles.cache.size}** roles`, inline: true },
                         { name: '🙂 Emojis & 💥 Stickers', value: `🙂 **${guild.emojis.cache.size}** emojis\n💥 **${guild.stickers.cache.size}** stickers`, inline: true },
                     )
                     .setTimestamp()
                     .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) });
 
                 await interaction.followUp({ embeds: [serverEmbed] });
             }
        }
        else if (commandName === 'ping') {
            await interaction.deferReply();
            const botLatency = Date.now() - interaction.createdTimestamp;
            const apiLatency = client.ws.ping;
            const pingEmbed = new EmbedBuilder()
                .setColor('Green')
                .setTitle('🏓 Pong!')
                .addFields(
                    { name: '🤖 Độ trễ Bot', value: `**${botLatency}ms**`, inline: true },
                    { name: '🌐 Độ trễ API', value: `**${apiLatency}ms**`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });
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
            const firstActionRow = new ActionRowBuilder().addComponents(tieuDeInput); 
            const secondActionRow = new ActionRowBuilder().addComponents(noiDungInput); 
            const thirdActionRow = new ActionRowBuilder().addComponents(danhGiaInput); 
            modal.addComponents(firstActionRow, secondActionRow, thirdActionRow); 
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
                await interaction.followUp({ content: `Đã xảy ra lỗi khi đang cố timeout thành viên.`, ephemeral: true }); 
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
    
            if (!target || !role) {
                return interaction.followUp({ content: 'Không tìm thấy thành viên hoặc vai trò được chỉ định.' });
            }
            if (role.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
                return interaction.followUp({ content: 'Bạn không thể gán vai trò cao hơn hoặc bằng vai trò cao nhất của bạn.' });
            }
            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                return interaction.followUp({ content: 'Tôi không thể quản lý vai trò này vì nó cao hơn hoặc bằng vai trò cao nhất của tôi.' });
            }
            if (role.managed || role.id === interaction.guild.id) {
                return interaction.followUp({ content: 'Tôi không thể gán vai trò này (do được quản lý bởi bot khác hoặc là vai trò @everyone).' });
            }
            if (target.roles.cache.has(role.id)) {
                return interaction.followUp({ content: 'Thành viên này đã có vai trò đó rồi.' });
            }
    
            const durationMs = ms(durationStr);
            if (!durationMs || durationMs <= 0) {
                return interaction.followUp({ content: 'Thời hạn không hợp lệ. Vui lòng sử dụng định dạng như "10m", "1h", "7d".' });
            }
            
            const maxTimeoutDays = 24;
            const maxTimeoutMs = maxTimeoutDays * 24 * 60 * 60 * 1000;
            if (durationMs > maxTimeoutMs) {
                return interaction.followUp({ content: `Thời hạn quá dài! Tôi chỉ có thể hẹn giờ gỡ vai trò trong tối đa ${maxTimeoutDays} ngày.` });
            }
    
            const expiresAt = Date.now() + durationMs;

            try {
                await target.roles.add(role);

                const stmt = db.prepare(`INSERT INTO temp_roles (userId, guildId, roleId, expiresAt) VALUES (?, ?, ?, ?)`);
                stmt.run(target.id, interaction.guild.id, role.id, expiresAt);
                
                setTimeout(() => removeTempRole(target.id, interaction.guild.id, role.id), durationMs);

                const embed = new EmbedBuilder()
                    .setColor('Green')
                    .setTitle('✅ Gán vai trò tạm thời thành công')
                    .setDescription(`Đã gán vai trò ${role} cho ${target} trong thời hạn **${durationStr}**. Dữ liệu đã được lưu.`)
                    .setTimestamp()
                    .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` });
                
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
    
            if (!target || !role) {
                return interaction.followUp({ content: 'Không tìm thấy thành viên hoặc vai trò được chỉ định.' });
            }
            if (!target.roles.cache.has(role.id)) {
                return interaction.followUp({ content: 'Thành viên này không có vai trò đó.' });
            }
    
            await removeTempRole(target.id, interaction.guild.id, role.id);
            
            const embed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('✅ Gỡ vai trò tạm thời thành công')
                .setDescription(`Đã gỡ vai trò ${role} khỏi ${target} ngay lập tức.`)
                .setTimestamp()
                .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` });
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
                    await interaction.channel.send({
                        files: [bannerUrl]
                    });
                } catch (error) {
                    console.error("Lỗi khi gửi ảnh banner", error);
                    await interaction.followUp({ content: '⚠️ Lỗi: Không thể gửi ảnh banner. Vui lòng kiểm tra lại URL.' });
                }
            }

            const ticketEmbed = new EmbedBuilder()
                .setTitle(tieuDe)
                .setDescription(moTa);
                
            if (mauSac) ticketEmbed.setColor(mauSac);
            if (hinhAnh) ticketEmbed.setImage(hinhAnh);

            const openButton = new ButtonBuilder()
                .setCustomId('show_ticket_options')
                .setLabel('Mở Ticket 2.0')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Email37:1412322372790255636>');
            
            const row = new ActionRowBuilder().addComponents(openButton);

            const messagePayload = {
                embeds: [ticketEmbed],
                components: [row]
            };
            if (content) {
                messagePayload.content = content;
            }
            await interaction.channel.send(messagePayload);

            if (!bannerUrl){
                await interaction.followUp({ content: 'Đã cài đặt thành công bảng điều khiển ticket với chức năng chọn danh mục.' });
            } else {
                await interaction.editReply({ content: 'Đã cài đặt thành công bảng điều khiển ticket và banner.' });
            }
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
            
            const messagePayload = {
                embeds: [formEmbed],
                components: [row]
            };
            if (content) {
                messagePayload.content = content;
            }
            await interaction.channel.send(messagePayload);

            await interaction.followUp({ content: 'Đã cài đặt thành công bảng điều khiển form.' });
        }

        else if (commandName === 'warn') {
             await interaction.deferReply({ ephemeral: true });
    
             const target = interaction.options.getMember('người');
             const reason = interaction.options.getString('lý_do');
             const destination = interaction.options.getString('nơi_gửi');
     
             if (!target) {
                 return interaction.followUp({ content: 'Không tìm thấy thành viên này.' });
             }
             if (target.id === interaction.user.id) {
                 return interaction.followUp({ content: 'Bạn không thể tự cảnh cáo chính mình!' });
             }
             if (target.permissions.has(PermissionFlagsBits.Administrator)) {
                 return interaction.followUp({ content: 'Bạn không thể cảnh cáo một Quản trị viên!' });
             }
             if (target.roles.highest.position >= interaction.member.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
                 return interaction.followUp({ content: 'Bạn không thể cảnh cáo người có vai trò cao hơn hoặc bằng bạn.' });
             }
             
             if (destination === 'dm') {
                 const warnEmbedDM = new EmbedBuilder()
                     .setColor('Yellow')
                     .setTitle('<:PridecordWarning:1412665674026717207> Bạn đã nhận một cảnh cáo')
                     .setDescription(`Bạn đã nhận một cảnh cáo trong server **${interaction.guild.name}**.`)
                     .addFields(
                         { name: 'Người cảnh cáo', value: interaction.user.tag, inline: true },
                         { name: 'Lý do', value: reason }
                     )
                     .setTimestamp()
                     .setFooter({ text: `Hãy tuân thủ nội quy của server.` });
 
                 try {
                     await target.send({ embeds: [warnEmbedDM] });
                     await interaction.followUp({ content: `✅ Đã gửi cảnh cáo đến ${target.user.tag} qua tin nhắn riêng.` });
                 } catch (error) {
                     console.error("Lỗi khi gửi DM cảnh cáo:", error);
                     await interaction.followUp({ content: `❌ Không thể gửi tin nhắn riêng cho người dùng này. Họ có thể đã chặn bot hoặc tắt tin nhắn riêng.` });
                 }
             } else {
                 const publicWarnEmbed = new EmbedBuilder()
                     .setColor('Yellow')
                     .setTitle('<:PridecordWarning:1412665674026717207> Thành viên đã bị cảnh cáo')
                     .addFields(
                         { name: 'Người bị cảnh cáo', value: target.toString(), inline: true },
                         { name: 'Người thực hiện', value: interaction.user.toString(), inline: true },
                         { name: 'Lý do', value: reason }
                     )
                     .setTimestamp();
                 
                 await interaction.channel.send({ embeds: [publicWarnEmbed] });
                 await interaction.followUp({ content: '✅ Đã gửi cảnh cáo công khai trong kênh này.' });
             }
        }
        else if (commandName === 'resettickets') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: 'Bạn không có quyền sử dụng lệnh này.', ephemeral: true });
            }
            db.prepare(`UPDATE settings SET value = ? WHERE key = ?`).run('1', 'ticketCounter');
            await interaction.reply({ content: '✅ Đã reset số đếm ticket về lại 1 trong database.', ephemeral: true });
        }
        else if (commandName === 'warnings') {
            await interaction.deferReply();
            const target = interaction.options.getMember('người');
            if (!target) {
                return interaction.followUp({ content: 'Không tìm thấy thành viên này.', ephemeral: true });
            }

            const row = db.prepare('SELECT COUNT(*) as count FROM warnings WHERE userId = ? AND guildId = ?').get(target.id, interaction.guild.id);
            const warnCount = row ? row.count : 0;

            const embed = new EmbedBuilder()
                .setColor('Blue')
                .setDescription(`${target} hiện có **${warnCount}** cảnh cáo.`)
                .setAuthor({ name: target.user.tag, iconURL: target.user.displayAvatarURL() });

            await interaction.followUp({ embeds: [embed] });
        }
        else if (commandName === 'resetwarnings') {
            await interaction.deferReply({ ephemeral: true });
            const target = interaction.options.getMember('người');
            if (!target) {
                return interaction.followUp({ content: 'Không tìm thấy thành viên này.', ephemeral: true });
            }

            db.prepare('DELETE FROM warnings WHERE userId = ? AND guildId = ?').run(target.id, interaction.guild.id);

            await interaction.followUp({ content: `✅ Đã xóa toàn bộ cảnh cáo cho ${target}.` });
        }

        else if (commandName === 'level') {
            const targetUser = interaction.options.getUser('user') || user;
            const userData = getUserStats(targetUser.id, guild.id);

            // --- LOGIC LEVEL MỚI: TÍNH TOÁN DỰA TRÊN CÔNG THỨC LŨY TIẾN ---
            const currentLevel = userData.level;
            
            // Tổng XP cần để đạt được level hiện tại (mốc dưới)
            const xpForCurrentLevel = 50 * currentLevel * (currentLevel + 1);
            
            // Tổng XP cần để đạt được level tiếp theo (mốc trên)
            const xpForNextLevel = 50 * (currentLevel + 1) * (currentLevel + 2);

            // Lượng XP cần để lên cấp (sẽ tăng dần theo level)
            const neededProgress = xpForNextLevel - xpForCurrentLevel;
            
            // Lượng XP người dùng đã có trong level hiện tại
            const currentProgress = userData.xp - xpForCurrentLevel;
    
            const percentage = Math.max(0, Math.min(100, (currentProgress / neededProgress) * 100));
            const progressBar = '█'.repeat(Math.floor(percentage / 10)) + '─'.repeat(10 - Math.floor(percentage / 10));
            
            const rankEmbed = new EmbedBuilder()
                .setColor('Random')
                .setAuthor({ name: `Thông tin level của ${targetUser.username}`, iconURL: targetUser.displayAvatarURL() })
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '🌟 Level', value: `**${userData.level}**`, inline: true },
                    { name: '📈 Tổng XP', value: `**${userData.xp}**`, inline: true },
                    { name: '📊 Tiến trình', value: `\`${progressBar}\`\n**${currentProgress}** / **${neededProgress}** XP` }
                );
            await interaction.reply({ embeds: [rankEmbed] });
        }
    
        else if (commandName === 'daily') {
            if (interaction.member.roles.cache.has(NO_XP_ROLE_ID)) {
                return interaction.reply({ content: 'Bạn đang có vai trò không nhận XP nên không thể sử dụng lệnh này.', ephemeral: true });
            }
            const userData = getUserStats(user.id, guild.id);
            const cooldown = 24 * 60 * 60 * 1000;
            const timeSinceLastDaily = Date.now() - userData.lastDaily;
    
            if (timeSinceLastDaily < cooldown) {
                const timeLeft = cooldown - timeSinceLastDaily;
                return interaction.reply({ content: `Bạn cần chờ **${ms(timeLeft, { long: true })}** nữa để nhận thưởng daily.`, ephemeral: true });
            }
            
            const oldLevel = userData.level;
            const { newLevel } = updateUserXP(user.id, guild.id, userData.xp + DAILY_REWARD);
            db.prepare('UPDATE user_stats SET lastDaily = ? WHERE id = ?').run(Date.now(), `${user.id}-${guild.id}`);
    
            await interaction.reply(`🎉 Bạn đã nhận được **${DAILY_REWARD} XP** từ thưởng daily!`);
            if (newLevel > oldLevel) {
                await interaction.followUp(`🎉 Chúc mừng ${user}, bạn đã lên **Level ${newLevel}**!`);
            }
        }
    
        else if (commandName === 'leaderboard') {
            await interaction.deferReply();
            const topUsers = db.prepare('SELECT * FROM user_stats WHERE guildId = ? ORDER BY xp DESC LIMIT 10').all(guild.id);
    
            if (topUsers.length === 0) {
                return interaction.followUp('Chưa có ai trên bảng xếp hạng cả.');
            }
    
            const leaderboardDescription = await Promise.all(
                topUsers.map(async (u, index) => {
                    const member = await guild.members.fetch(u.userId).catch(() => null);
                    const username = member ? member.user.username : `*Người dùng đã rời đi*`;
                    return `**${index + 1}.** ${username} - **Level ${u.level}** (${u.xp} XP)`;
                })
            );
    
            const lbEmbed = new EmbedBuilder()
                .setTitle(`🏆 Bảng Xếp Hạng Level - ${guild.name}`)
                .setDescription(leaderboardDescription.join('\n'))
                .setColor('Gold');
            await interaction.followUp({ embeds: [lbEmbed] });
        }
        
        else if (commandName === 'add-xp') {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const userData = getUserStats(targetUser.id, guild.id);
            const finalXp = userData.xp + amount;
            const { newLevel } = updateUserXP(targetUser.id, guild.id, finalXp);
            await interaction.reply({ content: `✅ Đã cộng **${amount} XP** cho ${targetUser}. Họ hiện ở **Level ${newLevel}** với **${finalXp} XP**.`, ephemeral: true });
        }
    
        else if (commandName === 'remove-xp') {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const userData = getUserStats(targetUser.id, guild.id);
            const finalXp = Math.max(0, userData.xp - amount);
            const { newLevel } = updateUserXP(targetUser.id, guild.id, finalXp);
            await interaction.reply({ content: `✅ Đã trừ **${amount} XP** của ${targetUser}. Họ hiện ở **Level ${newLevel}** với **${finalXp} XP**.`, ephemeral: true });
        }
    
        else if (commandName === 'set-level') {
            const targetUser = interaction.options.getUser('user');
            const level = interaction.options.getInteger('level');
            const requiredXp = 50 * level * (level + 1);
            updateUserXP(targetUser.id, guild.id, requiredXp);
            await interaction.reply({ content: `✅ Đã thiết lập ${targetUser} thành **Level ${level}** với **${requiredXp} XP**.`, ephemeral: true });
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
                if (!durationMs || durationMs <= 0) {
                    return interaction.followUp({ content: 'Thời gian không hợp lệ. Vui lòng dùng định dạng như "10m", "1h", "2d".' });
                }

                const endsAt = Date.now() + durationMs;

                const giveawayEmbed = new EmbedBuilder()
                    .setColor('Aqua')
                    .setTitle('🎉 GIVEAWAY 🎉')
                    .setDescription(
                        `**Giải thưởng:** ${prize}\n` +
                        `**Số người thắng:** ${winnerCount}\n` +
                        `**Kết thúc:** <t:${Math.floor(endsAt / 1000)}:R>\n` +
                        `**Tổ chức bởi:** ${interaction.user}\n\n` +
                        `React với 🎉 để tham gia!`
                    )
                    .setTimestamp(endsAt)
                    .setFooter({ text: 'Giveaway sẽ kết thúc vào lúc' });

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

                if (!giveaway) {
                    return interaction.followUp({ content: 'Không tìm thấy giveaway đã kết thúc với ID này.' });
                }

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

                    if (participants.length < giveaway.winnerCount) {
                        return interaction.followUp({ content: 'Không đủ người tham gia mới để chọn lại.' });
                    }

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
                
                if (!giveaway) {
                    return interaction.followUp({ content: 'Không tìm thấy giveaway đang hoạt động với ID này.' });
                }

                // Hủy lịch hẹn cũ và kết thúc ngay
                const runningTimeout = client.timeouts.find(t => t._call.args[0] === messageId);
                if(runningTimeout) clearTimeout(runningTimeout);

                await endGiveaway(messageId);
                await interaction.followUp({ content: '✅ Đã kết thúc giveaway thành công.' });
            }
        }
        
        // --- HỆ THỐNG TEMP VOICE ---
        if (commandName === 'tempvoice') {
            const subcommand = interaction.options.getSubcommand();
            if (subcommand === 'setup') {
                await interaction.deferReply({ ephemeral: true });
                const creatorChannel = interaction.options.getChannel('create_channel');
                const category = interaction.options.getChannel('category');
                const panelChannel = interaction.options.getChannel('control_panel_channel');

                db.prepare('INSERT OR REPLACE INTO tempvoice_settings (guildId, creatorChannelId, categoryId, panelChannelId) VALUES (?, ?, ?, ?)')
                  .run(guild.id, creatorChannel.id, category.id, panelChannel.id);

                const embed = new EmbedBuilder()
                    .setColor('Purple')
                    .setTitle('TempVoice Interface')
                    .setDescription('Giao diện này có thể được sử dụng để quản lý các kênh thoại tạm thời.\n\nNhấn các nút bên dưới để sử dụng giao diện');
                
                // Hàng nút 1
                const row1 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId('tv_rename').setEmoji('✏️').setLabel('Tên').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('tv_limit').setEmoji('👥').setLabel('Giới Hạn').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('tv_privacy').setEmoji('🛡️').setLabel('Riêng Tư').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('tv_hide').setEmoji('👻').setLabel('Ẩn/Hiện').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('tv_topic').setEmoji('#️⃣').setLabel('Chủ Đề').setStyle(ButtonStyle.Secondary),
                    );
                // Hàng nút 2
                const row2 = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId('tv_trust').setEmoji('✅').setLabel('Tin Cậy').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('tv_untrust').setEmoji('❌').setLabel('Bỏ Tin Cậy').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('tv_invite').setEmoji('📲').setLabel('Mời').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('tv_kick').setEmoji('👋').setLabel('Đá').setStyle(ButtonStyle.Danger),
                        // Nút Region bị vô hiệu hóa vì API Discord không còn hỗ trợ
                        new ButtonBuilder().setCustomId('tv_region').setEmoji('🌍').setLabel('Khu Vực').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    );
                // Hàng nút 3
                const row3 = new ActionRowBuilder()
                    .addComponents(
                         new ButtonBuilder().setCustomId('tv_ban').setEmoji('🚫').setLabel('Chặn').setStyle(ButtonStyle.Danger),
                         new ButtonBuilder().setCustomId('tv_unban').setEmoji('🔰').setLabel('Bỏ Chặn').setStyle(ButtonStyle.Success),
                         new ButtonBuilder().setCustomId('tv_claim').setEmoji('👑').setLabel('Lấy Quyền').setStyle(ButtonStyle.Primary),
                         new ButtonBuilder().setCustomId('tv_transfer').setEmoji('🔀').setLabel('Chuyển Giao').setStyle(ButtonStyle.Primary),
                         new ButtonBuilder().setCustomId('tv_delete').setEmoji('🗑️').setLabel('Xóa').setStyle(ButtonStyle.Danger),
                    );

                await panelChannel.send({ embeds: [embed], components: [row1, row2, row3] });
                await interaction.followUp({ content: `✅ Đã cài đặt thành công hệ thống Temp Voice! Bảng điều khiển đã được gửi tới ${panelChannel}.` });
            }
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_ticket_category') {
            await interaction.deferReply({ ephemeral: true });

            const selectedValue = interaction.values[0];
            let categoryId;
            let ticketType;
            let welcomeMessage;
            let ticketContent;

            switch (selectedValue) {
                case 'technical_support':
                    categoryId = SUPPORT_TICKET_CATEGORY_ID;
                    ticketType = 'hỗ-trợ';
                    welcomeMessage = `Hỗ trợ bạn về vấn đề **Kỹ thuật/Chung**. Vui lòng trình bày chi tiết vấn đề bạn đang gặp phải.`;
                    ticketContent = `## **Chào ${interaction.user}, Phúc sẽ có mặt ngay để hỗ trợ**`
                    break;
                case 'admin_contact':
                    categoryId = ADMIN_TICKET_CATEGORY_ID;
                    ticketType = 'admin';
                    welcomeMessage = `**Cần alo ngay em Phúc**`;
                    ticketContent = `## **Chào ${interaction.user}, bạn cần hỗ trợ về vấn đề gì hoặc khiếu nại thì cứ ghi vào nhé**`
                    break;
                default:
                    return interaction.followUp({ content: 'Lựa chọn không hợp lệ.' });
            }

            let ticketCounter = parseInt(db.prepare(`SELECT value FROM settings WHERE key = ?`).get('ticketCounter').value);
            const ticketChannelName = `${ticketType}-${ticketCounter}`;

            try {
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

                ticketCounter++;
                db.prepare(`UPDATE settings SET value = ? WHERE key = ?`).run(ticketCounter.toString(), 'ticketCounter');

                const ticketWelcomeEmbed = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle(`Ticket ${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)}`)
                    .setDescription(`Chào ${interaction.user}, cảm ơn bạn đã liên hệ.\n\nĐội ngũ <@&${SUPPORT_ROLE_ID}> sẽ ${welcomeMessage}`)
                    .setTimestamp();
                const closeButton = new ButtonBuilder().setCustomId('close_ticket').setLabel('Đóng Ticket').setStyle(ButtonStyle.Danger).setEmoji('<:close51:1413054667021352960>');
                const row = new ActionRowBuilder().addComponents(closeButton);
                await ticketChannel.send({ content: ticketContent, embeds: [ticketWelcomeEmbed], components: [row] });

                await interaction.followUp({ content: `Đã tạo ticket của bạn tại ${ticketChannel}.` });

            } catch (error) {
                console.error("Lỗi khi tạo ticket theo danh mục:", error);
                await interaction.followUp({ content: 'Đã xảy ra lỗi. Vui lòng kiểm tra lại các ID Category đã khai báo và quyền của bot.' });
            }
        }
    }

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
        }
        
        if (interaction.customId.startsWith('tv_modal_')) {
            await interaction.deferReply({ ephemeral: true });
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) return interaction.followUp({ content: 'Bạn không còn ở trong kênh thoại.' });

            const action = interaction.customId.split('_')[2];
            
            switch(action) {
                case 'rename': {
                    const newName = interaction.fields.getTextInputValue('nameInput');
                    await voiceChannel.setName(newName);
                    await interaction.followUp({ content: `Đã đổi tên kênh thành **${newName}**.` });
                    break;
                }
                case 'limit': {
                    const newLimit = parseInt(interaction.fields.getTextInputValue('limitInput'));
                    if (isNaN(newLimit) || newLimit < 0 || newLimit > 99) {
                        return interaction.followUp({ content: 'Vui lòng nhập một số hợp lệ từ 0 đến 99.' });
                    }
                    await voiceChannel.setUserLimit(newLimit);
                    await interaction.followUp({ content: `Đã đặt giới hạn thành viên là **${newLimit === 0 ? 'Không giới hạn' : newLimit}**.` });
                    break;
                }
                case 'topic': {
                    const newTopic = interaction.fields.getTextInputValue('topicInput');
                    await voiceChannel.setStatus(newTopic);
                    await interaction.followUp({ content: `Đã đặt chủ đề kênh thành công.` });
                    break;
                }
            }
        }
    }
    
    if (interaction.isUserSelectMenu() && interaction.customId.startsWith('tv_select_')) {
        await interaction.deferUpdate();
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) return;
        
        const targetUser = interaction.users.first();
        const targetMember = interaction.guild.members.cache.get(targetUser.id);
        const action = interaction.customId.split('_')[2];
        
        switch(action) {
            case 'kick':
                if (targetMember && targetMember.voice.channelId === voiceChannel.id) {
                    await targetMember.voice.disconnect('Bị kick bởi chủ kênh');
                    await interaction.followUp({ content: `Đã kick ${targetUser} khỏi kênh.`, ephemeral: true });
                } else {
                    await interaction.followUp({ content: `${targetUser} không ở trong kênh của bạn.`, ephemeral: true });
                }
                break;
            case 'ban':
                await voiceChannel.permissionOverwrites.edit(targetUser.id, { Connect: false });
                if (targetMember && targetMember.voice.channelId === voiceChannel.id) {
                    await targetMember.voice.disconnect('Bị ban khỏi kênh');
                }
                await interaction.followUp({ content: `Đã chặn ${targetUser} vào kênh.`, ephemeral: true });
                break;
            case 'unban':
                await voiceChannel.permissionOverwrites.edit(targetUser.id, { Connect: null });
                await interaction.followUp({ content: `Đã bỏ chặn ${targetUser}.`, ephemeral: true });
                break;
            case 'trust':
                await voiceChannel.permissionOverwrites.edit(targetUser.id, { Connect: true });
                await interaction.followUp({ content: `${targetUser} giờ đây có thể vào kênh của bạn ngay cả khi bị khóa.`, ephemeral: true });
                break;
             case 'untrust':
                await voiceChannel.permissionOverwrites.delete(targetUser.id);
                await interaction.followUp({ content: `Đã xóa quyền đặc biệt của ${targetUser}.`, ephemeral: true });
                break;
            case 'transfer':
                db.prepare('UPDATE tempvoice_channels SET ownerId = ? WHERE channelId = ?').run(targetUser.id, voiceChannel.id);
                await voiceChannel.permissionOverwrites.edit(interaction.user.id, { ManageChannels: false, MoveMembers: false });
                await voiceChannel.permissionOverwrites.edit(targetUser.id, { ManageChannels: true, MoveMembers: true });
                await interaction.followUp({ content: `Đã chuyển giao quyền sở hữu kênh cho ${targetUser}.`, ephemeral: true });
                break;
            case 'invite':
                try {
                    const invite = await voiceChannel.createInvite({ maxAge: 3600, maxUses: 5, unique: true });
                     await interaction.followUp({ content: `Đây là link mời vào kênh của bạn (có hiệu lực 1 giờ): ${invite.url}`, ephemeral: true });
                } catch(e){
                     await interaction.followUp({ content: 'Không thể tạo link mời cho kênh này.', ephemeral: true });
                }
                break;
        }
        // Xóa tin nhắn chọn user sau khi thực hiện
        await interaction.deleteReply().catch(() => {});
    }

    if (interaction.isButton() && interaction.customId.startsWith('tv_')) {
        await interaction.deferUpdate().catch(() => {});
        
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.followUp({ content: 'Bạn phải đang ở trong một kênh thoại để sử dụng chức năng này.', ephemeral: true });
        }

        const tempChannelInfo = db.prepare('SELECT * FROM tempvoice_channels WHERE channelId = ?').get(voiceChannel.id);
        if (!tempChannelInfo) {
            return interaction.followUp({ content: 'Kênh thoại của bạn không phải là kênh tạm thời.', ephemeral: true });
        }
        
        if (tempChannelInfo.ownerId !== member.id && interaction.customId !== 'tv_claim') {
             return interaction.followUp({ content: 'Chỉ chủ kênh mới có thể sử dụng chức năng này.', ephemeral: true });
        }

        const action = interaction.customId.split('_')[1];

        switch(action) {
            case 'rename': {
                const modal = new ModalBuilder().setCustomId('tv_modal_rename').setTitle('Đổi tên kênh thoại');
                const nameInput = new TextInputBuilder().setCustomId('nameInput').setLabel("Tên kênh mới").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
                modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
                await interaction.showModal(modal);
                break;
            }
            case 'limit': {
                 const modal = new ModalBuilder().setCustomId('tv_modal_limit').setTitle('Đặt giới hạn thành viên');
                const limitInput = new TextInputBuilder().setCustomId('limitInput').setLabel("Số người giới hạn (0 = không giới hạn)").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(limitInput));
                await interaction.showModal(modal);
                break;
            }
            case 'topic': {
                const modal = new ModalBuilder().setCustomId('tv_modal_topic').setTitle('Đặt chủ đề kênh');
                const topicInput = new TextInputBuilder().setCustomId('topicInput').setLabel("Chủ đề mới (sẽ hiển thị dưới tên kênh)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100);
                modal.addComponents(new ActionRowBuilder().addComponents(topicInput));
                await interaction.showModal(modal);
                break;
            }
            case 'privacy': {
                const isLocked = voiceChannel.permissionOverwrites.cache.get(interaction.guild.id)?.deny.has(PermissionFlagsBits.Connect);
                await voiceChannel.permissionOverwrites.edit(interaction.guild.id, {
                    Connect: isLocked ? null : false 
                });
                await interaction.followUp({ content: `Đã **${isLocked ? 'mở khóa' : 'khóa'}** kênh.`, ephemeral: true });
                break;
            }
            case 'hide': {
                const isHidden = voiceChannel.permissionOverwrites.cache.get(interaction.guild.id)?.deny.has(PermissionFlagsBits.ViewChannel);
                 await voiceChannel.permissionOverwrites.edit(interaction.guild.id, {
                    ViewChannel: isHidden ? null : false
                });
                await interaction.followUp({ content: `Đã **${isHidden ? 'hiện' : 'ẩn'}** kênh.`, ephemeral: true });
                break;
            }
             case 'delete': {
                await voiceChannel.delete('Yêu cầu bởi chủ kênh').catch(console.error);
                break;
            }
            case 'claim': {
                const ownerMember = await interaction.guild.members.fetch(tempChannelInfo.ownerId).catch(() => null);
                if (!ownerMember || !ownerMember.voice.channel) {
                    db.prepare('UPDATE tempvoice_channels SET ownerId = ? WHERE channelId = ?').run(interaction.user.id, voiceChannel.id);
                    await voiceChannel.permissionOverwrites.edit(interaction.user.id, { ManageChannels: true, MoveMembers: true });
                    await voiceChannel.permissionOverwrites.delete(tempChannelInfo.ownerId).catch(() => {});
                    await interaction.followUp({ content: `Bạn đã nhận quyền sở hữu kênh này.`, ephemeral: true });
                } else {
                    await interaction.followUp({ content: `Không thể nhận quyền sở hữu khi chủ kênh vẫn còn trong phòng.`, ephemeral: true });
                }
                break;
            }
            case 'kick':
            case 'ban':
            case 'trust':
            case 'untrust':
            case 'unban':
            case 'invite':
            case 'transfer': {
                 const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`tv_select_${action}`)
                    .setPlaceholder(`Chọn thành viên để ${action}...`);
                const row = new ActionRowBuilder().addComponents(userSelect);
                await interaction.followUp({ content: 'Vui lòng chọn một thành viên:', components: [row], ephemeral: true });
                break;
            }
        }
    }
});


client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    if (NO_XP_ROLE_ID && message.member.roles.cache.has(NO_XP_ROLE_ID)) {
        return; 
    }

    if (!messageCooldown.has(message.author.id)) {
        const userStats = getUserStats(message.author.id, message.guild.id);
        const oldLevel = userStats.level;
        const { newLevel } = updateUserXP(userStats.userId, userStats.guildId, userStats.xp + XP_PER_MESSAGE);
        
        if (newLevel > oldLevel) {
            message.channel.send(`🎉 Chúc mừng ${message.author}, bạn đã lên **Level ${newLevel}**!`).catch(console.error);
        }
        
        messageCooldown.add(message.author.id);
        setTimeout(() => {
            messageCooldown.delete(message.author.id);
        }, MESSAGE_COOLDOWN_SECONDS * 1000);
    }
    
    if (message.member && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return;
    }

    const messageContent = message.content.toLowerCase();
    const hasForbiddenWord = FORBIDDEN_WORDS.some(word => messageContent.includes(word));

    if (hasForbiddenWord) {
        try {
            await message.delete();
        } catch (error) {
            console.error("Auto-Mod: Không thể xóa tin nhắn.", error);
        }

        const reason = 'Sử dụng ngôn từ không phù hợp (Tự động bởi Bot).';
        const timestamp = Date.now();
        
        try {
            const stmt = db.prepare('INSERT INTO warnings (userId, guildId, reason, timestamp) VALUES (?, ?, ?, ?)');
            stmt.run(message.author.id, message.guild.id, reason, timestamp);
        } catch (dbError) {
            console.error("Lỗi khi ghi cảnh cáo vào DB:", dbError);
            return;
        }
        
        const row = db.prepare('SELECT COUNT(*) as count FROM warnings WHERE userId = ? AND guildId = ?').get(message.author.id, message.guild.id);
        const warnCount = row ? row.count : 0;

        const logChannel = await message.guild.channels.fetch(MOD_LOG_CHANNEL_ID).catch(() => null);

        switch (warnCount) {
            case 1:
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor('Yellow')
                        .setTitle(`Cảnh cáo lần 1 tại ${message.guild.name}`)
                        .setDescription(`Bạn đã bị cảnh cáo vì lý do: **${reason}**.\n\nHãy tuân thủ nội quy của server.`)
                        .setTimestamp();
                    await message.author.send({ embeds: [dmEmbed] });
                } catch (error) {
                     console.log(`Không thể DM cảnh cáo cho ${message.author.tag}`);
                }

                const warningMessage = await message.channel.send(`${message.author}, bạn đã bị cảnh cáo lần 1 vì sử dụng ngôn từ không phù hợp. Vui lòng kiểm tra tin nhắn riêng để biết chi tiết.`);
                setTimeout(() => warningMessage.delete().catch(console.error), 10000);

                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('Yellow')
                        .setTitle('Auto-Mod: Cảnh Cáo')
                        .addFields(
                            { name: 'Thành viên', value: `${message.author} (${message.author.tag})`, inline: true },
                            { name: 'Hành động', value: 'Cảnh cáo (Lần 1)', inline: true },
                            { name: 'Tổng cảnh cáo', value: `${warnCount}`, inline: true },
                            { name: 'Lý do', value: reason }
                        )
                        .setTimestamp();
                    logChannel.send({ embeds: [logEmbed] });
                }
                break;
            case 2:
                try {
                    if (message.member.moderatable) {
                        const durationMs = ms(TIMEOUT_DURATION);
                        await message.member.timeout(durationMs, reason);

                        const dmEmbed = new EmbedBuilder()
                            .setColor('Orange')
                            .setTitle(`Bạn đã bị Timeout tại ${message.guild.name}`)
                            .setDescription(`Bạn đã bị timeout **${TIMEOUT_DURATION}** vì tái phạm.\n**Lý do:** ${reason}\n\n⚠️ **Đây là cảnh cáo lần 2. Vi phạm lần nữa sẽ dẫn đến bị Ban vĩnh viễn.**`)
                            .setTimestamp();
                        await message.author.send({ embeds: [dmEmbed] });

                        if (logChannel) {
                             const logEmbed = new EmbedBuilder()
                                .setColor('Orange')
                                .setTitle('Auto-Mod: Timeout')
                                .addFields(
                                    { name: 'Thành viên', value: `${message.author} (${message.author.tag})`, inline: true },
                                    { name: 'Hành động', value: `Timeout ${TIMEOUT_DURATION} (Lần 2)`, inline: true },
                                    { name: 'Tổng cảnh cáo', value: `${warnCount}`, inline: true },
                                    { name: 'Lý do', value: reason }
                                )
                                .setTimestamp();
                            logChannel.send({ embeds: [logEmbed] });
                        }
                    } else {
                        if (logChannel) logChannel.send(`⚠️ **Auto-Mod Lỗi:** Không thể timeout ${message.author} do thiếu quyền.`);
                    }
                } catch (error) {
                    console.error("Auto-Mod: Lỗi khi timeout", error);
                }
                break;
            default:
                if (warnCount >= 3) {
                    try {
                         if (message.member.bannable) {
                            const dmEmbed = new EmbedBuilder()
                                .setColor('Red')
                                .setTitle(`Bạn đã bị Ban vĩnh viễn khỏi ${message.guild.name}`)
                                .setDescription(`Bạn đã bị ban vĩnh viễn vì vi phạm lần thứ 3.\n**Lý do:** ${reason}`)
                                .setTimestamp();
                            await message.author.send({ embeds: [dmEmbed] }).catch(() => console.log(`Không thể DM thông báo ban cho ${message.author.tag}`));
    
                            await message.member.ban({ reason });
    
                             if (logChannel) {
                                 const logEmbed = new EmbedBuilder()
                                    .setColor('Red')
                                    .setTitle('Auto-Mod: Ban vĩnh viễn')
                                    .addFields(
                                        { name: 'Thành viên', value: `${message.author} (${message.author.tag})`, inline: true },
                                        { name: 'Hành động', value: 'Ban vĩnh viễn (Lần 3+)', inline: true },
                                        { name: 'Tổng cảnh cáo', value: `${warnCount}`, inline: true },
                                        { name: 'Lý do', value: reason }
                                    )
                                    .setTimestamp();
                                logChannel.send({ embeds: [logEmbed] });
                            }
                        } else {
                             if (logChannel) logChannel.send(`⚠️ **Auto-Mod Lỗi:** Không thể ban ${message.author} do thiếu quyền.`);
                        }
                    } catch (error) {
                        console.error("Auto-Mod: Lỗi khi ban", error);
                    }
                }
                break;
        }
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    // --- LOGIC CŨ CỦA VOICE STATE UPDATE (LEVELING) ---
    const userId = newState.id;
    const guildId = newState.guild.id;

    if (newState.member && newState.member.user.bot) return;
    
    // Logic for leveling system
    if (newState.member && !newState.member.roles.cache.has(NO_XP_ROLE_ID)) {
        const isJoining = (!oldState.channelId && newState.channelId);
        if (isJoining) {
            getUserStats(userId, guildId); // Ensure user exists
            db.prepare('UPDATE user_stats SET voiceJoinTimestamp = ? WHERE userId = ? AND guildId = ?').run(Date.now(), userId, guildId);
        } 
        
        const isLeaving = (oldState.channelId && !newState.channelId);
        if (isLeaving) {
            const user = getUserStats(userId, guildId);
            if (user.voiceJoinTimestamp > 0) {
                const durationMs = Date.now() - user.voiceJoinTimestamp;
                const durationMinutes = Math.floor(durationMs / 60000);

                if (durationMinutes > 0) {
                    const xpGained = durationMinutes * XP_PER_MINUTE_IN_VOICE;
                    updateUserXP(user.userId, user.guildId, user.xp + xpGained);
                }
                db.prepare('UPDATE user_stats SET voiceJoinTimestamp = 0 WHERE userId = ? AND guildId = ?').run(userId, guildId);
            }
        }
    }
    
    // --- HỆ THỐNG TEMP VOICE: LOGIC TẠO/XÓA KÊNH ---
    const settings = db.prepare('SELECT * FROM tempvoice_settings WHERE guildId = ?').get(guildId);
    if (!settings) return;

    // Xử lý tạo kênh
    if (newState.channelId === settings.creatorChannelId) {
        const member = newState.member;
        const category = newState.guild.channels.cache.get(settings.categoryId);
        if (!category) return;

        try {
            const newChannel = await newState.guild.channels.create({
                name: `Phòng của ${member.displayName}`,
                type: ChannelType.GuildVoice,
                parent: category,
                permissionOverwrites: [
                    {
                        id: member.id,
                        allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers],
                    },
                ],
            });

            await member.voice.setChannel(newChannel);
            db.prepare('INSERT INTO tempvoice_channels (channelId, ownerId) VALUES (?, ?)').run(newChannel.id, member.id);

        } catch (error) {
            console.error("Lỗi khi tạo kênh thoại tạm thời:", error);
        }
    }

    // Xử lý xóa kênh
    if (oldState.channelId && oldState.channelId !== settings.creatorChannelId) {
        const isTempChannel = db.prepare('SELECT * FROM tempvoice_channels WHERE channelId = ?').get(oldState.channelId);
        if (isTempChannel) {
            // Use a slight delay to avoid race conditions and check if the channel object still exists
            setTimeout(async () => {
                try {
                    const channel = await oldState.guild.channels.fetch(oldState.channelId).catch(() => null);
                    if (channel && channel.members.size === 0) {
                        await channel.delete('Kênh tạm thời trống');
                        db.prepare('DELETE FROM tempvoice_channels WHERE channelId = ?').run(oldState.channelId);
                    }
                } catch(e) {
                    // Channel might have been deleted already by user, which is fine.
                    // Make sure to clean up the database entry regardless.
                    db.prepare('DELETE FROM tempvoice_channels WHERE channelId = ?').run(oldState.channelId);
                }
            }, 5000); // 5 second delay
        }
    }
});


client.login(process.env.DISCORD_TOKEN);

client.on('guildMemberAdd', async member => {
    if (member.user.bot) return;

    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (channel) {
        const welcomeImages = [
            'https://i.pinimg.com/originals/c2/ce/2d/c2ce2d82a11c90b05ad4abd796ef2fff.gif',
            'https://giffiles.alphacoders.com/203/203432.gif',
            'https://gifsec.com/wp-content/uploads/2022/09/welcome-gif-24.gif',
            'https://i.pinimg.com/originals/8d/ac/4f/8dac4f8274a9ef0381d12b0ca30e1956.gif'
        ];
        const randomImage = welcomeImages[Math.floor(Math.random() * welcomeImages.length)];

        const welcomeEmbed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle(`🎉 Chào mừng thành viên mới! 🎉`)
            .setDescription(
                `Chào mừng con vợ ${member} đã hạ cánh xuống server!\n\n` +
                `Đừng quên ghé qua 2 channel này nhé <#${CHAT_CHANNEL_ID}> & <#${SUPPORT_CHANNEL_ID}>\n\n` +
                `Hy vọng con vợ sẽ có những giây phút vui vẻ và tuyệt vời tại đây.`
            )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setImage(randomImage)
            .setTimestamp()
            .setFooter({ text: `Hiện tại server có ${member.guild.memberCount} thành viên.` });

        try {
            await channel.send({ 
                content: `<@&${SUPPORT_ROLE_ID}> ơi, có thành viên mới ${member} nè!`,
                embeds: [welcomeEmbed] 
            });
        } catch (error) {
            console.error("Lỗi khi gửi tin nhắn chào mừng:", error);
        }
    }

    if (AUTO_ROLE_ID) {
        try {
            const role = member.guild.roles.cache.get(AUTO_ROLE_ID);
            if (role) {
                await member.roles.add(role);
                console.log(`Đã gán vai trò "${role.name}" cho ${member.user.tag}.`);
            } else {
                 console.log(`Không tìm thấy vai trò tự động với ID: ${AUTO_ROLE_ID}`);
            }
        } catch (error) {
            console.error(`Lỗi khi tự động gán vai trò cho ${member.user.tag}:`, error);
        }
    }
});

client.on('guildMemberRemove', async member => {
    if (member.partial) {
        try {
            await member.fetch();
        } catch (error) {
            console.error('Lỗi khi fetch thông tin đầy đủ của thành viên đã rời đi:', error);
            const channel = member.guild.channels.cache.get(GOODBYE_CHANNEL_ID);
            if(channel) await channel.send(`Một thành viên với ID: ${member.id} đã rời khỏi server.`);
            return;
        }
    }

    if (member.user.bot) return;

    const channel = member.guild.channels.cache.get(GOODBYE_CHANNEL_ID);
    if (!channel) {
        console.log(`Lỗi: Không tìm thấy kênh tạm biệt với ID: ${GOODBYE_CHANNEL_ID}`);
        return;
    }

    try {
        const goodbyeEmbed = new EmbedBuilder()
            .setColor('#FF474D')
            .setTitle(`👋 Một thành viên đã rời đi 👋`)
            .setDescription(`**${member.user.tag}** đã rời khỏi server. Hẹn gặp lại!`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setImage(GOODBYE_GIF_URL)
            .setTimestamp()
            .setFooter({ text: `Hiện tại server còn lại ${member.guild.memberCount} thành viên.` });

        await channel.send({ embeds: [goodbyeEmbed] });
    } catch (error) {
        console.error("Lỗi khi tạo hoặc gửi tin nhắn tạm biệt:", error);
    }
});
