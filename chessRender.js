import { delay } from './utils.js';

export class ChessRender {
    constructor(engine = null) {
        this.engine = engine;
        engine.renderer = this;

        this.boardEl = null;
        this.turnDisplay = null;
        this.logDisplay = null;

        this.promotionScreen = null;
        this.endScreen = null;

        this.lastSelected = null;
        this.lastPromote = null;

        this.dragging = false;
        this.dragEl = null;

        this.whiteCapturesEl = null;
        this.whiteCaptures = [];
        this.whitePoints = 0;
        this.whiteKingChecked = false;
        this.blackCapturesEl = null;
        this.blackCaptures = [];
        this.blackPoints = 0;
        this.blackKingChecked = false;

        this.assetPrefix = './assets/chess.com_';
        this.sounds = [
            this.assetPrefix + 'move-self' + '.webm',
            this.assetPrefix + 'capture' + '.webm',
            this.assetPrefix + 'move-check' + '.webm',
            this.assetPrefix + 'promote' + '.webm',
            this.assetPrefix + 'castle' + '.webm',
        ]
        this.playableSounds = [];
    }

    BeginPlay() {
        this.boardEl = document.getElementById('board');
        this.turnDisplay = document.getElementById('turn-display');
        this.logDisplay = document.getElementById('log-display');
        this.whiteCapturesEl = document.getElementById('whiteOpponent').children[1];
        this.blackCapturesEl = document.getElementById('blackOpponent').children[1];
        this.promotionScreen = document.getElementById('promotion-screen');
        this.dragEl = document.getElementById('drag-piece');
        this.endScreen = document.getElementById('end-screen');

        this.boardEl.style.gridTemplateRows = `repeat(${this.engine.rows}, minmax(0, 1fr))`;
        this.boardEl.style.gridTemplateColumns = `repeat(${this.engine.cols}, minmax(0, 1fr))`;

        this.dragEl.style.height = (100 / this.engine.rows) + '%';
        this.dragEl.style.width = 100 / this.engine.cols + '%';

        for (let row = 0; row < this.engine.rows; row++) {
            for (let col = 0; col < this.engine.cols; col++) {
                const sq = document.createElement('button');
                sq.classList.add('square');
                sq.dataset.rank = this.engine.rows - row;
                sq.dataset.file = String.fromCharCode(97 + col);

                sq.dataset.row = row;
                sq.dataset.col = col;

                if ((row + col) % 2 === 1) {
                    sq.classList.add('dark');
                }

                if (row == 0 && col == 0) sq.classList.add('top-left');
                else if (row == 0 && col == this.engine.cols - 1) sq.classList.add('top-right');
                else if (row == this.engine.rows - 1 && col == 0) sq.classList.add('bot-left');
                else if (row == this.engine.rows - 1 && col == this.engine.cols - 1) sq.classList.add('bot-right');

                this.boardEl.appendChild(sq);

                this.UpdateSquare(row, col);
            }
        }

        this.UpdateGame();

        for (let i = 0; i < this.sounds.length; i++) {
            this.playableSounds.push(new Audio(this.sounds[i]));
        }

        this.promotionScreen.style.height = (100 / this.engine.rows) * this.engine.promoPieces.length + '%';
        this.promotionScreen.style.width = 100 / this.engine.cols + '%';

        for (let i = 0; i < this.engine.promoPieces.length; i++) {
            const promoPiece = this.engine.promoPieces[i];

            const pmSq = document.createElement('button');
            pmSq.classList.add('square');
            pmSq.classList.add('promotion');
            pmSq.dataset.piece = promoPiece;

            this.promotionScreen.appendChild(pmSq);
        }

        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }


    UpdateSquare(row, col) {
        const sq = this.boardEl.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
            if (!sq) return;

        const piece = this.engine.getPiece(row, col);

        if (piece == '.') {
            sq.style.setProperty('--bg-img', ``);
            return;
        }

        sq.style.setProperty('--bg-img', `url(${this.assetPrefix + (this.engine.isWhitePiece(piece) ? 'w' : 'b') + piece.toLowerCase()}.png)`);
    }

