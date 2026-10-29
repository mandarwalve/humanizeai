// DOM Elements
const inputText = document.getElementById('inputText');
const outputText = document.getElementById('outputText');
const contentType = document.getElementById('contentType');
const contentTone = document.getElementById('contentTone');
const humanizeBtn = document.getElementById('humanizeBtn');
const btnText = document.getElementById('btnText');
const loader = document.getElementById('loader');
const copyBtn = document.getElementById('copyBtn');
const copyBtnLabel = document.getElementById('copyBtnLabel');
const clearBtn = document.getElementById('clearBtn');
const sampleBtn = document.getElementById('sampleBtn');
const inputStats = document.getElementById('inputStats');
const outputStats = document.getElementById('outputStats');
const speedMetric = document.getElementById('speedMetric');
const humanScoreBadge = document.getElementById('humanScoreBadge');
const streamingGlow = document.getElementById('streamingGlow');

// Dark Mode Elements
const themeToggle = document.getElementById('themeToggle');
const moonIcon = document.getElementById('moonIcon');
const sunIcon = document.getElementById('sunIcon');
const themeToggleText = document.getElementById('themeToggleText');

// Initialize Theme
function applyTheme(isDark) {
    if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        moonIcon.classList.add('hidden');
        sunIcon.classList.remove('hidden');
        if (themeToggleText) themeToggleText.textContent = 'Light Mode';
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        moonIcon.classList.remove('hidden');
        sunIcon.classList.add('hidden');
        if (themeToggleText) themeToggleText.textContent = 'Dark Mode';
        localStorage.setItem('theme', 'light');
    }
}

// Check saved theme or system preference
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    applyTheme(true);
} else {
    applyTheme(false);
}

// Toggle Theme on Click
themeToggle.addEventListener('click', () => {
    const isCurrentlyDark = document.documentElement.classList.contains('dark');
    applyTheme(!isCurrentlyDark);
});

// Sample prompts for quick 1-click test
const samples = {
    text: `Furthermore, in today's rapidly evolving technological landscape, it is imperative to recognize that artificial intelligence serves as a profound catalyst for multifaceted business transformation. Moreover, by harnessing state-of-the-art computational algorithms, forward-thinking organizations can seamlessly optimize operational workflows and enhance synergistic productivity across disparate domains. In conclusion, embracing this transformative paradigm remains paramount.`,
    code: `// Function to process user credentials
function validateAndAuthenticateUser(userDataObject) {
    if (userDataObject !== null && userDataObject !== undefined) {
        if (userDataObject.hasOwnProperty('username') && userDataObject.hasOwnProperty('password')) {
            const isUsernameValid = typeof userDataObject.username === 'string' && userDataObject.username.length > 3;
            const isPasswordValid = typeof userDataObject.password === 'string' && userDataObject.password.length >= 8;
            if (isUsernameValid === true && isPasswordValid === true) {
                return { success: true, message: "Authentication sequence executed successfully." };
            }
        }
    }
    return { success: false, message: "Authentication sequence encountered a failure." };
}`,
    email: `Dear Esteemed Colleague,

I am writing this communication to respectfully follow up on our previous discourse regarding the impending project deliverables. It is crucial to note that we must expedite the synergistic deliverables in order to ensure optimal alignment with organizational objectives.

Furthermore, please review the attached documentation at your earliest convenience and furnish your valuable feedback.

Sincerely and with warm regards,
Alexander`
};

// Update Input Stats
function updateInputStats() {
    const text = inputText.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = inputText.value.length;
    inputStats.textContent = `${words} words • ${chars} chars`;
}

// Update Output Stats
function updateOutputStats(text) {
    const clean = (text || '').trim();
    const words = clean ? clean.split(/\s+/).length : 0;
    outputStats.textContent = `${words} words`;
}

inputText.addEventListener('input', updateInputStats);

// Sample Button Handler
sampleBtn.addEventListener('click', () => {
    const type = contentType.value;
    inputText.value = samples[type] || samples.text;
    updateInputStats();
    inputText.focus();
});

