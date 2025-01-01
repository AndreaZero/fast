import { WebSocket } from 'ws'; // WebSocket Client
import { VersionedTransaction, Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import fetch from 'node-fetch';
import chalk from 'chalk';

// Configurazioni principali
const RPC_ENDPOINT = "https://mainnet.helius-rpc.com/?api-key=682e6238-288a-4334-af78-69dc554da3d7";
const MONITORED_WALLET = "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj";
const WALLET_SECRET_KEY = "66176fzGQwArXZcCQBMeeSaw7TLAnmG3pVBXMrRn97iHhuBxq8uPDkVJweKNr5H4GUKJJkAM6AZwuDsu6JwSAETW";
const DEFAULT_SLIPPAGE = 3;
const DEFAULT_PRIORITY_FEE = 0.01;

// Inizializza connessione e chiave del wallet
const web3Connection = new Connection(RPC_ENDPOINT, 'confirmed');
const walletKeypair = Keypair.fromSecretKey(bs58.decode(WALLET_SECRET_KEY));

// WebSocket verso pumpportal.fun
const wsPumpPortal = new WebSocket('wss://pumpportal.fun/api/data');

async function sendJitoBundleTransaction(parsedData) {
    try {
        // Crea una richiesta per inviare la transazione
        const transactionPayload = {
            publicKey: walletKeypair.publicKey.toBase58(),
            action: "buy",
            mint: parsedData.mint,
            denominatedInSol: "false",
            amount: 250000, // Valore da replicare immediatamente
            slippage: DEFAULT_SLIPPAGE,
            priorityFee: DEFAULT_PRIORITY_FEE,
            pool: "pump",
        };

        const pumpPortalResponse = await fetch(`https://pumpportal.fun/api/trade-local`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([transactionPayload]),
        });

        if (pumpPortalResponse.status === 200) {
            const transactions = await pumpPortalResponse.json();
            const signedTransactions = transactions.map((txBase58) => {
                const tx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(txBase58)));
                tx.sign([walletKeypair]);
                return bs58.encode(tx.serialize());
            });

            const jitoResponse = await fetch(`https://mainnet.block-engine.jito.wtf/api/v1/bundles`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "sendBundle",
                    params: [signedTransactions],
                }),
            });

            if (jitoResponse.ok) {
                console.log(chalk.greenBright("\n ✅ Jito bundle inviato con successo! \n"));
            } else {
                console.error(chalk.red("\n ❌ Errore nell'invio del Jito bundle \n"));
            }
        } else {
            console.error(chalk.red("\n ❌ Errore nella richiesta al PumpPortal \n"));
        }
    } catch (error) {
        console.error(chalk.red(`\n ❌ Errore nell'invio del Jito bundle: ${error.message} \n`));
    }
}

// Gestione dei messaggi WebSocket
wsPumpPortal.on('open', () => {
    wsPumpPortal.send(
        JSON.stringify({
            method: "subscribeAccountTrade",
            keys: [MONITORED_WALLET],
        })
    );
    console.log(chalk.greenBright("\n --- 🟢 WebSocket connesso 🟢 --- \n"));
});

wsPumpPortal.on('message', async (message) => {
    try {
        const parsedData = JSON.parse(message);
        if (parsedData.txType === "buy" && parsedData.mint && parsedData.solAmount) {
            console.log(chalk.magentaBright("\n 🚀 Replica immediata di una BUY! \n"));
            await sendJitoBundleTransaction(parsedData);
        }
    } catch (error) {
        console.error(chalk.red(`\n ❌ Errore nel processamento del messaggio WebSocket: ${error.message} \n`));
    }
});

wsPumpPortal.on('close', () => {
    console.error(chalk.red("\n ❌ WebSocket disconnesso \n"));
});
