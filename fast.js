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

async function sendJitoBundleTransaction(parsedData, action) {
    try {
        const startTime = Date.now();

        const transactionPayload = {
            publicKey: walletKeypair.publicKey.toBase58(),
            action: action, // "buy" o "sell"
            mint: parsedData.mint,
            denominatedInSol: "false",
            amount: action === "buy" ? 250000 : "100%", // Vendita 100%
            slippage: DEFAULT_SLIPPAGE,
            priorityFee: DEFAULT_PRIORITY_FEE,
            pool: "pump",
        };

        console.log(chalk.blueBright(`⏳ Start request to PumpPortal ${action}...`));
        const pumpPortalResponse = await fetch(PUMP_PORTAL_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([transactionPayload]),
        });

        const pumpPortalTime = Date.now() - startTime;
        console.log(chalk.green(`✅ PumpPortal Response Time: ${pumpPortalTime} ms`));

        if (pumpPortalResponse.status === 200) {
            const transactions = await pumpPortalResponse.json();
            const signedTransactions = transactions.map((txBase58) => {
                const tx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(txBase58)));
                tx.sign([walletKeypair]);
                return bs58.encode(tx.serialize());
            });

            console.log(chalk.blueBright("⏳ Sending Jito txn..."));
            const jitoStartTime = Date.now();
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

            const jitoTime = Date.now() - jitoStartTime;
            console.log(chalk.green(`✅ Jito Response Time:: ${jitoTime} ms`));

            if (jitoResponse.ok) {
                console.log(chalk.greenBright(`\n ✅ Jito txn sent successfully (${action})! \n`));
            } else {
                console.error(chalk.red(`\n ❌ Error sending the Jito txn (${action}) \n`));
            }
        } else {
            console.error(chalk.red(`\n ❌Error in request to PumpPortal (${action}) \n`));
        }
    } catch (error) {
        console.error(chalk.red(`\n ❌  ❌ Error sending the Jito txn (${action}): ${error.message} \n`));
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
    console.log(chalk.greenBright("\n --- 🟢 PP WebSocket connected 🟢 --- \n"));
});

wsPumpPortal.on('message', async (message) => {
    try {
        const startTime = Date.now();
        const parsedData = JSON.parse(message);
        const parseTime = Date.now() - startTime;

        console.log(chalk.green(`✅ Message parsing time: ${parseTime} ms`));

        if (parsedData.txType === "buy" && parsedData.mint && parsedData.solAmount) {
            console.log(chalk.magentaBright("\n 🚀 Immediate replication of a BUY! \n"));
            const actionStartTime = Date.now();
            await sendJitoBundleTransaction(parsedData, "buy");
            const actionTime = Date.now() - actionStartTime;
            console.log(chalk.green(`✅ Total BUY replication time: ${actionTime} ms`));
        }
        
        if (parsedData.txType === "sell" && parsedData.mint) {
            console.log(chalk.magentaBright("\n 🚀 Immediate replication of a SELL \n"));
            const actionStartTime = Date.now();
            await sendJitoBundleTransaction(parsedData, "sell");
            const actionTime = Date.now() - actionStartTime;
            console.log(chalk.green(`✅  Total SELL replication time: ${actionTime} ms`));
        }

    } catch (error) {
        console.error(chalk.red(`\n ❌ Error processing WebSocket message: ${error.message} \n`));
    }
});

wsPumpPortal.on('close', () => {
    console.error(chalk.red("\n ❌ WebSocket CLOSED. \n"));
});