    UpdateGame() {
        // Turn
        this.turnDisplay.textContent = this.engine.turn == 0 ? 'White' : 'Black';

        // Highlight last move
        document.querySelectorAll('.selected').forEach(sq => sq.classList.remove('selected'));
        document.querySelectorAll('.light-selected').forEach(sq => sq.classList.remove('light-selected'));
        if (this.engine.logs.length > 0) {
            const lastMove = this.engine.logs[this.engine.logs.length - 1];
            const { r: fr, c: fc } = this.engine.fromSq(lastMove.fromSq);
            const { r: tr, c: tc } = this.engine.fromSq(lastMove.toSq);

            const fsq = this.boardEl.querySelector(`.square[data-row="${fr}"][data-col="${fc}"]`);
                if (!fsq) return;
            const tsq = this.boardEl.querySelector(`.square[data-row="${tr}"][data-col="${tc}"]`);
                if (!tsq) return;
            
            fsq.classList.add('light-selected');
            tsq.classList.add('selected');
        }

        // Captures
        this.whiteCapturesEl.children[0].innerHTML = '';
        for (let i = 0; i < this.whiteCaptures.length; i++) {
            const li = document.createElement('li');
            li.textContent = this.whiteCaptures[i].toUpperCase();

            this.whiteCapturesEl.children[0].appendChild(li);
        }

        const whiteDiff = this.whitePoints - this.blackPoints;
        this.whiteCapturesEl.children[1].textContent = whiteDiff === 0 ? '⠀' : (whiteDiff > 0 ? `+${whiteDiff}` : `${whiteDiff}`);


        this.blackCapturesEl.children[0].innerHTML = '';
        for (let i = 0; i < this.blackCaptures.length; i++) {
            const li = document.createElement('li');
            li.textContent = this.blackCaptures[i].toUpperCase();

            this.blackCapturesEl.children[0].appendChild(li);
        }

        const blackDiff = -whiteDiff;
        this.blackCapturesEl.children[1].textContent = blackDiff === 0 ? '⠀' : (blackDiff > 0 ? `+${blackDiff}` : `${blackDiff}`);

        // Checks
        document.querySelectorAll('.checked').forEach(sq => sq.classList.remove('checked'));

        if (this.whiteKingChecked) {
            const kingSq = this.engine.getKing(true);
            const { r, c } = this.engine.fromSq(kingSq);

            const sq = document.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
            if (sq) sq.classList.add('checked');
        }
        if (this.blackKingChecked) {
            const kingSq = this.engine.getKing(false);
            const { r, c } = this.engine.fromSq(kingSq);

            const sq = document.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
            if (sq) sq.classList.add('checked');
        }

        // End Game
        if (this.engine.gameCondition.startsWith('WHITE_WINS')) {
            this.endScreen.classList.remove('hidden');

            this.endScreen.classList.remove('lost');
            this.endScreen.classList.remove('draw');
            this.endScreen.classList.add('won');

            this.endScreen.children[0].children[1].children[0].textContent = 'White Won!';
            this.endScreen.children[0].children[1].children[1].textContent = 'by ' + this.engine.gameCondition.split('_').slice(2).join(' ').toLowerCase();
        } else if (this.engine.gameCondition.startsWith('BLACK_WINS')) {
            this.endScreen.classList.remove('hidden');

            this.endScreen.classList.remove('lost');
            this.endScreen.classList.remove('draw');
            this.endScreen.classList.add('won');

            this.endScreen.children[0].children[1].children[0].textContent = 'Black Won!';
            this.endScreen.children[0].children[1].children[1].textContent = 'by ' + this.engine.gameCondition.split('_').slice(2).join(' ').toLowerCase();
        } else if (this.engine.gameCondition.startsWith('DRAW')) {
            this.endScreen.classList.remove('hidden');

            this.endScreen.classList.remove('lost');
            this.endScreen.classList.remove('won');
            this.endScreen.classList.add('draw');

            this.endScreen.children[0].children[1].children[0].textContent = 'Draw!';
            this.endScreen.children[0].children[1].children[1].textContent = 'by ' + this.engine.gameCondition.split('_').slice(1).join(' ').toLowerCase();
        }
    }

    AddToLog() {
        const notaion = this.engine.getMoveNotation(this.engine.logs[this.engine.logs.length - 1]);
            if (notaion == '' || !notaion) return;

        const li = document.createElement('li');
        li.textContent = notaion;

        this.logDisplay.appendChild(li);

        this.logDisplay.scrollTop = this.logDisplay.scrollHeight;
    }

    RemoveFromLog() {
        this.logDisplay.children[this.logDisplay.children.length - 1].remove();
    }


    onMouseDown(e) {
        let selected = false;
        if (e.target.classList.contains('square') && !e.target.classList.contains('promotion')) selected = this.onSquareClick(e);
        if (!e.target.classList.contains('square') || !selected) {
            this.lastSelected = null;
            this.desHighlightMoves();
        }

        if (e.target.classList.contains('square') && e.target.classList.contains('promotion')) this.onPromoClick(e);
        this.lastPromote = null;
        this.promotionScreen.classList.add('hidden');

        if (selected && this.lastSelected) {
            this.dragging = true;

            this.dragEl.classList.remove('hidden');

            const sq = document.querySelector(`.square[data-row="${this.lastSelected.row}"][data-col="${this.lastSelected.col}"]`);
            this.dragEl.style.setProperty('--bg-img', sq.style.getPropertyValue('--bg-img'));
            sq.style.setProperty('--bg-img', ``);

            this.onMouseMove(e);
        }
    }

