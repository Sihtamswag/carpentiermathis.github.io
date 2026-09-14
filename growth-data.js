// growth-data.js
// Contenu du flux Growth : citations de personnes marquantes (domaine public)
// et réflexions originales inspirées des grands principes du développement
// personnel. Chaque carte est narrée à voix haute par la synthèse vocale
// du navigateur, comme un livre audio.

const GROWTH_CARDS = [
    {
        category: "Stoïcisme",
        text: "Tu as le pouvoir sur ton esprit, non sur les événements extérieurs. Réalise-le, et tu trouveras la force.",
        author: "Marc Aurèle",
        source: "Pensées pour moi-même",
        gradient: "linear-gradient(160deg, #1f2937, #4b5563)"
    },
    {
        category: "Discipline",
        text: "Ce n'est pas parce que les choses sont difficiles que nous n'osons pas, c'est parce que nous n'osons pas qu'elles sont difficiles.",
        author: "Sénèque",
        source: "Lettres à Lucilius",
        gradient: "linear-gradient(160deg, #7c2d12, #c2410c)"
    },
    {
        category: "Habitudes",
        text: "Chaque petite action que tu répètes aujourd'hui devient la personne que tu seras dans un an. Le progrès ne se voit jamais dans l'instant, seulement dans la répétition.",
        author: "Réflexion Growth",
        source: "Inspiré des principes sur la puissance des habitudes",
        gradient: "linear-gradient(160deg, #14532d, #22c55e)"
    },
    {
        category: "Mindset",
        text: "Ce n'est pas que je sois si intelligent, c'est que je reste plus longtemps avec les problèmes.",
        author: "Albert Einstein",
        source: "Correspondance",
        gradient: "linear-gradient(160deg, #1e3a8a, #3b82f6)"
    },
    {
        category: "Résilience",
        text: "Je ne perds jamais. Soit je gagne, soit j'apprends.",
        author: "Nelson Mandela",
        source: "Attribué",
        gradient: "linear-gradient(160deg, #4c1d95, #7c3aed)"
    },
    {
        category: "Action",
        text: "L'attente ne rend rien plus facile. Ce qui fait peur aujourd'hui fera peur demain, sauf si tu agis entre les deux. L'action est le seul remède réel à la peur.",
        author: "Réflexion Growth",
        source: "Inspiré des principes sur le courage et l'action",
        gradient: "linear-gradient(160deg, #7f1d1d, #ef4444)"
    },
    {
        category: "Sagesse",
        text: "Celui qui déplace une montagne commence par déplacer de petites pierres.",
        author: "Confucius",
        source: "Entretiens",
        gradient: "linear-gradient(160deg, #78350f, #d97706)"
    },
    {
        category: "Confiance",
        text: "Le succès, c'est aller d'échec en échec sans perdre son enthousiasme.",
        author: "Winston Churchill",
        source: "Attribué",
        gradient: "linear-gradient(160deg, #0c4a6e, #0ea5e9)"
    },
    {
        category: "Stoïcisme",
        text: "Ne cherche pas que les choses arrivent comme tu le voudrais, mais veuille qu'elles arrivent comme elles arrivent, et tu vivras heureux.",
        author: "Épictète",
        source: "Manuel",
        gradient: "linear-gradient(160deg, #1f2937, #6b7280)"
    },
    {
        category: "Mindset",
        text: "La discipline, ce n'est pas se priver. C'est choisir entre ce que tu veux maintenant et ce que tu veux le plus. Chaque jour, ce choix construit ou détruit la personne que tu deviens.",
        author: "Réflexion Growth",
        source: "Inspiré des principes sur la discipline durable",
        gradient: "linear-gradient(160deg, #312e81, #6366f1)"
    }
];
