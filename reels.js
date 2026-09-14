// reels.js
document.addEventListener('DOMContentLoaded', () => {
    const reels = document.querySelectorAll('.reel');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const video = entry.target.querySelector('.reel-video');
            if (entry.isIntersecting) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        });
    }, { threshold: 0.6 });

    reels.forEach((reel) => {
        const video = reel.querySelector('.reel-video');
        const muteBtn = reel.querySelector('.mute-btn');
        const muteIcon = muteBtn.querySelector('.icon');
        const likeBtn = reel.querySelector('.like-btn');
        const likeIcon = likeBtn.querySelector('.icon');
        const likeCount = likeBtn.querySelector('.count');
        const baseLikes = parseInt(likeCount.textContent, 10);

        observer.observe(reel);

        video.addEventListener('click', () => {
            if (video.paused) {
                video.play().catch(() => {});
            } else {
                video.pause();
            }
        });

        muteBtn.addEventListener('click', () => {
            video.muted = !video.muted;
            muteIcon.textContent = video.muted ? '🔇' : '🔊';
        });

        likeBtn.addEventListener('click', () => {
            const liked = reel.dataset.liked === 'true';
            reel.dataset.liked = (!liked).toString();
            likeIcon.textContent = liked ? '🤍' : '❤️';
            likeCount.textContent = liked ? baseLikes : baseLikes + 1;
        });

        video.addEventListener('dblclick', () => {
            if (reel.dataset.liked !== 'true') {
                likeBtn.click();
            }
        });
    });
});