    onMouseMove(e) {
        if (this.dragging) {
            const rect = this.boardEl.getBoundingClientRect();

            this.dragEl.style.left = e.clientX - rect.left + 'px';
            this.dragEl.style.top = e.clientY - rect.top + 'px';
        }
    }

    onMouseUp(e) {
        if (this.dragging) {
            this.dragEl.classList.add('hidden');
            this.dragging = false;

            const sq = document.querySelector(`.square[data-row="${this.lastSelected.row}"][data-col="${this.lastSelected.col}"]`);
            sq.style.setProperty('--bg-img', this.dragEl.style.getPropertyValue('--bg-img'));
            this.dragEl.style.setProperty('--bg-img', ``);

            const target = document.elementFromPoint(e.clientX, e.clientY);
            const selected = this.onSquareClick({ target });
            if (!selected) {
                this.lastSelected = null;
                this.desHighlightMoves();
            }
        }
    }

    onSquareClick(e) {
        // Case 1: not his turn -> deselect
        if ((this.engine.turn == 0 && this.engine.whiteAI != null) || (this.engine.turn == 1 && this.engine.blackAI != null)) {
            console.log('AIs turn');

            return false;
        }

        const row = +e.target.dataset.row;
        const col = +e.target.dataset.col;

        console.log('Square: ', this.engine.toSq(row, col));

        const clickedSame =
            this.lastSelected &&
            this.lastSelected.row === row &&
            this.lastSelected.col === col;

        // Case 2: clicking same square -> ignore
        if (clickedSame) return true;

        // Case 3: has previous target and a valid new target -> move piece
        if (this.lastSelected != null && e.target.classList.contains('highlight')) {
            const fromSq = this.engine.toSq(this.lastSelected?.row, this.lastSelected?.col);
            const toSq = this.engine.toSq(row, col);

            console.log('Move from', fromSq, 'to', toSq);
            this.engine.MovePiece(fromSq, toSq);

            return false;
        }

        const piece = this.engine.getPiece(row, col);

        // Case 4: click on empty square -> clear selection
        if (this.engine.isEmptyPiece
            (piece)) {
            console.log('Clicked empty -> clear selection');

            return false;
        }

        // Case 5: click on piece of the oponent → clear selection
        if ((this.engine.isWhitePiece(piece) && this.engine.turn != 0) || (this.engine.isBlackPiece(piece) && this.engine.turn != 1)) {
            console.log('Clicked oponent piece -> clear selection');

            return false;
        }

        // Case 6: click on a piece -> select        
        this.lastSelected = { row, col };

        this.highlightMoves(row, col);

        return true;
    }

    highlightMoves(row, col) {
        this.desHighlightMoves();

        const moves = this.engine.getLegalMoves(this.engine.toSq(row, col));
        console.log('getLegalMoves:', moves);

        moves.forEach(([ fsq, tsq, promote ]) => {
            const { r, c } = this.engine.fromSq(tsq);

            const sqEl = document.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
            if (sqEl) sqEl.classList.add('highlight');
        });
    }

    desHighlightMoves() {
        document.querySelectorAll('.highlight').forEach(sq => sq.classList.remove('highlight'));
    }


    async Promote(fromSq, toSq) {
        const { r: fr, c: fc } = this.engine.fromSq(fromSq);
        const { r: tr, c: tc } = this.engine.fromSq(toSq);

        this.promotionScreen.classList.remove('black');
        await delay(100);

        this.lastPromote = { fr, fc, tr, tc };

        // Compute vertical offset
        const isBlack = tr !== 0;
        const y = isBlack ? (tr - 3) * 25 : tr * 25;

        // Apply transform
        this.promotionScreen.style.transform = `translate(${tc * 100}%, ${y}%)`;

        for (const promoBtn of this.promotionScreen.children) {
            const promoPiece = promoBtn.dataset.piece;

            if (promoPiece == '.') {
                promoBtn.style.setProperty('--bg-img', ``);
                return;
            }

            promoBtn.style.setProperty('--bg-img', `url(${this.assetPrefix + (isBlack ? 'b' : 'w') + promoPiece.toLowerCase()}.png)`);
        }

        if (isBlack) this.promotionScreen.classList.add('black');

        this.promotionScreen.classList.remove('hidden');

        // Focus first selectable piece
        const first = this.promotionScreen.querySelector('[data-piece]');
        if (first) first.focus();
    }

    onPromoClick(e) {
        const newPiece = e.target.dataset.piece;
            if (!newPiece) return;

        const fromSq = this.engine.toSq(this.lastPromote?.fr, this.lastPromote?.fc);
        const toSq = this.engine.toSq(this.lastPromote?.tr, this.lastPromote?.tc);

        console.log('Promote pawn to', newPiece);
        this.engine.MovePiece(fromSq, toSq, newPiece);

        this.lastPromote = null;
        this.promotionScreen.classList.add('hidden');
        e.target.blur();
    }


    PlaySound(type = 0) {
        this.playableSounds[type].play();
    }
}
