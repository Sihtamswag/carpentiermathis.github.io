// growth.js
// Rend le flux de cartes à partir de GROWTH_CARDS (growth-data.js) et narre
// chaque citation à voix haute avec la synthèse vocale du navigateur,
// façon livre audio, quand la carte est à l'écran.

document.addEventListener('DOMContentLoaded', () => {
    const feed = document.getElementById('growthFeed');
    const synth = window.speechSynthesis;
    let frenchVoice = null;

    function pickVoice() {
        if (!synth) return;
        const voices = synth.getVoices();
        frenchVoice = voices.find((v) => v.lang && v.lang.startsWith('fr')) || voices[0] || null;
    }

    if (synth) {
        pickVoice();
        synth.addEventListener('voiceschanged', pickVoice);
    }

    GROWTH_CARDS.forEach((data, index) => {
        const card = document.createElement('section');
        card.className = 'growth-card';
        card.dataset.liked = 'false';
        card.dataset.saved = 'false';
        card.style.background = data.gradient;

        card.innerHTML = `
            <span class="growth-tag">${data.category}</span>
            <div class="growth-quote-wrap">
                <p class="growth-quote">« ${data.text} »</p>
                <p class="growth-author">${data.author}</p>
                <p class="growth-source">${data.source}</p>
            </div>
            <div class="growth-waveform"><span></span><span></span><span></span><span></span></div>
            <p class="growth-play-hint">Touche la carte pour lecture / pause</p>
            <div class="growth-narration-bar"><div class="growth-narration-progress"></div></div>
            <div class="growth-actions">
                <button class="growth-btn like-btn" aria-label="J'aime">
                    <span class="icon">🤍</span>
                    <span class="count">${40 + index * 7}</span>
                </button>
                <button class="growth-btn save-btn" aria-label="Sauvegarder">
                    <span class="icon">🔖</span>
                    <span class="count">Garder</span>
                </button>
                <button class="growth-btn share-btn" aria-label="Partager">
                    <span class="icon">↗️</span>
                    <span class="count">Partager</span>
                </button>
            </div>
        `;

        feed.appendChild(card);

        const progressBar = card.querySelector('.growth-narration-progress');
        const likeBtn = card.querySelector('.like-btn');
        const likeIcon = likeBtn.querySelector('.icon');
        const likeCount = likeBtn.querySelector('.count');
        const baseLikes = parseInt(likeCount.textContent, 10);

        const saveBtn = card.querySelector('.save-btn');
        const saveIcon = saveBtn.querySelector('.icon');
        const saveLabel = saveBtn.querySelector('.count');

        const shareBtn = card.querySelector('.share-btn');
        const shareLabel = shareBtn.querySelector('.count');

        let utterance = null;

        function speakCard() {
            if (!synth) return;
            synth.cancel();
            const fullText = `${data.text}. — ${data.author}.`;
            utterance = new SpeechSynthesisUtterance(fullText);
            utterance.lang = 'fr-FR';
            if (frenchVoice) utterance.voice = frenchVoice;
            utterance.rate = 0.95;
            utterance.onboundary = (e) => {
                const pct = Math.min(100, (e.charIndex / fullText.length) * 100);
                progressBar.style.width = pct + '%';
            };
            utterance.onend = () => {
                progressBar.style.width = '100%';
                card.classList.remove('is-playing');
            };
            synth.speak(utterance);
            card.classList.add('is-playing');
        }

        function pauseCard() {
            if (synth && synth.speaking) synth.pause();
            card.classList.remove('is-playing');
        }

        function resumeCard() {
            if (synth && synth.paused) {
                synth.resume();
                card.classList.add('is-playing');
            }
        }

        card.addEventListener('click', (e) => {
            if (e.target.closest('.growth-btn')) return;
            if (card.classList.contains('is-playing')) {
                pauseCard();
            } else if (synth && synth.paused) {
                resumeCard();
            } else {
                speakCard();
            }
        });

        likeBtn.addEventListener('click', () => {
            const liked = card.dataset.liked === 'true';
            card.dataset.liked = (!liked).toString();
            likeIcon.textContent = liked ? '🤍' : '❤️';
            likeCount.textContent = liked ? baseLikes : baseLikes + 1;
        });

        saveBtn.addEventListener('click', () => {
            const saved = card.dataset.saved === 'true';
            card.dataset.saved = (!saved).toString();
            saveIcon.textContent = saved ? '🔖' : '✅';
            saveLabel.textContent = saved ? 'Garder' : 'Gardé';
        });

        shareBtn.addEventListener('click', async () => {
            const shareText = `« ${data.text} » — ${data.author}`;
            try {
                if (navigator.share) {
                    await navigator.share({ text: shareText });
                } else if (navigator.clipboard) {
                    await navigator.clipboard.writeText(shareText);
                    shareLabel.textContent = 'Copié !';
                    setTimeout(() => { shareLabel.textContent = 'Partager'; }, 1500);
                }
            } catch (err) {
                // partage annulé par l'utilisateur, rien à faire
            }
        });

        card._growth = { speakCard, pauseCard };
    });

    const cards = feed.querySelectorAll('.growth-card');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const card = entry.target;
            if (entry.isIntersecting) {
                card._growth.speakCard();
            } else if (synth) {
                synth.cancel();
                card.classList.remove('is-playing');
                const bar = card.querySelector('.growth-narration-progress');
                bar.style.width = '0%';
            }
        });
    }, { threshold: 0.6 });

    cards.forEach((card) => observer.observe(card));
});
