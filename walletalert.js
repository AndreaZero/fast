import WebSocket from 'ws';
import fetch from 'node-fetch';

// Configurazione
const WALLET_ADDRESS = "AArPXm8JatJiuyEffuC1un2Sc835SULa4uQqDcaGpAjV"; // Sostituisci con l'indirizzo del wallet
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/your_webhook_url"; // Sostituisci con il tuo webhook Discord

// Inizializzazione WebSocket
const ws = new WebSocket('wss://pumpportal.fun/api/data');

ws.on('open', function open() {
    console.log("WebSocket connesso.");

    // Abbonamento agli scambi del wallet specifico
    const payload = {
        method: "subscribeAccountTrade",
        keys: [WALLET_ADDRESS] // Array di wallet da monitorare
    };
    ws.send(JSON.stringify(payload));
    console.log(`Abbonato alle operazioni del wallet: ${WALLET_ADDRESS}`);
});

ws.on('message', function message(data) {
    try {
        const parsedData = JSON.parse(data);
        console.log("Dati ricevuti:", parsedData);

        // Verifica che il messaggio contenga dati di interesse
        if (parsedData.type === "accountTrade") {
            const tradeDetails = parsedData.data;

            // Crea il messaggio da inviare a Discord
            const discordMessage = {
                content: `\uD83D\uDD04 Nuova operazione sul wallet **${WALLET_ADDRESS}**:
- **Token**: ${tradeDetails.token}
- **Azione**: ${tradeDetails.action} (${tradeDetails.amount} ${tradeDetails.tokenSymbol})
- **Prezzo**: ${tradeDetails.price} USDC
- **Timestamp**: ${new Date(tradeDetails.timestamp * 1000).toLocaleString()}`
            };

            // Invia il messaggio a Discord
            fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(discordMessage)
            })
            .then(response => {
                if (response.ok) {
                    console.log("Notifica inviata a Discord con successo.");
                } else {
                    console.error("Errore nell'invio della notifica a Discord:", response.statusText);
                }
            })
            .catch(err => console.error("Errore nella richiesta HTTP:", err));
        }
    } catch (error) {
        console.error("Errore durante la gestione del messaggio WebSocket:", error);
    }
});

ws.on('close', function close() {
    console.log("WebSocket chiuso.");
});

ws.on('error', function error(err) {
    console.error("Errore WebSocket:", err);
});
