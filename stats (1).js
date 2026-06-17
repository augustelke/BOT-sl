const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// ─── Récupération des stats via fortnite-api.com ──────────────────────────────
async function fetchFortniteStats(pseudo, plateforme) {
    const url = `https://fortnite-api.com/v2/stats/br/v2?name=${encodeURIComponent(pseudo)}&accountType=${plateforme}`;
    const res  = await fetch(url);
    return res.json();
}

// ─── Définition de la commande ────────────────────────────────────────────────
const statsCommand = new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Affiche les stats Fortnite d\'un joueur')
    .addStringOption(opt =>
        opt.setName('pseudo')
            .setDescription('Pseudo Epic Games du joueur')
            .setRequired(true))
    .addStringOption(opt =>
        opt.setName('plateforme')
            .setDescription('Plateforme du compte (défaut : Epic)')
            .setRequired(false)
            .addChoices(
                { name: 'Epic Games', value: 'epic' },
                { name: 'PlayStation (PSN)', value: 'psn' },
                { name: 'Xbox (XBL)', value: 'xbl' }
            ))
    .toJSON();

// ─── Gestion de la commande ───────────────────────────────────────────────────
async function handleStats(interaction) {
    // On diffère la réponse car la requête API peut prendre du temps
    await interaction.deferReply();

    const pseudo      = interaction.options.getString('pseudo');
    const plateforme  = interaction.options.getString('plateforme') || 'epic';

    let data;
    try {
        data = await fetchFortniteStats(pseudo, plateforme);
    } catch {
        return interaction.editReply('❌ Impossible de contacter l\'API Fortnite. Réessaie plus tard.');
    }

    // Joueur introuvable
    if (data.status !== 200) {
        return interaction.editReply(
            `❌ Joueur **${pseudo}** introuvable.\n` +
            `> Vérifie que le pseudo est exact et que la bonne plateforme est sélectionnée.`
        );
    }

    const stats   = data.data;
    const overall = stats.stats?.all?.overall;

    // Profil privé ou sans stats
    if (!overall) {
        return interaction.editReply(
            `⚠️ Aucune stat disponible pour **${pseudo}**.\n` +
            `> Le profil est sûrement en privé sur Fortnite.`
        );
    }

    // Mise en forme des valeurs
    const wins       = (overall.wins       ?? 0).toLocaleString('fr-FR');
    const kills      = (overall.kills      ?? 0).toLocaleString('fr-FR');
    const matches    = (overall.matches    ?? 0).toLocaleString('fr-FR');
    const kd         = overall.kd          ? overall.kd.toFixed(2)              : 'N/A';
    const winRate    = overall.winRate     ? `${(overall.winRate * 100).toFixed(1)}%` : 'N/A';
    const killsMatch = overall.killsPerMatch ? overall.killsPerMatch.toFixed(2)  : 'N/A';
    const heures     = Math.floor((overall.minutesPlayed ?? 0) / 60).toLocaleString('fr-FR');

    const plateformeLabel = { epic: 'Epic Games', psn: 'PlayStation', xbl: 'Xbox' }[plateforme];

    const embed = new EmbedBuilder()
        .setTitle(`🎮 Stats Fortnite — ${stats.account.name}`)
        .setDescription(`Plateforme : **${plateformeLabel}**`)
        .addFields(
            { name: '🏆 Victoires',        value: wins,        inline: true },
            { name: '💀 Ratio K/D',        value: kd,          inline: true },
            { name: '📈 Taux de victoire', value: winRate,     inline: true },
            { name: '🎯 Kills totaux',     value: kills,       inline: true },
            { name: '🎮 Parties jouées',   value: matches,     inline: true },
            { name: '⚔️ Kills/partie',     value: killsMatch,  inline: true },
            { name: '⏱️ Temps de jeu',     value: `${heures}h`, inline: true },
        )
        .setColor(0x00C9FF)
        .setTimestamp()
        .setFooter({ text: 'Stats via fortnite-api.com' });

    // Ajoute l'image des stats si disponible
    if (stats.image) embed.setImage(stats.image);

    await interaction.editReply({ embeds: [embed] });
}

module.exports = { statsCommand, handleStats };
