const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    REST,
    Routes
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const SALON_TOURNOI = '1502723683255320646';
const SALON_ADMIN = '1502721949376188478';

// Enregistrement de la commande slash
const commands = [
    new SlashCommandBuilder()
        .setName('tournage')
        .setDescription('Créer un tournoi Fortnite')
        .addStringOption(option =>
            option.setName('nom')
                .setDescription('Nom du tournoi')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('horaires')
                .setDescription('Horaires du tournoi (ex: Samedi 20h - 22h)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description du tournoi')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON()
];

client.once('ready', async () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Commande /tournage enregistrée !');
    } catch (error) {
        console.error('Erreur enregistrement commandes :', error);
    }
});

client.on('interactionCreate', async interaction => {

    // ─── Commande /tournage ───────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'tournage') {

        if (interaction.channelId !== SALON_TOURNOI) {
            return interaction.reply({
                content: `❌ Cette commande doit être utilisée dans <#${SALON_TOURNOI}>`,
                ephemeral: true
            });
        }

        const nom = interaction.options.getString('nom');
        const horaires = interaction.options.getString('horaires');
        const description = interaction.options.getString('description');

        const embed = new EmbedBuilder()
            .setTitle(`🏆 Tournoi : ${nom}`)
            .setDescription(description)
            .addFields({ name: '⏰ Horaires', value: horaires })
            .setColor(0xF4C542)
            .setFooter({ text: 'Clique sur "Participer" pour rejoindre le tournoi !' });

        const bouton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`participer__${nom}`)
                .setLabel('🎮 Participer')
                .setStyle(ButtonStyle.Primary)
        );

        const salon = interaction.guild.channels.cache.get(SALON_TOURNOI);
        await salon.send({ embeds: [embed], components: [bouton] });
        await interaction.reply({ content: '✅ Tournoi créé avec succès !', ephemeral: true });
    }

    // ─── Bouton "Participer" ──────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('participer__')) {
        const nomTournoi = interaction.customId.replace('participer__', '');

        const modal = new ModalBuilder()
            .setCustomId(`formulaire__${nomTournoi}`)
            .setTitle(`Inscription : ${nomTournoi}`);

        const plateforme = new TextInputBuilder()
            .setCustomId('plateforme')
            .setLabel('Plateforme (PC, PS4, PS5, Xbox, Switch...)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex : PC')
            .setRequired(true);

        const pseudo = new TextInputBuilder()
            .setCustomId('pseudo')
            .setLabel('Pseudo Fortnite')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ton pseudo exact dans Fortnite')
            .setRequired(true);

        const age = new TextInputBuilder()
            .setCustomId('age')
            .setLabel('Âge')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex : 18')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(plateforme),
            new ActionRowBuilder().addComponents(pseudo),
            new ActionRowBuilder().addComponents(age)
        );

        await interaction.showModal(modal);
    }

    // ─── Formulaire soumis ────────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('formulaire__')) {
        const nomTournoi = interaction.customId.replace('formulaire__', '');
        const plateforme = interaction.fields.getTextInputValue('plateforme');
        const pseudo = interaction.fields.getTextInputValue('pseudo');
        const age = interaction.fields.getTextInputValue('age');

        const salonAdmin = interaction.guild.channels.cache.get(SALON_ADMIN);

        const embed = new EmbedBuilder()
            .setTitle(`📋 Nouvelle demande — ${nomTournoi}`)
            .addFields(
                { name: '👤 Joueur', value: `<@${interaction.user.id}>`, inline: true },
                { name: '🎮 Plateforme', value: plateforme, inline: true },
                { name: '🏷️ Pseudo Fortnite', value: pseudo, inline: true },
                { name: '🎂 Âge', value: age, inline: true }
            )
            .setColor(0x3498DB)
            .setTimestamp()
            .setFooter({ text: `ID : ${interaction.user.id}` });

        const boutons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`accepter__${interaction.user.id}__${nomTournoi}`)
                .setLabel('✅ Accepter')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`refuser__${interaction.user.id}__${nomTournoi}`)
                .setLabel('❌ Refuser')
                .setStyle(ButtonStyle.Danger)
        );

        await salonAdmin.send({ embeds: [embed], components: [boutons] });
        await interaction.reply({
            content: '✅ Ta demande a bien été envoyée ! Tu recevras une notification.',
            ephemeral: true
        });
    }

    // ─── Boutons Accepter / Refuser ───────────────────────────────────────
    if (interaction.isButton() &&
        (interaction.customId.startsWith('accepter__') || interaction.customId.startsWith('refuser__'))) {

        const parts = interaction.customId.split('__');
        const action = parts[0];
        const userId = parts[1];
        const nomTournoi = parts[2];

        let membre;
        try {
            membre = await interaction.guild.members.fetch(userId);
        } catch {
            return interaction.reply({ content: '❌ Impossible de trouver ce joueur.', ephemeral: true });
        }

        if (action === 'accepter') {
            // Notif DM au joueur
            try {
                await membre.send(
                    `🎉 **Félicitations !** Tu as été **accepté(e)** dans le tournoi **${nomTournoi}** !\n` +
                    `Prépare-toi bien, bonne chance ! 🏆`
                );
            } catch {
                console.log(`Impossible d'envoyer un DM à ${userId}`);
            }

            const embedMaj = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0x2ECC71)
                .setFooter({ text: `✅ Accepté par ${interaction.user.tag}` });

            await interaction.update({ embeds: [embedMaj], components: [] });

        } else {
            // Notif DM au joueur
            try {
                await membre.send(
                    `❌ Ta demande de participation au tournoi **${nomTournoi}** a été **refusée**.\n` +
                    `Tu peux retenter ta chance pour le prochain tournoi !`
                );
            } catch {
                console.log(`Impossible d'envoyer un DM à ${userId}`);
            }

            const embedMaj = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0xE74C3C)
                .setFooter({ text: `❌ Refusé par ${interaction.user.tag}` });

            await interaction.update({ embeds: [embedMaj], components: [] });
        }
    }
});

client.login(TOKEN);
