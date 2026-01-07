import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const readline = require('readline');
const config = require('./package.json');

import { ChessEngine } from './chessEngine.js';
import { ChessAI } from './ai.js';
let engine = null;
let ai = null;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on('line', (line) => {
    const tokens = line.trim().split(' ');
    const command = tokens[0];

    switch (command) {
        case 'uci':
            console.log(`id name ${config.name} v${config.version}`);
            console.log(`id author ${config.author}`);
            console.log('uciok');
            break;

        case 'isready':
            console.log('readyok');
            break;

        case 'ucinewgame':
            engine = new ChessEngine();
            ai = new ChessAI(engine, true);
            break;

        case 'position':
            // Format: position startpos moves e2e4 e7e5...
            handlePosition(tokens);
            break;

        case 'go':
            // Format: go wtime 300000 btime 300000
            handleGo(tokens);
            break;

        case 'quit':
            process.exit();
            break;
    }
});

function handlePosition(tokens) {
    let undone = false;
    do {
        undone = engine.undoMove();
    } while (undone);

    const movesIndex = tokens.indexOf('moves');

    if (movesIndex !== -1) {
        const moves = tokens.slice(movesIndex + 1);
        moves.forEach(m => {
            const move = parseUciMove(m);

            engine.MovePiece(move[0], move[1], move[2], true);
        });
    }
}

function handleGo(tokens) {
    const bestMove = ai.bestMove();

    console.log(`bestmove ${engine.getMoveUCI(bestMove)}`);
}


function parseUciMove(uciStr) {
    const fromStr = uciStr.slice(0, 2); 
    const toStr   = uciStr.slice(2, 4);
    const promo   = uciStr.length > 4 ? uciStr[4] : null;

    const fromSq = engine.notationToSquare(fromStr);
    const toSq   = engine.notationToSquare(toStr);

    return [fromSq, toSq, promo];
}