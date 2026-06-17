const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    PermissionFlagsBits,
    REST,
    Routes
} = require('discord.js');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// ─── Stockage JSON ────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'signals.json');

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return { signals: [] };
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
        return { signals: [] };
    }
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── Client Discord ───────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ─── Commandes Slash ──────────────────────────────────────────────────────────
const commands = [

    new SlashCommandBuilder()
        .setName('signal')
        .setDescription('Signaler un membre du serveur')
        .addUserOption(opt =>
            opt.setName('utilisateur')
                .setDescription('Le membre à signaler')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('raison')
                .setDescription('Raison du signalement')
                .setRequired(true)
                .addChoices(
                    { name: '🤬 Harcèlement', value: 'Harcèlement' },
                    { name: '📩 Spam',         value: 'Spam' },
                    { name: '🎮 Triche',       value: 'Triche' },
                    { name: '💢 Insultes',     value: 'Insultes' },
                    { name: '❓ Autre',        value: 'Autre' }
                ))
        .addStringOption(opt =>
            opt.setName('commentaire')
                .setDescription('Détails supplémentaires (optionnel)')
                .setRequired(false))
        .toJSON(),

    new SlashCommandBuilder()
        .setName('supsignal')
        .setDescription('Voir et supprimer vos signalements')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('adminsignal')
        .setDescription('Voir tous les signalements du serveur [ADMIN]')
        .addBooleanOption(opt =>
            opt.setName('visible')
                .setDescription('Rendre visible pour tout le monde ? (défaut : non)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON()
];

// ─── Prêt ─────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
    console.log(`✅ Bot connecté : ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Commandes /signal /supsignal /adminsignal enregistrées !');
    } catch (err) {
        console.error('❌ Erreur enregistrement commandes :', err);
    }
});

// ─── Interactions ─────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {

    // ── /signal ──────────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'signal') {
        const cible      = interaction.options.getUser('utilisateur');
        const raison     = interaction.options.getString('raison');
        const commentaire = interaction.options.getString('commentaire') || 'Aucun commentaire';

        if (cible.id === interaction.user.id) {
            return interaction.reply({ content: '❌ Tu ne peux pas te signaler toi-même !', ephemeral: true });
        }
        if (cible.bot) {
            return interaction.reply({ content: '❌ Tu ne peux pas signaler un bot.', ephemeral: true });
        }

        const data   = loadData();
        const signal = {
            id:           crypto.randomUUID(),
            reporterId:   interaction.user.id,
            reporterName: interaction.user.username,
            reportedId:   cible.id,
            reportedName: cible.username,
            raison,
            commentaire,
            timestamp:    new Date().toISOString(),
            guildId:      interaction.guildId
        };
        data.signals.push(signal);
        saveData(data);

        await interaction.reply({
            content: `✅ Signalement envoyé contre **${cible.username}** pour **${raison}**. Merci !`,
            ephemeral: true
        });
    }

    // ── /supsignal ────────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'supsignal') {
        const data       = loadData();
        const mesSignaux = data.signals.filter(
            s => s.reporterId === interaction.user.id && s.guildId === interaction.guildId
        );

        if (mesSignaux.length === 0) {
            return interaction.reply({ content: '📭 Tu n\'as fait aucun signalement pour l\'instant.', ephemeral: true });
        }

        // On prend les 25 derniers (limite Discord pour un select menu)
        const derniers = [...mesSignaux].reverse().slice(0, 25);

        const embed = new EmbedBuilder()
            .setTitle('📋 Mes signalements')
            .setDescription(
                derniers.map((s, i) =>
                    `**${i + 1}.** <@${s.reportedId}> — ${s.raison}\n` +
                    `> ${s.commentaire}\n` +
                    `> 🕐 <t:${Math.floor(new Date(s.timestamp).getTime() / 1000)}:R>`
                ).join('\n\n')
            )
            .setColor(0xE67E22)
            .setFooter({ text: 'Sélectionne un signalement dans le menu pour le supprimer' });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('supsignal_select')
            .setPlaceholder('🗑️ Choisir un signalement à supprimer...')
            .addOptions(
                derniers.map((s, i) => ({
                    label:       `${s.reportedName} — ${s.raison}`.slice(0, 100),
                    description: new Date(s.timestamp).toLocaleDateString('fr-FR'),
                    value:       s.id
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // ── Select menu suppression ───────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'supsignal_select') {
        const signalId = interaction.values[0];
        const data     = loadData();
        const index    = data.signals.findIndex(
            s => s.id === signalId && s.reporterId === interaction.user.id
        );

        if (index === -1) {
            return interaction.reply({ content: '❌ Signalement introuvable ou déjà supprimé.', ephemeral: true });
        }

        data.signals.splice(index, 1);
        saveData(data);

        await interaction.reply({ content: '✅ Signalement supprimé avec succès !', ephemeral: true });
    }

    // ── /adminsignal ──────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'adminsignal') {
        const visible  = interaction.options.getBoolean('visible') ?? false;
        const data     = loadData();
        const signaux  = data.signals.filter(s => s.guildId === interaction.guildId);

        if (signaux.length === 0) {
            return interaction.reply({ content: '📭 Aucun signalement sur ce serveur.', ephemeral: !visible });
        }

        // Compter les signalements par utilisateur signalé
        const compteur = {};
        signaux.forEach(s => {
            if (!compteur[s.reportedId]) {
                compteur[s.reportedId] = {
                    name:         s.reportedName,
                    count:        0,
                    commentaires: []
                };
            }
            compteur[s.reportedId].count++;
            if (s.commentaire && s.commentaire !== 'Aucun commentaire') {
                compteur[s.reportedId].commentaires.push(
                    `*"${s.commentaire}"* — par **${s.reporterName}** <t:${Math.floor(new Date(s.timestamp).getTime() / 1000)}:R>`
                );
            }
        });

        // Trier du plus signalé au moins signalé
        const sorted = Object.entries(compteur).sort((a, b) => b[1].count - a[1].count);

        // Classement
        const classement = sorted.map(([id, info], i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
            return `${medal} <@${id}> — **${info.count}** signalement${info.count > 1 ? 's' : ''}`;
        }).join('\n');

        // Commentaires (max 15 pour pas dépasser la limite Discord)
        const tousCommentaires = sorted.flatMap(([id, info]) =>
            info.commentaires.map(c => `<@${id}> : ${c}`)
        ).slice(0, 15);

        const embed = new EmbedBuilder()
            .setTitle('🚨 Tableau des signalements')
            .addFields(
                {
                    name:  '📊 Classement (du plus au moins signalé)',
                    value: classement || 'Aucun'
                },
                {
                    name:  '💬 Commentaires laissés',
                    value: tousCommentaires.length > 0
                        ? tousCommentaires.join('\n')
                        : 'Aucun commentaire'
                }
            )
            .setColor(0xE74C3C)
            .setTimestamp()
            .setFooter({ text: `${signaux.length} signalement${signaux.length > 1 ? 's' : ''} au total sur ce serveur` });

        await interaction.reply({ embeds: [embed], ephemeral: !visible });
    }
});

client.login(TOKEN);
