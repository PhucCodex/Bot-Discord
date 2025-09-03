const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Bot đã sẵn sàng!');
});

app.listen(port, () => {
  console.log(`Server đang lắng nghe tại http://localhost:${port}`);
});

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, EmbedBuilder, ChannelType, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const ms = require('ms');
require('dotenv').config();

// BIẾN ĐẾM TICKET VÀ LỊCH HẸN GỠ ROLE
let ticketCounter = 1;
const activeRoleTimeouts = new Map(); // Dùng để quản lý các role tạm thời

const DEFAULT_FEEDBACK_CHANNEL_ID = '1128546415250198539';
const TICKET_CATEGORY_ID = '1412100711931445452'; 
const SUPPORT_ROLE_ID = '1412090993909563534';    
const WELCOME_CHANNEL_ID = '1406560267214524527';
const GOODBYE_CHANNEL_ID = '1406559808114393121';
const AUTO_ROLE_ID = '1406560015925514290'; // ⚠️ THAY BẰNG ID VAI TRÒ "THÀNH VIÊN" CỦA BẠN
const GOODBYE_GIF_URL = 'https://i.pinimg.com/originals/ec/c6/8e/ecc68e64677d55433d833ac1e6a713fd.gif'

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
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Kiểm tra độ trễ của bot')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('hi1')
        .setDescription('Gửi lời chào thân thương đến một người đáng yêu.')
        .addUserOption(option =>
            option.setName('người')
                .setDescription('Người bạn muốn chào')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('feedback')
        .setDescription('Mở một form để gửi phản hồi trực tiếp.')
        .addChannelOption(option =>
            option.setName('kênh')
                .setDescription('Kênh để gửi phản hồi. Bỏ trống sẽ gửi đến kênh mặc định.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
        .addStringOption(option => option.setName('màu').setDescription('Mã màu Hex cho embed (vd: #3498db).'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers | PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban một thành viên khỏi server.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần ban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Lý do ban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers | PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Gỡ ban cho một thành viên bằng ID.')
        .addStringOption(option => option.setName('userid').setDescription('ID của người dùng cần gỡ ban').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers | PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout một thành viên.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần timeout').setRequired(true))
        .addStringOption(option => option.setName('time').setDescription('Thời gian mute (vd: 10m, 1h, 2d)').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Lý do mute'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Gỡ timeout cho một thành viên.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần gỡ timeout').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers | PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('rename')
        .setDescription('Đổi nickname cho một thành viên.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần đổi tên').setRequired(true))
        .addStringOption(option => option.setName('nickname').setDescription('Nickname mới').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames | PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('move')
        .setDescription('Di chuyển một thành viên sang kênh thoại khác.')
        .addUserOption(option => option.setName('người').setDescription('Thành viên cần di chuyển').setRequired(true))
        .addChannelOption(option => option.setName('channel').setDescription('Kênh thoại muốn chuyển đến').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers | PermissionFlagsBits.Administrator)
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
        .addStringOption(option => option.setName('hinh_anh').setDescription('URL hình ảnh (ảnh bìa) của bảng điều khiển.'))
        .addStringOption(option => option.setName('mau_sac').setDescription('Mã màu Hex cho đường viền (ví dụ: #FF5733).'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('formsetup')
        .setDescription('Cài đặt bảng điều khiển để mở form feedback.')
        .addStringOption(option => option.setName('tieu_de').setDescription('Tiêu đề chính của bảng điều khiển.').setRequired(true))
        .addStringOption(option => option.setName('mo_ta').setDescription('Nội dung mô tả chi tiết. Dùng \\n để xuống dòng.').setRequired(true))
        .addChannelOption(option => option.setName('kenh_nhan_form').setDescription('Kênh sẽ nhận kết quả form. Mặc định là kênh feedback chung.'))
        .addStringOption(option => option.setName('hinh_anh').setDescription('URL hình ảnh (ảnh bìa) của bảng điều khiển.'))
        .addStringOption(option => option.setName('mau_sac').setDescription('Mã màu Hex cho đường viền (ví dụ: #FF5733).'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
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

].map(command => command.toJSON());



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



const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates] });

client.once('ready', () => {
    console.log(`✅ Bot đã online! Tên bot: ${client.user.tag}`);

    client.user.setPresence({
        activities: [{
            name: '🌠 Sao Băng Rơi', 
            type: ActivityType.Watching 
        }],
        status: 'idle', 
    });
});

client.on('interactionCreate', async interaction => {
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
        return;
    }

    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId === 'create_ticket') {
            await interaction.deferReply({ ephemeral: true });
            
            const ticketChannelName = `ticket-${ticketCounter}`;

            try {
                const ticketChannel = await interaction.guild.channels.create({
                    name: ticketChannelName,
                    type: ChannelType.GuildText,
                    parent: TICKET_CATEGORY_ID,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                        { id: SUPPORT_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    ],
                });

                ticketCounter++;

                const ticketWelcomeEmbed = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle('🎟️ Ticket Hỗ Trợ Đã Được Tạo')
                    .setDescription(`Chào ${interaction.user}, cảm ơn bạn đã liên hệ.\n\nĐội ngũ <@&${SUPPORT_ROLE_ID}> sẽ phản hồi trong thời gian sớm nhất. Vui lòng trình bày chi tiết vấn đề của bạn ở đây.`)
                    .setTimestamp()
                    .setFooter({ text: `Ticket được tạo bởi ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

                const closeButton = new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Đóng Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒');
                const row = new ActionRowBuilder().addComponents(closeButton);

                await ticketChannel.send({
                    content: `${interaction.user} <@&${SUPPORT_ROLE_ID}>`,
                    embeds: [ticketWelcomeEmbed],
                    components: [row]
                });

                await interaction.followUp({ content: `Đã tạo ticket của bạn tại ${ticketChannel}.` });

            } catch (error) {
                console.error("Lỗi khi tạo ticket:", error);
                await interaction.followUp({ content: 'Đã có lỗi xảy ra khi tạo ticket. Vui lòng kiểm tra lại ID Category và quyền của bot.' });
            }
        }
        if (customId === 'close_ticket') {
            if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: 'Chỉ đội ngũ hỗ trợ mới có thể đóng ticket.', ephemeral: true });
            }
            await interaction.reply({ content: 'Đang xóa kênh...', ephemeral: true });
            interaction.channel.delete().catch(err => console.error("Không thể xóa kênh ticket:", err));
        }

        if (customId.startsWith('open_feedback_form_')) {
            const feedbackChannelId = customId.split('_')[3]; 
            const modal = new ModalBuilder()
                .setCustomId(`feedbackModal_${feedbackChannelId}`)
                .setTitle('Gửi phản hồi cho Phúc');

            const tieuDeInput = new TextInputBuilder().setCustomId('tieuDeInput').setLabel("Tên của bạn ?").setStyle(TextInputStyle.Short).setPlaceholder('Ghi ở đây !').setRequired(true);
            const noiDungInput = new TextInputBuilder().setCustomId('noiDungInput').setLabel("Nội dung").setStyle(TextInputStyle.Paragraph).setPlaceholder('Bạn muốn nói điều gì ? Hãy ghi ở đây !').setRequired(true).setMinLength(10);
            const danhGiaInput = new TextInputBuilder().setCustomId('danhGiaInput').setLabel("Nội dung 2").setStyle(TextInputStyle.Paragraph).setPlaceholder('Bạn muốn nói điều gì ? Hãy ghi ở đây ! Không có thì bỏ trống.').setRequired(false);

            const firstActionRow = new ActionRowBuilder().addComponents(tieuDeInput);
            const secondActionRow = new ActionRowBuilder().addComponents(noiDungInput);
            const thirdActionRow = new ActionRowBuilder().addComponents(danhGiaInput);

            modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
            await interaction.showModal(modal);
        }
    }

    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

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
    
            try {
                await target.roles.add(role);
    
                const memberAfterUpdate = await interaction.guild.members.fetch({ user: target.id, force: true });
                
                if (memberAfterUpdate.roles.cache.has(role.id)) {
                    const timeoutKey = `${target.id}-${role.id}`;
                    const timeoutId = setTimeout(async () => {
                        try {
                            const freshMember = await interaction.guild.members.fetch(target.id).catch(() => null);
                            if (freshMember && freshMember.roles.cache.has(role.id)) {
                                await freshMember.roles.remove(role);
                                console.log(`Đã tự động gỡ vai trò "${role.name}" khỏi "${target.user.tag}" sau ${durationStr}.`);
                            }
                        } catch (err) {
                            console.error(`Lỗi khi tự động gỡ vai trò tạm thời cho ${target.user.tag}:`, err);
                        }
                        activeRoleTimeouts.delete(timeoutKey);
                    }, durationMs);

                    activeRoleTimeouts.set(timeoutKey, timeoutId);
        
                    const embed = new EmbedBuilder()
                        .setColor('Green')
                        .setTitle('✅ Gán vai trò tạm thời thành công')
                        .setDescription(`Đã gán vai trò ${role} cho ${target} trong thời hạn **${durationStr}**.`)
                        .setTimestamp()
                        .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` });
                    
                    await interaction.followUp({ embeds: [embed] });
                } else {
                    throw new Error('Hành động gán vai trò đã được thực hiện nhưng không thành công. Vui lòng kiểm tra lại quyền hạn của bot.');
                }
    
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
    
            const timeoutKey = `${target.id}-${role.id}`;
            if (activeRoleTimeouts.has(timeoutKey)) {
                clearTimeout(activeRoleTimeouts.get(timeoutKey));
                activeRoleTimeouts.delete(timeoutKey);
            }
    
            try {
                await target.roles.remove(role);
                const embed = new EmbedBuilder()
                    .setColor('Red')
                    .setTitle('✅ Gỡ vai trò tạm thời thành công')
                    .setDescription(`Đã gỡ vai trò ${role} khỏi ${target} ngay lập tức.`)
                    .setTimestamp()
                    .setFooter({ text: `Yêu cầu bởi ${interaction.user.tag}` });
                await interaction.followUp({ embeds: [embed] });
            } catch (error) {
                console.error('Lỗi khi gỡ vai trò tạm thời:', error);
                await interaction.followUp({ content: 'Đã xảy ra lỗi khi cố gắng gỡ vai trò. Vui lòng kiểm tra quyền của tôi.' });
            }
        }
        else if (commandName === 'ticketsetup') {
            await interaction.deferReply({ ephemeral: true });
            const tieuDe = interaction.options.getString('tieu_de');
            const moTa = interaction.options.getString('mo_ta').replace(/\\n/g, '\n');
            const hinhAnh = interaction.options.getString('hinh_anh');
            const mauSac = interaction.options.getString('mau_sac');
            const ticketEmbed = new EmbedBuilder().setTitle(tieuDe).setDescription(moTa);
            if (mauSac) ticketEmbed.setColor(mauSac);
            if (hinhAnh) ticketEmbed.setImage(hinhAnh);
            const openButton = new ButtonBuilder().setCustomId('create_ticket').setLabel('Mở Ticket').setStyle(ButtonStyle.Success).setEmoji('<:Email37:1412322372790255636>');
            const row = new ActionRowBuilder().addComponents(openButton);
            await interaction.channel.send({ embeds: [ticketEmbed], components: [row] });
            await interaction.followUp({ content: 'Đã cài đặt thành công bảng điều khiển ticket.' });
        }
        else if (commandName === 'formsetup') {
            await interaction.deferReply({ ephemeral: true });
            const tieuDe = interaction.options.getString('tieu_de');
            const moTa = interaction.options.getString('mo_ta').replace(/\\n/g, '\n');
            const hinhAnh = interaction.options.getString('hinh_anh');
            const mauSac = interaction.options.getString('mau_sac');
            const kenhNhanForm = interaction.options.getChannel('kenh_nhan_form');
            const feedbackChannelId = kenhNhanForm ? kenhNhanForm.id : DEFAULT_FEEDBACK_CHANNEL_ID;

            const formEmbed = new EmbedBuilder().setTitle(tieuDe).setDescription(moTa);
            if (mauSac) formEmbed.setColor(mauSac);
            if (hinhAnh) formEmbed.setImage(hinhAnh);

            const openFormButton = new ButtonBuilder()
                .setCustomId(`open_feedback_form_${feedbackChannelId}`)
                .setLabel('Hỗ Trợ')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:email49:1412322374891602020>');

            const row = new ActionRowBuilder().addComponents(openFormButton);

            await interaction.channel.send({ embeds: [formEmbed], components: [row] });
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
            } else { // destination === 'server'
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
            ticketCounter = 1;
            await interaction.reply({ content: '✅ Đã reset số đếm ticket về lại 1.', ephemeral: true });
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
            // Xóa dòng tag role khỏi đây
            .setDescription(`Chào mừng con vợ ${member} đã hạ cánh xuống server!\n\nHy vọng con vợ sẽ có những giây phút vui vẻ và tuyệt vời tại đây.`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setImage(randomImage)
            .setTimestamp()
            .setFooter({ text: `Hiện tại server có ${member.guild.memberCount} thành viên.` });

        try {
            // Gửi tin nhắn có cả content (để ping) và embed
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
            .setImage(GOODBYE_GIF_URL) // Sử dụng link ảnh GIF cố định
            .setTimestamp()
            .setFooter({ text: `Hiện tại server còn lại ${member.guild.memberCount} thành viên.` });

        await channel.send({ embeds: [goodbyeEmbed] });
    } catch (error) {
        console.error("Lỗi khi tạo hoặc gửi tin nhắn tạm biệt:", error);
    }
});