// Clear Button Handler
clearBtn.addEventListener('click', () => {
    inputText.value = '';
    outputText.textContent = 'Your humanized content will appear here instantly...';
    outputText.classList.remove('active', 'streaming-cursor');
    humanScoreBadge.classList.add('hidden');
    speedMetric.textContent = 'Ready';
    updateInputStats();
    updateOutputStats('');
});

// Conversion Logic with SSE Streaming
humanizeBtn.addEventListener('click', async () => {
    const text = inputText.value.trim();
    const type = contentType.value;
    const tone = contentTone.value;

    if (!text) {
        alert('Please enter or paste some text first, or click "Load Sample"!');
        inputText.focus();
        return;
    }

    // UI Loading State
    humanizeBtn.disabled = true;
    humanizeBtn.classList.add('opacity-75', 'cursor-not-allowed');
    loader.classList.remove('hidden');
    btnText.textContent = 'Converting...';
    streamingGlow.classList.remove('hidden');

    outputText.textContent = '';
    outputText.classList.add('active', 'streaming-cursor');
    humanScoreBadge.classList.add('hidden');
    speedMetric.textContent = 'Connecting...';

    const startTime = performance.now();
    let accumulatedText = '';

    try {
        // Attempt fast streaming via Server-Sent Events endpoint
        const response = await fetch('/api/humanize-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, type, tone })
        });

        if (!response.ok || !response.body) {
            throw new Error(`Server returned status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop(); // keep remainder

            for (const line of lines) {
                if (line.startsWith('event: error')) {
                    const dataMatch = line.match(/data: (.*)/);
                    if (dataMatch) {
                        const err = JSON.parse(dataMatch[1]);
                        throw new Error(err.message || 'Stream error');
                    }
                } else if (line.startsWith('event: chunk')) {
                    const dataMatch = line.match(/data: (.*)/);
                    if (dataMatch) {
                        try {
                            const data = JSON.parse(dataMatch[1]);
                            if (data.text) {
                                accumulatedText += data.text;
                                outputText.textContent = accumulatedText;
                                updateOutputStats(accumulatedText);
                                outputText.scrollTop = outputText.scrollHeight;
                            }
                        } catch (e) {
                            // continue on parse edge cases
                        }
                    }
                }
            }
        }

        // If for any reason accumulated text is empty, fallback to regular JSON API
        if (!accumulatedText.trim()) {
            const fallbackRes = await fetch('/api/humanize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, type, tone })
            });
            const fallbackData = await fallbackRes.json();
            if (fallbackData.error) throw new Error(fallbackData.error);
            accumulatedText = fallbackData.humanizedText;
            outputText.textContent = accumulatedText;
            updateOutputStats(accumulatedText);
        }

        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        speedMetric.textContent = `Done in ${elapsed}s`;
        humanScoreBadge.classList.remove('hidden');

    } catch (error) {
        console.error('Humanize error:', error);
        outputText.textContent = `Error: ${error.message}\n\nPlease check that your Gemini API key in .env has available quota or retry in a moment.`;
        outputText.classList.remove('active');
        speedMetric.textContent = 'Failed';
    } finally {
        humanizeBtn.disabled = false;
        humanizeBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        loader.classList.add('hidden');
        btnText.textContent = 'Humanize Content';
        streamingGlow.classList.add('hidden');
        outputText.classList.remove('streaming-cursor');
    }
});

// Robust Copy to Clipboard with fallback
copyBtn.addEventListener('click', async () => {
    const text = outputText.textContent.trim();
    if (!text || text.startsWith('Your humanized content') || text.startsWith('Error:')) {
        return;
    }

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            // Fallback for non-https or restricted environments
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }

        copyBtnLabel.textContent = 'Copied!';
        const isDark = document.documentElement.classList.contains('dark');
        if (isDark) {
            copyBtn.classList.add('bg-white', 'text-black', 'border-white');
        } else {
            copyBtn.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
        }
        setTimeout(() => {
            copyBtnLabel.textContent = 'Copy Text';
            copyBtn.classList.remove('bg-white', 'text-black', 'border-white', 'bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
        }, 2000);
    } catch (err) {
        console.error('Failed to copy: ', err);
        alert('Could not copy text automatically. Please select and copy manually.');
    }
});
