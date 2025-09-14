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

    // Tạo bảng giveaways nếu chưa tồn tại
    db.exec(`CREATE TABLE IF NOT EXISTS giveaways (
        messageId TEXT PRIMARY KEY,
        channelId TEXT NOT NULL,
        guildId TEXT NOT NULL,
        prize TEXT NOT NULL,
        winnerCount INTEGER NOT NULL,
        endsAt INTEGER NOT NULL,
        hostedBy TEXT NOT NULL,
        ended INTEGER DEFAULT 0,
        content_text TEXT,
        required_roles TEXT,
        button_label TEXT DEFAULT 'Tham gia',
        button_emoji TEXT,
        button_style TEXT DEFAULT 'SUCCESS'
    )`);

    // Tạo bảng người tham gia nếu chưa tồn tại
    db.exec(`CREATE TABLE IF NOT EXISTS giveaway_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        giveawayId TEXT NOT NULL,
        userId TEXT NOT NULL,
        UNIQUE(giveawayId, userId),
        FOREIGN KEY (giveawayId) REFERENCES giveaways (messageId) ON DELETE CASCADE
    )`);

    // --- Bảng cho hệ thống Application Nâng Cấp ---
    db.exec(`CREATE TABLE IF NOT EXISTS app_forms (
        form_id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        form_name TEXT NOT NULL,
        receiving_channel_id TEXT NOT NULL,
        staff_role_id TEXT,
        log_channel_id TEXT
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS app_questions (
        question_id INTEGER PRIMARY KEY AUTOINCREMENT,
        form_id INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        question_style TEXT NOT NULL DEFAULT 'Short',
        placeholder TEXT,
        is_required INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (form_id) REFERENCES app_forms (form_id) ON DELETE CASCADE
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS app_submissions (
        submission_id INTEGER PRIMARY KEY AUTOINCREMENT,
        form_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
        submitted_at INTEGER NOT NULL,
        reviewed_by TEXT,
        review_message_id TEXT,
        FOREIGN KEY (form_id) REFERENCES app_forms (form_id) ON DELETE CASCADE
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS app_answers (
        answer_id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        answer_text TEXT NOT NULL,
        FOREIGN KEY (submission_id) REFERENCES app_submissions (submission_id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES app_questions (question_id) ON DELETE CASCADE
    )`);
    // --- Kết thúc phần Application ---

    db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`).run('ticketCounter', '1');
    console.log('✅ Database đã được thiết lập và sẵn sàng (với hệ thống Giveaway và Application nâng cấp).');
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
    // --- LỆNH GIVEAWAY NÂNG CẤP ---
    new SlashCommandBuilder().setName('giveaway')
        .setDescription('Quản lý hệ thống giveaway chuyên nghiệp.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('create')
            .setDescription('Mở form để tạo một giveaway mới với nhiều tùy chọn.')
        )
        .addSubcommand(sub =>
            sub.setName('reroll')
            .setDescription('Chọn lại một người thắng khác cho giveaway đã kết thúc.')
            .addStringOption(opt => opt.setName('message_id').setDescription('ID tin nhắn của giveaway đã kết thúc.').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('end')
            .setDescription('Kết thúc một giveaway ngay lập tức.')
            .addStringOption(opt => opt.setName('message_id').setDescription('ID tin nhắn của giveaway đang chạy.').setRequired(true))
        ),
    // --- LỆNH NHẠC ---
    new SlashCommandBuilder().setName('play').setDescription('Phát một bài hát từ YouTube.').addStringOption(opt => opt.setName('bài_hát').setDescription('Tên bài hát hoặc link YouTube.').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hát hiện tại.'),
    new SlashCommandBuilder().setName('stop').setDescription('Dừng phát nhạc và xóa hàng đợi.'),
    new SlashCommandBuilder().setName('queue').setDescription('Hiển thị hàng đợi bài hát.'),
    new SlashCommandBuilder().setName('pause').setDescription('Tạm dừng bài hát hiện tại.'),
    new SlashCommandBuilder().setName('resume').setDescription('Tiếp tục phát bài hát đã tạm dừng.'),
    new SlashCommandBuilder().setName('nowplaying').setDescription('Hiển thị thông tin bài hát đang phát.'),
    new SlashCommandBuilder().setName('loop').setDescription('Lặp lại bài hát hoặc hàng đợi.').addStringOption(opt => opt.setName('chế_độ').setDescription('Chọn chế độ lặp.').setRequired(true).addChoices({ name: 'Tắt', value: 'off' }, { name: 'Bài hát', value: 'song' }, { name: 'Hàng đợi', value: 'queue' })),
    
    // --- LỆNH APPLICATION NÂNG CẤP ---
    new SlashCommandBuilder().setName('apply')
        .setDescription('Mở một form đăng ký có sẵn.')
        .addStringOption(opt => 
            opt.setName('form_name')
            .setDescription('Tên của form bạn muốn điền.')
            .setRequired(true)
            .setAutocomplete(true) // Sẽ thêm autocomplete sau
        ),
    new SlashCommandBuilder().setName('applysetup')
        .setDescription('Quản lý hệ thống đơn đăng ký.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => 
            sub.setName('create')
            .setDescription('Tạo một form đăng ký mới.')
            .addStringOption(opt => opt.setName('tên_form').setDescription('Tên định danh cho form (ví dụ: "tuyen-staff", "dang-ky-event").').setRequired(true))
            .addChannelOption(opt => opt.setName('kênh_nhận_đơn').setDescription('Kênh riêng tư để bot gửi đơn đăng ký vào.').setRequired(true).addChannelTypes(ChannelType.GuildText))
            .addRoleOption(opt => opt.setName('role_staff').setDescription('Role sẽ được gán khi đơn được chấp thuận (tùy chọn).'))
        )
        .addSubcommand(sub =>
            sub.setName('addquestion')
            .setDescription('Thêm một câu hỏi vào form đã tạo.')
            .addStringOption(opt => opt.setName('tên_form').setDescription('Tên của form bạn muốn thêm câu hỏi.').setRequired(true).setAutocomplete(true))
            .addStringOption(opt => opt.setName('câu_hỏi').setDescription('Nội dung câu hỏi.').setRequired(true))
            .addStringOption(opt => opt.setName('loại').setDescription('Loại câu trả lời.').setRequired(true).addChoices({ name: 'Trả lời ngắn', value: 'Short'}, { name: 'Trả lời dài (đoạn văn)', value: 'Paragraph'}))
            .addStringOption(opt => opt.setName('chữ_mờ').setDescription('Văn bản gợi ý (placeholder) cho ô nhập liệu.'))
        )
        .addSubcommand(sub => 
            sub.setName('panel')
            .setDescription('Gửi bảng điều khiển để người dùng bấm nút đăng ký.')
            .addStringOption(opt => opt.setName('tên_form').setDescription('Tên của form bạn muốn tạo panel.').setRequired(true).setAutocomplete(true))
            .addStringOption(opt => opt.setName('tiêu_đề').setDescription('Tiêu đề của bảng điều khiển.').setRequired(true))
            .addStringOption(opt => opt.setName('mô_tả').setDescription('Nội dung mô tả. Dùng \\n để xuống dòng.').setRequired(true))
            .addStringOption(opt => opt.setName('chữ_nút').setDescription('Chữ hiển thị trên nút bấm (mặc định: Đăng ký).'))
            .addStringOption(opt => opt.setName('màu').setDescription('Mã màu Hex cho embed (ví dụ: #5865F2).'))
        ),
    // --- LỆNH HELP ---
    new SlashCommandBuilder().setName('help').setDescription('Hiển thị danh sách các lệnh hoặc thông tin chi tiết về một lệnh cụ thể.').addStringOption(opt => opt.setName('lệnh').setDescription('Tên lệnh bạn muốn xem chi tiết.').setRequired(false)),

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

// Hàm kết thúc giveaway (PHIÊN BẢN NÂNG CẤP)
async function endGiveaway(messageId) {
    const giveaway = db.prepare('SELECT * FROM giveaways WHERE messageId = ? AND ended = 0').get(messageId);
    if (!giveaway) return;

    db.prepare('UPDATE giveaways SET ended = 1 WHERE messageId = ?').run(messageId);

    const channel = await client.channels.cache.get(giveaway.channelId);
    if (!channel) return;

    try {
        const message = await channel.messages.fetch(messageId);
        const participants = db.prepare('SELECT userId FROM giveaway_entries WHERE giveawayId = ?').all(messageId).map(row => row.userId);

        const endedEmbed = EmbedBuilder.from(message.embeds[0])
            .setColor('Red')
            .setTitle(`❌ GIVEAWAY ĐÃ KẾT THÚC: ${giveaway.prize} ❌`);
        
        endedEmbed.setFields([]); 
        
        let winnerText;
        let winners = [];
        if (participants.length === 0) {
            winnerText = `Giveaway cho **${giveaway.prize}** đã kết thúc mà không có ai tham gia.`;
            endedEmbed.addFields({ name: '🏆 Người thắng cuộc', value: 'Không có ai tham gia!' });

        } else {
            const pool = [...participants];
            for (let i = 0; i < giveaway.winnerCount && pool.length > 0; i++) {
                const winnerIndex = Math.floor(Math.random() * pool.length);
                winners.push(pool.splice(winnerIndex, 1)[0]);
            }
            const winnerTags = winners.map(id => `<@${id}>`).join(', ');
            winnerText = `🎉 Chúc mừng ${winnerTags}! Bạn đã thắng **${giveaway.prize}**!`;
            endedEmbed.addFields({ name: '🏆 Người thắng cuộc', value: winnerTags });
        }
        
        endedEmbed.addFields({ name: '👤 Tổ chức bởi', value: `<@${giveaway.hostedBy}>` });

        const disabledButton = ButtonBuilder.from(message.components[0].components[0]).setDisabled(true).setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder().addComponents(disabledButton);
        
        await message.edit({ embeds: [endedEmbed], components: [row] });
        await channel.send({ content: winnerText, allowedMentions: { users: winners } });

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
// --- TRÌNH LẮNG NGHE TƯƠNG TÁC DUY NHẤT ---
// ================================================================= //
client.on('interactionCreate', async interaction => {

    // --- XỬ LÝ NỘP FORM (MODAL) ---
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('feedbackModal_')) {
            const channelId = interaction.customId.split('_')[1];
            const tieuDe = interaction.fields.getTextInputValue('tieuDeInput');
            const noiDung = interaction.fields.getTextInputValue('noiDungInput');
            const noiDung2 = interaction.fields.getTextInputValue('noiDung2Input') || 'Chưa nội dung';
            const feedbackEmbed = new EmbedBuilder().setColor('Green').setTitle(`📝 Phản hồi mới: ${tieuDe}`).setDescription(noiDung).addFields({ name: 'Nội dung 2', value: `**${noiDung2}**` }).setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }).setTimestamp();
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
        // --- XỬ LÝ FORM GIVEAWAY MỚI ---
        else if (interaction.customId === 'giveaway_create_modal') {
            await interaction.deferReply({ ephemeral: true });

            const prize = interaction.fields.getTextInputValue('gw_prize');
            const durationStr = interaction.fields.getTextInputValue('gw_duration');
            const winnerCount = parseInt(interaction.fields.getTextInputValue('gw_winner_count'));
            const contentText = interaction.fields.getTextInputValue('gw_content');
            const advancedOptions = interaction.fields.getTextInputValue('gw_advanced');

            const durationMs = ms(durationStr);
            if (!durationMs || durationMs <= 0) return interaction.editReply({ content: 'Thời gian không hợp lệ. Vui lòng dùng định dạng như "10m", "1h", "2d".' });
            if (isNaN(winnerCount) || winnerCount < 1) return interaction.editReply({ content: 'Số người thắng phải là một con số lớn hơn 0.' });

            let buttonLabel = 'Tham gia';
            let buttonEmoji = '🎉';
            let requiredRoles = null;

            if(advancedOptions) {
                advancedOptions.split('\n').forEach(line => {
                    const [key, ...valueParts] = line.split(':');
                    if (!key) return;
                    const value = valueParts.join(':').trim();
                    
                    if (key.trim().toLowerCase() === 'button') {
                        const emojiRegex = /^(<a?:\w+:\d+>|\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
                        const emojiMatch = value.match(emojiRegex);
                        
                        if (emojiMatch) {
                            buttonEmoji = emojiMatch[0];
                            buttonLabel = value.replace(emojiMatch[0], '').trim();
                        } else {
                            buttonLabel = value;
                            buttonEmoji = null;
                        }

                    } else if (key.trim().toLowerCase() === 'roles') {
                        const roleIds = value.match(/<@&(\d+)>/g)?.map(mention => mention.replace(/[<@&>]/g, ''));
                        if (roleIds && roleIds.length > 0) {
                            requiredRoles = JSON.stringify(roleIds);
                        }
                    }
                });
            }

            const endsAt = Date.now() + durationMs;

            const giveawayEmbed = new EmbedBuilder()
                .setColor('Aqua')
                .setTitle(`🎉 Giveaway: ${prize}`)
                .setDescription(contentText || 'Bấm nút bên dưới để tham gia!')
                .addFields(
                    { name: '⏰ Kết thúc', value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
                    { name: '🏆 Số người thắng', value: `**${winnerCount}** người`, inline: true },
                    { name: '👥 Người tham gia', value: '**0** người', inline: true },
                    { name: '👤 Tổ chức bởi', value: `${interaction.user}` }
                )
                .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` })
                .setTimestamp();


            const joinButton = new ButtonBuilder()
                .setLabel(buttonLabel)
                .setStyle(ButtonStyle.Success);
            if (buttonEmoji) {
                try {
                     joinButton.setEmoji(buttonEmoji);
                } catch(e) {
                    console.log("Emoji không hợp lệ, bỏ qua:", buttonEmoji);
                }
            }

            try {
                const tempButton = joinButton.setCustomId(`gw_join_temp_${interaction.id}`);
                const message = await interaction.channel.send({ embeds: [giveawayEmbed], components: [new ActionRowBuilder().addComponents(tempButton)] });

                const finalButton = joinButton.setCustomId(`gw_join_${message.id}`);
                await message.edit({ components: [new ActionRowBuilder().addComponents(finalButton)] });
                
                db.prepare(`INSERT INTO giveaways (messageId, channelId, guildId, prize, winnerCount, endsAt, hostedBy, content_text, required_roles, button_label, button_emoji) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(message.id, interaction.channel.id, interaction.guild.id, prize, winnerCount, endsAt, interaction.user.id, contentText, requiredRoles, buttonLabel, buttonEmoji);

                setTimeout(() => endGiveaway(message.id), durationMs);
                
                await interaction.editReply({ content: `✅ Đã tạo thành công giveaway tại ${interaction.channel}!` });

            } catch (error) {
                console.error("Lỗi khi tạo giveaway:", error);
                await interaction.editReply({ content: 'Đã có lỗi xảy ra. Vui lòng kiểm tra quyền của bot trong kênh đó.' });
            }
        }
        // --- XỬ LÝ FORM APPLICATION NÂNG CẤP ---
        else if (interaction.customId.startsWith('apply_submit_')) {
            await interaction.deferReply({ ephemeral: true });
            const formId = interaction.customId.split('_')[2];

            const form = db.prepare('SELECT * FROM app_forms WHERE form_id = ?').get(formId);
            if (!form) return interaction.editReply({ content: 'Lỗi: Form này không còn tồn tại.' });

            // Bắt đầu một transaction để đảm bảo toàn vẹn dữ liệu
            const transaction = db.transaction(() => {
                const submissionInsert = db.prepare('INSERT INTO app_submissions (form_id, user_id, submitted_at) VALUES (?, ?, ?)')
                                          .run(formId, interaction.user.id, Date.now());
                const submissionId = submissionInsert.lastInsertRowid;

                const answerInsert = db.prepare('INSERT INTO app_answers (submission_id, question_id, answer_text) VALUES (?, ?, ?)');
                
                interaction.fields.components.forEach(row => {
                    const textInput = row.components[0];
                    const questionId = textInput.customId.split('_')[1];
                    const answerText = textInput.value;
                    answerInsert.run(submissionId, questionId, answerText);
                });
                
                return submissionId;
            });

            const submissionId = transaction();

            // Gửi embed thông báo đến kênh review
            const receivingChannel = await client.channels.fetch(form.receiving_channel_id).catch(() => null);
            if (!receivingChannel) {
                console.error(`Không tìm thấy kênh nhận đơn ID: ${form.receiving_channel_id}`);
                return interaction.editReply({ content: '❌ Đã có lỗi phía máy chủ, không tìm thấy kênh nhận đơn. Vui lòng báo Admin.' });
            }

            const questions = db.prepare('SELECT * FROM app_questions WHERE form_id = ? ORDER BY question_id ASC').all(formId);
            const answers = db.prepare('SELECT * FROM app_answers WHERE submission_id = ?').all(submissionId);

            const reviewEmbed = new EmbedBuilder()
                .setColor('Yellow')
                .setTitle(`📝 Đơn đăng ký mới: ${form.form_name}`)
                .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                .addFields(
                    { name: '👤 Người nộp đơn', value: `${interaction.user}`, inline: true },
                    { name: '🆔 User ID', value: `\`${interaction.user.id}\``, inline: true }
                )
                .setTimestamp();
            
            questions.forEach(q => {
                const answer = answers.find(a => a.question_id === q.question_id);
                reviewEmbed.addFields({ name: q.question_text, value: `\`\`\`${answer ? answer.answer_text : 'Không trả lời'}\`\`\`` });
            });

            const approveButton = new ButtonBuilder()
                .setCustomId(`apply_approve_${submissionId}`)
                .setLabel('Chấp thuận')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅');
            const rejectButton = new ButtonBuilder()
                .setCustomId(`apply_reject_${submissionId}`)
                .setLabel('Từ chối')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌');
            
            const row = new ActionRowBuilder().addComponents(approveButton, rejectButton);

            await receivingChannel.send({ embeds: [reviewEmbed], components: [row] });
            await interaction.editReply({ content: '✅ Đã gửi đơn đăng ký của bạn thành công!' });
        }
        // ------------------------------------
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
            const noiDung2Input = new TextInputBuilder().setCustomId('noiDung2Input').setLabel("Nội dung 2").setStyle(TextInputStyle.Paragraph).setPlaceholder('Bạn muốn nói điều gì ? Hãy ghi ở đây ! Không có thì bỏ trống.').setRequired(false);
            modal.addComponents(new ActionRowBuilder().addComponents(tieuDeInput), new ActionRowBuilder().addComponents(noiDungInput), new ActionRowBuilder().addComponents(noiDung2Input));
            await interaction.showModal(modal);
        }
        // --- XỬ LÝ NÚT THAM GIA GIVEAWAY MỚI ---
        else if (customId.startsWith('gw_join_')) {
            const messageId = customId.split('_')[2];
            const giveaway = db.prepare('SELECT * FROM giveaways WHERE messageId = ?').get(messageId);

            if (!giveaway || giveaway.ended) {
                return interaction.reply({ content: 'Rất tiếc, giveaway này đã kết thúc hoặc không còn tồn tại.', ephemeral: true });
            }

            // --- Kiểm tra các yêu cầu ---
            if (giveaway.required_roles) {
                const requiredRoles = JSON.parse(giveaway.required_roles);
                const hasAllRoles = requiredRoles.every(roleId => interaction.member.roles.cache.has(roleId));
                if (!hasAllRoles) {
                    const roleMentions = requiredRoles.map(id => `<@&${id}>`).join(', ');
                    return interaction.reply({ content: `Bạn cần có các vai trò sau để tham gia: ${roleMentions}`, ephemeral: true });
                }
            }

            // --- Ghi danh hoặc Rút lui ---
            const existingEntry = db.prepare('SELECT * FROM giveaway_entries WHERE giveawayId = ? AND userId = ?').get(messageId, interaction.user.id);
            if (existingEntry) {
                db.prepare('DELETE FROM giveaway_entries WHERE giveawayId = ? AND userId = ?').run(messageId, interaction.user.id);
                await interaction.reply({ content: 'Bạn đã rút lui khỏi giveaway.', ephemeral: true });
            } else {
                db.prepare('INSERT INTO giveaway_entries (giveawayId, userId) VALUES (?, ?)').run(messageId, interaction.user.id);
                await interaction.reply({ content: '✅ Chúc may mắn! Bạn đã tham gia giveaway thành công!', ephemeral: true });
            }

            // --- Cập nhật số người tham gia trên embed ---
            try {
                const entryCount = db.prepare('SELECT COUNT(*) as count FROM giveaway_entries WHERE giveawayId = ?').get(messageId).count;
                const message = await interaction.channel.messages.fetch(messageId);
                if (!message) return;

                const originalEmbed = message.embeds[0];
                const updatedEmbed = EmbedBuilder.from(originalEmbed);
                const participantsFieldIndex = originalEmbed.fields.findIndex(field => field.name === '👥 Người tham gia');

                if (participantsFieldIndex > -1) {
                    updatedEmbed.spliceFields(participantsFieldIndex, 1, { name: '👥 Người tham gia', value: `**${entryCount}** người`, inline: true });
                }
                 // Nếu không tìm thấy field, không làm gì cả vì embed gốc đã có
                await message.edit({ embeds: [updatedEmbed] });
            } catch (e) {
                 console.log("Không thể cập nhật số người tham gia giveaway:", e.message);
            }
        } else if (customId === 'open_giveaway_modal') {
             const modal = new ModalBuilder()
                .setCustomId('giveaway_create_modal')
                .setTitle('Tạo Giveaway Mới');

            const prizeInput = new TextInputBuilder().setCustomId('gw_prize').setLabel("Giải thưởng là gì?").setStyle(TextInputStyle.Short).setPlaceholder('Ví dụ: Discord Nitro 1 tháng').setRequired(true);
            const durationInput = new TextInputBuilder().setCustomId('gw_duration').setLabel("Thời gian giveaway?").setStyle(TextInputStyle.Short).setPlaceholder('Ví dụ: 1d, 12h, 30m').setRequired(true);
            const winnerCountInput = new TextInputBuilder().setCustomId('gw_winner_count').setLabel("Số lượng người thắng?").setStyle(TextInputStyle.Short).setValue('1').setRequired(true);
            const contentInput = new TextInputBuilder().setCustomId('gw_content').setLabel("Nội dung").setStyle(TextInputStyle.Paragraph).setPlaceholder('Ghi nội dung hoặc mô tả cho giveaway ở đây.').setRequired(false);
            const advancedInput = new TextInputBuilder().setCustomId('gw_advanced').setLabel("Tùy chọn Nâng cao (Mỗi dòng một tùy chọn)").setStyle(TextInputStyle.Paragraph).setPlaceholder('roles: @Role1 @Role2\nbutton: 🎉 Tham gia ngay').setRequired(false);
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(prizeInput),
                new ActionRowBuilder().addComponents(durationInput),
                new ActionRowBuilder().addComponents(winnerCountInput),
                new ActionRowBuilder().addComponents(contentInput),
                new ActionRowBuilder().addComponents(advancedInput)
            );
            
            await interaction.showModal(modal);
        }
        // --- XỬ LÝ NÚT APPLICATION NÂNG CẤP ---
        else if (customId.startsWith('apply_')) {
            const parts = customId.split('_');
            const action = parts[1];
            const formIdOrSubmissionId = parts[2];

            if (action === 'start') {
                const formId = formIdOrSubmissionId;
                const form = db.prepare('SELECT * FROM app_forms WHERE form_id = ?').get(formId);
                if (!form) return interaction.reply({ content: 'Lỗi: Form này không còn tồn tại.', ephemeral: true });

                const questions = db.prepare('SELECT * FROM app_questions WHERE form_id = ? ORDER BY question_id ASC').all(formId);
                if (questions.length === 0) return interaction.reply({ content: 'Lỗi: Form này chưa có câu hỏi nào.', ephemeral: true });
                
                const modal = new ModalBuilder()
                    .setCustomId(`apply_submit_${formId}`)
                    .setTitle(form.form_name);

                questions.forEach(q => {
                    const textInput = new TextInputBuilder()
                        .setCustomId(`q_${q.question_id}`)
                        .setLabel(q.question_text)
                        .setStyle(q.question_style === 'Paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
                        .setRequired(q.is_required === 1);
                    if (q.placeholder) textInput.setPlaceholder(q.placeholder);
                    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
                });

                await interaction.showModal(modal);
            }
            else if (action === 'approve' || action === 'reject') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: 'Bạn không có quyền thực hiện hành động này.', ephemeral: true });
                }
                await interaction.deferUpdate();
                const submissionId = formIdOrSubmissionId;
                const submission = db.prepare('SELECT * FROM app_submissions WHERE submission_id = ?').get(submissionId);
                if (!submission || submission.status !== 'pending') {
                    return interaction.followUp({ content: 'Đơn này đã được duyệt hoặc không tồn tại.', ephemeral: true });
                }

                const form = db.prepare('SELECT * FROM app_forms WHERE form_id = ?').get(submission.form_id);
                const applicant = await interaction.guild.members.fetch(submission.user_id).catch(() => null);
                const newStatus = action === 'approve' ? 'approved' : 'rejected';
                const newTitle = action === 'approve' ? `✅ Đã chấp thuận bởi ${interaction.user.tag}` : `❌ Đã từ chối bởi ${interaction.user.tag}`;
                const newColor = action === 'approve' ? 'Green' : 'Red';

                db.prepare('UPDATE app_submissions SET status = ?, reviewed_by = ? WHERE submission_id = ?')
                  .run(newStatus, interaction.user.id, submissionId);

                const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setTitle(newTitle)
                    .setColor(newColor);
                    
                await interaction.editReply({ embeds: [originalEmbed], components: [] });

                if (applicant) {
                    try {
                        if (action === 'approve') {
                            await applicant.send(`🎉 Chúc mừng! Đơn đăng ký \`${form.form_name}\` của bạn tại server **${interaction.guild.name}** đã được chấp thuận.`);
                            if (form.staff_role_id) {
                                const role = interaction.guild.roles.cache.get(form.staff_role_id);
                                if (role) await applicant.roles.add(role);
                            }
                        } else {
                            await applicant.send(`😔 Rất tiếc, đơn đăng ký \`${form.form_name}\` của bạn tại server **${interaction.guild.name}** đã bị từ chối.`);
                        }
                    } catch (dmError) {
                        console.log(`Không thể gửi DM cho người dùng ${applicant.id}`);
                        interaction.followUp({ content: `⚠️ Không thể gửi DM thông báo cho ${applicant}.`, ephemeral: true });
                    }
                }
            }
        }
        // ------------------------------------
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
            const danhGiaInput = new TextInputBuilder().setCustomId('danhGiaInput').setLabel("Nội dung 2").setStyle(TextInputStyle.Short).setPlaceholder('Ghi ở đây ! Không có thì bỏ trống').setRequired(false); 
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
            const openFormButton = new ButtonBuilder().setCustomId(`open_feedback_form_${feedbackChannelId}`).setLabel('Pấm Nút').setStyle(ButtonStyle.Primary).setEmoji('<:email49:1412322374891602020>');
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
        // --- XỬ LÝ LỆNH GIVEAWAY NÂNG CẤP ---
        else if (commandName === 'giveaway') {
            const subcommand = interaction.options.getSubcommand();
            if (subcommand === 'create') {
                const openModalButton = new ButtonBuilder()
                    .setCustomId('open_giveaway_modal')
                    .setLabel('Mở Form Tạo Giveaway')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📝');
                
                const row = new ActionRowBuilder().addComponents(openModalButton);

                await interaction.reply({ 
                    content: 'Vui lòng bấm nút bên dưới để mở form và điền thông tin chi tiết cho giveaway.', 
                    components: [row], 
                    ephemeral: true 
                });
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
                    const oldWinnerField = message.embeds[0].fields.find(f => f.name === '🏆 Người thắng cuộc');
                    const oldWinnerIds = oldWinnerField ? oldWinnerField.value.match(/<@(\d+)>/g).map(tag => tag.slice(2, -1)) : [];
                    
                    const participants = db.prepare('SELECT userId FROM giveaway_entries WHERE giveawayId = ?')
                                        .all(messageId)
                                        .map(row => row.userId)
                                        .filter(id => !oldWinnerIds.includes(id));

                    if (participants.length === 0) {
                        return interaction.followUp({ content: 'Không còn người tham gia nào khác để chọn lại.' });
                    }
                    
                    const newWinnerIndex = Math.floor(Math.random() * participants.length);
                    const newWinnerId = participants[newWinnerIndex];
                    const newWinnerTag = `<@${newWinnerId}>`;

                    await channel.send(`🔄 Người thắng mới cho **${giveaway.prize}** là ${newWinnerTag}! Chúc mừng!`);
                    await interaction.followUp({ content: `Đã chọn lại người thắng! Chúc mừng ${newWinnerTag}!` });

                } catch (error) {
                    console.error("Lỗi khi reroll giveaway:", error);
                    await interaction.followUp({ content: 'Đã xảy ra lỗi khi cố gắng reroll. Hãy chắc chắn ID tin nhắn là đúng.' });
                }
            }
            else if (subcommand === 'end') {
                await interaction.deferReply({ ephemeral: true });
                const messageId = interaction.options.getString('message_id');
                const giveaway = db.prepare('SELECT * FROM giveaways WHERE messageId = ? AND ended = 0').get(messageId);
                if (!giveaway) return interaction.followUp({ content: 'Không tìm thấy giveaway đang hoạt động với ID này.' });
                
                await endGiveaway(messageId);
                await interaction.followUp({ content: '✅ Đã kết thúc giveaway thành công.' });
            }
        }
        // --- XỬ LÝ LỆNH APPLICATION NÂNG CẤP ---
        else if (commandName === 'applysetup') {
            const subcommand = interaction.options.getSubcommand();
            const formName = interaction.options.getString('tên_form')?.toLowerCase();

            if (subcommand === 'create') {
                await interaction.deferReply({ ephemeral: true });
                const receivingChannel = interaction.options.getChannel('kênh_nhận_đơn');
                const staffRole = interaction.options.getRole('role_staff');

                const existingForm = db.prepare('SELECT * FROM app_forms WHERE guild_id = ? AND form_name = ?').get(interaction.guild.id, formName);
                if (existingForm) {
                    return interaction.editReply({ content: `❌ Tên form \`${formName}\` đã tồn tại. Vui lòng chọn một tên khác.` });
                }

                db.prepare('INSERT INTO app_forms (guild_id, form_name, receiving_channel_id, staff_role_id) VALUES (?, ?, ?, ?)')
                  .run(interaction.guild.id, formName, receivingChannel.id, staffRole?.id);

                const successEmbed = new EmbedBuilder()
                    .setColor('Green')
                    .setTitle('✅ Tạo Form Thành Công!')
                    .setDescription(`Đã tạo form với tên \`${formName}\`.\nBây giờ, hãy dùng lệnh \`/applysetup addquestion\` để thêm các câu hỏi cho form này.`)
                    .addFields(
                        { name: 'Kênh nhận đơn', value: `${receivingChannel}` },
                        { name: 'Role khi chấp thuận', value: staffRole ? `${staffRole}` : 'Chưa thiết lập' }
                    );

                return interaction.editReply({ embeds: [successEmbed] });

            } else if (subcommand === 'addquestion') {
                await interaction.deferReply({ ephemeral: true });
                const form = db.prepare('SELECT * FROM app_forms WHERE guild_id = ? AND form_name = ?').get(interaction.guild.id, formName);
                if (!form) {
                    return interaction.editReply({ content: `❌ Không tìm thấy form nào có tên \`${formName}\`.` });
                }

                const questions = db.prepare('SELECT * FROM app_questions WHERE form_id = ?').all(form.form_id);
                if (questions.length >= 5) {
                    return interaction.editReply({ content: '❌ Một form chỉ có thể có tối đa 5 câu hỏi (giới hạn của Discord Modal).' });
                }

                const questionText = interaction.options.getString('câu_hỏi');
                const questionStyle = interaction.options.getString('loại');
                const placeholder = interaction.options.getString('chữ_mờ');

                db.prepare('INSERT INTO app_questions (form_id, question_text, question_style, placeholder) VALUES (?, ?, ?, ?)')
                  .run(form.form_id, questionText, questionStyle, placeholder);

                return interaction.editReply({ content: `✅ Đã thêm câu hỏi vào form \`${formName}\` thành công!` });

            } else if (subcommand === 'panel') {
                await interaction.deferReply({ ephemeral: true });
                const form = db.prepare('SELECT * FROM app_forms WHERE guild_id = ? AND form_name = ?').get(interaction.guild.id, formName);
                if (!form) {
                    return interaction.editReply({ content: `❌ Không tìm thấy form nào có tên \`${formName}\`.` });
                }

                const title = interaction.options.getString('tiêu_đề');
                const description = interaction.options.getString('mô_tả').replace(/\\n/g, '\n');
                const buttonLabel = interaction.options.getString('chữ_nút') || 'Đăng ký';
                const color = interaction.options.getString('màu') || '#5865F2';

                const panelEmbed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(color);
                    
                const applyButton = new ButtonBuilder()
                    .setCustomId(`apply_start_${form.form_id}`)
                    .setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📝');
                    
                const row = new ActionRowBuilder().addComponents(applyButton);
                
                await interaction.channel.send({ embeds: [panelEmbed], components: [row] });
                return interaction.editReply({ content: '✅ Đã đăng bảng điều khiển đăng ký thành công!' });
            }
        }
        else if (commandName === 'apply') {
            // Tạm thời để trống, chúng ta sẽ xử lý qua nút bấm
            return interaction.reply({ content: 'Tính năng này hiện được sử dụng qua các nút bấm trên panel đăng ký.', ephemeral: true });
        }
        // ------------------------------------------
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
