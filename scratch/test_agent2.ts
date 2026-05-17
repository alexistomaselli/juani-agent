import { processOperatorMessage } from '../src/agents/operadorAgent.js';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    try {
        console.log("Testing processOperatorMessage...");
        const res = await processOperatorMessage('3388555123', 'Ariel Perez quiere 2 prepizzetas más, ya me pagó (whatsapp 3388555123)');
        console.log("Result:", res);
    } catch (e) {
        console.error("Fatal Error:", e);
    }
}

main();
