import { WebSocket } from 'ws'; // WebSocket Client
import { VersionedTransaction, Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import fetch from 'node-fetch';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config(); // Carica le variabili dal file .env

// Configurazioni principali
const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const MONITORED_WALLET = process.env.MONITORED_WALLET;
const WALLET_SECRET_KEY = process.env.WALLET_SECRET_KEY;
const DEFAULT_SLIPPAGE = parseFloat(process.env.DEFAULT_SLIPPAGE);
const DEFAULT_PRIORITY_FEE = parseFloat(process.env.DEFAULT_PRIORITY_FEE);
const PUMP_PORTAL_WS = process.env.PUMP_PORTAL_WS;
const PUMP_PORTAL_API = process.env.PUMP_PORTAL_API;
const JITO_BUNDLE_API = process.env.JITO_BUNDLE_API;

// Inizializza connessione e chiave del wallet
const web3Connection = new Connection(RPC_ENDPOINT, 'confirmed');
const walletKeypair = Keypair.fromSecretKey(bs58.decode(WALLET_SECRET_KEY));

// WebSocket verso pumpportal.fun
const wsPumpPortal = new WebSocket(PUMP_PORTAL_WS);

async function sendJitoBundleTransaction(parsedData) {
    try {
        const transactionPayload = {
            publicKey: walletKeypair.publicKey.toBase58(),
            action: "buy",
            mint: parsedData.mint,
            denominatedInSol: "false",
            amount: 250000,
            slippage: DEFAULT_SLIPPAGE,
            priorityFee: DEFAULT_PRIORITY_FEE,
            pool: "pump",
        };

        const pumpPortalResponse = await fetch(PUMP_PORTAL_API, {
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

            const jitoResponse = await fetch(JITO_BUNDLE_API, {
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
