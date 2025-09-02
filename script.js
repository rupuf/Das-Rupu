// Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

let app, auth, db, userId;
let synth = window.speechSynthesis;
let utterance = new SpeechSynthesisUtterance();
let isListening = false;
let recognition;

async function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
        userId = auth.currentUser?.uid || crypto.randomUUID();
    } catch (error) {
        console.error("Firebase: Error during sign-in:", error);
    }
}

const chatContainer = document.getElementById('chat-container');
const textInput = document.getElementById('text-input');
const sendButton = document.getElementById('send-button');
const micButton = document.getElementById('mic-button');
const loadingSpinner = document.getElementById('loading-spinner');
const messageBox = document.getElementById('message-box');
const messageText = document.getElementById('message-text');
const jervisAvatar = document.getElementById('jervis-avatar');
const statusText = document.getElementById('status-text');

const API_KEY = "AIzaSyDME0J1ONDXdXy1D8EFKxIz5S_vQ8S3P50";
const MODEL_NAME = "gemini-2.5-flash-preview-05-20";

function showMessageBox(message) {
    messageText.textContent = message;
    messageBox.style.display = 'block';
}

function hideMessageBox() {
    messageBox.style.display = 'none';
}

function showLoadingSpinner() {
    loadingSpinner.style.display = 'flex';
}

function hideLoadingSpinner() {
    loadingSpinner.style.display = 'none';
}

function speak(text) {
    if (synth.speaking) {
        synth.cancel();
    }
    utterance.text = text;
    utterance.lang = 'hi-IN';
    synth.speak(utterance);
}

function addMessageToChat(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');

    if (sender === 'user') {
        messageElement.classList.add('user-message');
        messageElement.textContent = message;
    } else {
        messageElement.classList.add('jervis-message');
        const messageTextSpan = document.createElement('span');
        messageTextSpan.classList.add('message-text');
        messageTextSpan.textContent = message;
        
        const speakerIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        speakerIcon.classList.add('speaker-icon');
        speakerIcon.setAttribute("width", "24");
        speakerIcon.setAttribute("height", "24");
        speakerIcon.setAttribute("viewBox", "0 0 24 24");
        speakerIcon.setAttribute("fill", "none");
        speakerIcon.setAttribute("stroke", "currentColor");
        speakerIcon.setAttribute("stroke-width", "2");
        speakerIcon.setAttribute("stroke-linecap", "round");
        speakerIcon.setAttribute("stroke-linejoin", "round");
        speakerIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>';
        speakerIcon.dataset.text = message;

        messageElement.appendChild(messageTextSpan);
        messageElement.appendChild(speakerIcon);
        speak(message);
    }
    
    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function sendMessage(text, isVoice = false) {
    if (!text.trim()) return;

    if (!isVoice) {
        addMessageToChat(text, 'user');
        textInput.value = '';
    }

    try {
        await addDoc(collection(db, `artifacts/${appId}/public/data/messages`), {
            text: text,
            sender: userId,
            timestamp: Date.now()
        });
    } catch (e) {
        console.error("Error adding document to Firestore: ", e);
    }
    
    if (!isVoice) showLoadingSpinner();

    try {
        const payload = {
            contents: [{ parts: [{ text: text }] }],
            systemInstruction: {
                parts: [{ text: "आप एक सहायक और मैत्रीपूर्ण आवाज सहायक हैं जिसका नाम जर्विस है। अपने जवाबों को संक्षिप्त रखें। URL या HTML टैग शामिल न करें।" }]
            }
        };
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API call failed with status: ${response.status}`);
        }

        const result = await response.json();
        const replyText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (replyText) {
            if (isVoice) {
                speak(replyText);
            } else {
                addMessageToChat(replyText, 'jervis');
            }
        } else {
            throw new Error("Invalid response from API");
        }
    } catch (error) {
        console.error("Error generating AI response:", error);
        if (isVoice) {
            speak("क्षमा करें, मैं अभी प्रतिक्रिया नहीं पा सका। कृपया पुनः प्रयास करें।");
        } else {
            addMessageToChat("क्षमा करें, मैं अभी प्रतिक्रिया नहीं पा सका। कृपया पुनः प्रयास करें।", 'jervis');
        }
    } finally {
        if (!isVoice) hideLoadingSpinner();
    }
}

sendButton.addEventListener('click', () => {
    sendMessage(textInput.value);
});

textInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage(textInput.value);
    }
});

micButton.addEventListener('click', () => {
    if (!('webkitSpeechRecognition' in window)) {
        showMessageBox("भाषण पहचान इस ब्राउज़र में समर्थित नहीं है। कृपया Chrome का उपयोग करें।");
        return;
    }

    if (isListening) {
        recognition.stop();
        isListening = false;
        micButton.classList.remove('active');
        jervisAvatar.classList.remove('listening');
        statusText.textContent = 'जर्विस निष्क्रिय है';
        speak("सुनना बंद हो गया।");
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'hi-IN';

    recognition.onstart = function() {
        isListening = true;
        micButton.classList.add('active');
        jervisAvatar.classList.add('listening');
        statusText.textContent = 'जर्विस सुन रहा है...';
    };

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        console.log("Transcript:", transcript);
        sendMessage(transcript, true);
    };

    recognition.onerror = function(event) {
        console.error("भाषण पहचान त्रुटि:", event.error);
        isListening = false;
        micButton.classList.remove('active');
        jervisAvatar.classList.remove('listening');
        statusText.textContent = 'जर्विस निष्क्रिय है';
        speak("क्षमा करें, मेरे वॉइस इनपुट में दिक्कत आ रही है।");
    };

    recognition.onend = function() {
        if (isListening) {
            recognition.start();
        }
    };

    recognition.start();
});

chatContainer.addEventListener('click', (event) => {
    if (event.target.closest('.speaker-icon')) {
        const textToSpeak = event.target.closest('.speaker-icon').dataset.text;
        if (textToSpeak) {
            speak(textToSpeak);
        }
    }
});

window.onload = function() {
    initializeFirebase();
};
