// ad-generator.js
// Calls the OpenAI API directly from the browser to turn a reference image
// + a theme into an ad visual (gpt-image-1) and a matching tagline (gpt-4o-mini).

const STORAGE_KEY = 'ad-generator-openai-key';

const form = document.getElementById('ad-form');
const apiKeyInput = document.getElementById('api-key');
const rememberKeyInput = document.getElementById('remember-key');
const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
const themeInput = document.getElementById('theme-input');
const brandInput = document.getElementById('brand-input');
const toneInput = document.getElementById('tone-input');
const formatInput = document.getElementById('format-input');
const generateBtn = document.getElementById('generate-btn');
const statusBox = document.getElementById('ad-status');
const resultBox = document.getElementById('ad-result');
const resultImage = document.getElementById('result-image');
const resultTagline = document.getElementById('result-tagline');
const downloadLink = document.getElementById('download-link');

const savedKey = localStorage.getItem(STORAGE_KEY);
if (savedKey) {
    apiKeyInput.value = savedKey;
    rememberKeyInput.checked = true;
}

imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (!file) {
        imagePreview.hidden = true;
        return;
    }
    imagePreview.src = URL.createObjectURL(file);
    imagePreview.hidden = false;
});

function setStatus(message, type) {
    statusBox.textContent = message;
    statusBox.className = 'ad-status ' + type;
    statusBox.hidden = false;
}

function clearStatus() {
    statusBox.hidden = true;
    statusBox.textContent = '';
}

async function editImage(apiKey, file, theme, brand, tone, size) {
    const prompt = [
        `Crée une image publicitaire professionnelle sur le thème "${theme}".`,
        brand ? `Le produit/la marque s'appelle "${brand}".` : '',
        `Style visuel : ${tone}.`,
        `Utilise l'image fournie comme sujet principal, améliore l'éclairage, le fond et la composition pour un rendu publicitaire de haute qualité.`,
        `Ne pas ajouter de texte incrusté dans l'image.`
    ].filter(Boolean).join(' ');

    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('image', file);
    formData.append('prompt', prompt);
    formData.append('size', size);
    formData.append('n', '1');

    const response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`
        },
        body: formData
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || `Erreur OpenAI (${response.status})`);
    }
    return data.data[0].b64_json;
}

async function generateTagline(apiKey, theme, brand, tone) {
    const userPrompt = [
        `Écris un slogan publicitaire court (1 phrase, percutant) en français`,
        `pour une publicité sur le thème "${theme}"`,
        brand ? `pour la marque/le produit "${brand}"` : '',
        `avec un ton ${tone}.`,
        `Réponds uniquement avec le slogan, sans guillemets ni explication.`
    ].filter(Boolean).join(' ');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: userPrompt }],
            temperature: 0.9
        })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || `Erreur OpenAI (${response.status})`);
    }
    return data.choices[0].message.content.trim();
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus();
    resultBox.hidden = true;

    const apiKey = apiKeyInput.value.trim();
    const file = imageInput.files[0];
    const theme = themeInput.value.trim();
    const brand = brandInput.value.trim();
    const tone = toneInput.value;
    const size = formatInput.value;

    if (!apiKey || !file || !theme) {
        setStatus('Merci de remplir la clé API, une image et un thème.', 'error');
        return;
    }

    if (rememberKeyInput.checked) {
        localStorage.setItem(STORAGE_KEY, apiKey);
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }

    generateBtn.disabled = true;
    setStatus('Génération de la visuelle publicitaire en cours (peut prendre 20-40s)...', 'info');

    try {
        const imageB64 = await editImage(apiKey, file, theme, brand, tone, size);
        const imageDataUrl = `data:image/png;base64,${imageB64}`;
        resultImage.src = imageDataUrl;
        downloadLink.href = imageDataUrl;

        setStatus('Génération du slogan...', 'info');
        const tagline = await generateTagline(apiKey, theme, brand, tone);
        resultTagline.textContent = tagline;

        clearStatus();
        resultBox.hidden = false;
    } catch (error) {
        setStatus(`Erreur : ${error.message}`, 'error');
    } finally {
        generateBtn.disabled = false;
    }
});
