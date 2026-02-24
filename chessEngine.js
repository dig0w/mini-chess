import { BitBoard } from './BitBoard.js';
import { Zobrist } from './Zobrist.js';

export class ChessEngine {
    static pawnMovesWhite = Array(64);
    static pawnMovesBlack = Array(64);
    static knightMoves = Array(64);
    static rookRays = Array.from({ length: 64 }, () => new Array(4));
    static bishopRays = Array.from({ length: 64 }, () => new Array(4));
    static queenRays = Array.from({ length: 64 }, () => new Array(8));
    static kingMoves = Array(64);

    static fileMasks = Array(8);
    static lightSquares = new BitBoard();
    static darkSquares = new BitBoard();

    static initialized = false;

    constructor(board = [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        ['.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.'],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    ]) {
        this.rows = board.length;
        this.cols = board[0].length;
        this.squares = this.rows * this.cols;

        this.isNormal = this.rows == this.cols && this.rows == 8;

        this.pieces = {
            // White
            P: new BitBoard(),
            N: new BitBoard(),
            B: new BitBoard(),
            R: new BitBoard(),
            Q: new BitBoard(),
            K: new BitBoard(),
            // Black
            p: new BitBoard(),
            n: new BitBoard(),
            b: new BitBoard(),
            r: new BitBoard(),
            q: new BitBoard(),
            k: new BitBoard()
        };

        // Populate bitboards
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const piece = board[r][c];
                    if (piece === '.') continue;

                const square = (this.rows - 1 - r) * this.cols + c;
                const hi = square >= 32 ? 1 << (square - 32) : 0;
                const lo = square < 32 ? 1 << square : 0;

                this.pieces[piece] = this.pieces[piece].or(new BitBoard(hi, lo));
            }
        }

        // Combined occupancy
        this.occupiedWhite = this.pieces.P.or(this.pieces.N).or(this.pieces.B).or(this.pieces.R).or(this.pieces.Q).or(this.pieces.K);
        this.occupiedBlack = this.pieces.p.or(this.pieces.n).or(this.pieces.b).or(this.pieces.r).or(this.pieces.q).or(this.pieces.k);
        this.occupied = this.occupiedWhite.or(this.occupiedBlack);

        // Moves
        if (!ChessEngine.initialized) {
            this.initMoveTables();
            ChessEngine.initialized = true;
        }

        this.castlingRights = {
            whiteKingSide: true,
            whiteQueenSide: true,
            blackKingSide: true,
            blackQueenSide: true
        };
        this.enPassantSquare = -1;

        this.turn = 0;

        this.promoPieces = ['q', 'r', 'b', 'n'];
        this.piecePoints = { p: 1, b: 3, n: 3, r: 5, q: 9, k: 0 };

        this.halfmoveClock = 0;
        this.zobrist = new Zobrist(this.rows, this.cols);
        this.repetitionCount = new Map();
        this.repetitionCount.set(this.zobrist.hash, 1);

        this.gameCondition = 'PLAYING';
        this.logs = [];
        this.totalPlies = 0;

        this.whiteAI = null;
        this.blackAI = null;

        this.renderer = null;
    }


    MovePiece(fromSq, toSq, promotePiece = null, force = false) {
        if (this.gameCondition !== 'PLAYING') {
            console.error('GAME CONDITION', { fromSq, toSq, promote: promotePiece });
            return false;
        }
        if (this.isEmpty(fromSq)) {
            console.error('EMPTY PIECE');
            return false;
        }
        if (!force && this.isWhite(fromSq) == (this.turn == 1)) {
            console.error('OPP PIECE');
            return false;
        }

        // Get pieces
        const originalPiece = this.getPieceSq(fromSq);
        const isWhite = this.isWhite(fromSq);
        const isPawn = originalPiece.toLowerCase() === 'p';

        let movingPiece = originalPiece;
            if (promotePiece) {
                if (isPawn) {
                    promotePiece = isWhite ? promotePiece.toUpperCase() : promotePiece.toLowerCase()
                    movingPiece = promotePiece;
                } else {
                    promotePiece = null;
                }
            };
        let targetPiece = this.getPieceSq(toSq);

        // Promote
        if (this.renderer && isPawn && !promotePiece) {
            const promoStart = isWhite ? this.squares - this.cols : 0;
            const promoEnd   = isWhite ? this.squares : this.cols;
            if (toSq >= promoStart && toSq < promoEnd) {
                this.renderer.Promote(fromSq, toSq);
                return false;
            }
        }

        this.zobrist.xorPiece(originalPiece, fromSq);

        let isCapture = !this.isEmpty(toSq);
        if (isCapture) {
            this.zobrist.xorPiece(targetPiece, toSq);
            this.pieces[targetPiece].clearBit(toSq);
        }

        // Reset En-passsant rights
        if (this.enPassantSquare) this.zobrist.xorEP(this.enPassantSquare);
        const prevEnPassant = this.enPassantSquare;
        this.enPassantSquare = -1;

        // En-passant capture
        let isEnPassantCapture = false;
        if (isPawn && prevEnPassant !== -1 && toSq === prevEnPassant && !isCapture) {
            const dir = (isWhite ? 1 : -1) * this.cols;
            const capSq = toSq - dir;
            targetPiece = this.getPieceSq(capSq);

            if (!this.isEmpty(capSq)) {
                this.zobrist.xorPiece(targetPiece, capSq);
                this.pieces[targetPiece].clearBit(capSq);
                
                isEnPassantCapture = true;
            };
        }

        // Castling
        let castle = 0;
        if (movingPiece.toLowerCase() === 'k') {
            if (fromSq + 2 === toSq) { // King-side
                const rSq = fromSq + 3;
                
                if (!this.isEmpty(rSq)) {
                    const rPiece = this.getPieceSq(rSq);
                    this.zobrist.xorPiece(rPiece, rSq);

                    this.pieces[rPiece].clearBit(rSq);
                    this.pieces[rPiece].setBit(fromSq + 1);

                    this.zobrist.xorPiece(rPiece, fromSq + 1);

                    castle = 1;
                }
            } else if (fromSq - 2 === toSq) { // Queen-side
                const rSq = fromSq - 4;
                
                if (!this.isEmpty(rSq)) {
                    const rPiece = this.getPieceSq(rSq);
                    this.zobrist.xorPiece(rPiece, rSq);

                    this.pieces[rPiece].clearBit(rSq);
                    this.pieces[rPiece].setBit(fromSq - 1);
                    
                    this.zobrist.xorPiece(rPiece, fromSq - 1);

                    castle = 2;
                }
            }
        }

        // Move piece
        this.pieces[originalPiece].clearBit(fromSq);
        this.pieces[movingPiece].setBit(toSq);

        this.zobrist.xorPiece(movingPiece, toSq);

        this.occupiedWhite = this.pieces.P.or(this.pieces.N).or(this.pieces.B).or(this.pieces.R).or(this.pieces.Q).or(this.pieces.K);
        this.occupiedBlack = this.pieces.p.or(this.pieces.n).or(this.pieces.b).or(this.pieces.r).or(this.pieces.q).or(this.pieces.k);
        this.occupied = this.occupiedWhite.or(this.occupiedBlack);

        // Castle rights
        this.zobrist.xorCastleRights(this.castlingRights);
        const prevCastlingRights = {
            whiteKingSide: this.castlingRights.whiteKingSide,
            whiteQueenSide: this.castlingRights.whiteQueenSide,
            blackKingSide: this.castlingRights.blackKingSide,
            blackQueenSide: this.castlingRights.blackQueenSide
        };
        if (movingPiece.toLowerCase() === 'k') {
            if (isWhite) {
                this.castlingRights.whiteKingSide = false;
                this.castlingRights.whiteQueenSide = false;
            } else {
                this.castlingRights.blackKingSide = false;
                this.castlingRights.blackQueenSide = false;
            }
        }
        if (movingPiece.toLowerCase() === 'r') {
            if (fromSq === 0) this.castlingRights.whiteQueenSide = false;
            if (fromSq === 7) this.castlingRights.whiteKingSide = false;
            if (fromSq === 56) this.castlingRights.blackQueenSide = false;
            if (fromSq === 63) this.castlingRights.blackKingSide = false;
        }
        if (isCapture && targetPiece.toLowerCase() === 'r') {
            if (toSq === 0) this.castlingRights.whiteQueenSide = false;
            if (toSq === 7) this.castlingRights.whiteKingSide = false;
            if (toSq === 56) this.castlingRights.blackQueenSide = false;
            if (toSq === 63) this.castlingRights.blackKingSide = false;
        }
        this.zobrist.xorCastleRights(this.castlingRights);

        // En-passant rights
        if (isPawn && Math.abs(fromSq - toSq) === 2 * this.cols) {
            const dir = (isWhite ? 1 : -1) * this.cols;
            this.enPassantSquare = fromSq + dir;
            this.zobrist.xorEP(this.enPassantSquare);
        }

        // Draw rules
        if (isPawn || isCapture || isEnPassantCapture) this.halfmoveClock = 0;
        else this.halfmoveClock++;

        const hash = this.zobrist.hash;
        this.repetitionCount.set(hash, (this.repetitionCount.get(hash) || 0) + 1);

        // Store move
        this.logs.push({
            fromSq, toSq,
            originalPiece,
            targetPiece,
            promotePiece,

            castle,
            castlingRights: prevCastlingRights,
            isEnPassantCapture,
            enPassantSquare: prevEnPassant,

            halfmoveClock: this.halfmoveClock,
            hash,

            gameCondition: this.gameCondition
        });
        this.totalPlies++;

        // Game condition
        const result = this.evaluateEndConditions();
            if (result) this.gameCondition = result;

        // Switch turn
        if (this.gameCondition == 'PLAYING') this.SwitchTurn();

        // UI
        if (this.renderer) {
            const { r: fr, c: fc } = this.fromSq(fromSq);
            const { r: tr, c: tc } = this.fromSq(toSq);

            if (isCapture || isEnPassantCapture) {
                if (isWhite) {
                    this.renderer.whiteCaptures.push(targetPiece);
                    this.renderer.whitePoints += this.piecePoints[targetPiece.toLowerCase()];
                } else {
                    this.renderer.blackCaptures.push(targetPiece);
                    this.renderer.blackPoints += this.piecePoints[targetPiece.toLowerCase()];
                }
            }

            if (promotePiece) {
                if (isWhite) {
                    this.renderer.whitePoints += this.piecePoints[promotePiece.toLowerCase()];
                } else {
                    this.renderer.blackPoints += this.piecePoints[promotePiece.toLowerCase()];
                }
            }

            if (castle == 1) {
                this.renderer.UpdateSquare(tr, 7);
                this.renderer.UpdateSquare(tr, 5);
            } else if (castle == 2) {
                this.renderer.UpdateSquare(tr, 3);
                this.renderer.UpdateSquare(tr, 0);
            }

            if (isEnPassantCapture) {
                const capRow = isWhite ? tr + 1 : tr - 1;
                this.renderer.UpdateSquare(capRow, tc);
            }

            this.renderer.whiteKingChecked = this.isKingInCheck(true);
            this.renderer.blackKingChecked = this.isKingInCheck(false);

            console.log(this.zobrist.hash);
            this.renderer.UpdateSquare(fr, fc);
            this.renderer.UpdateSquare(tr, tc);
            this.renderer.UpdateGame();
            this.renderer.AddToLog();

            if (promotePiece) this.renderer.PlaySound(3);
            else if (this.renderer.whiteKingChecked || this.renderer.blackKingChecked) this.renderer.PlaySound(2);
            else if (isCapture || isEnPassantCapture) this.renderer.PlaySound(1);
            else if (castle !== 0) this.renderer.PlaySound(4);
            else this.renderer.PlaySound(0);
        }

        return true;
    }

    undoMove() {
        if (this.logs.length === 0) return false;

        this.totalPlies--;
        const lastMove = this.logs.pop();

        const {
            fromSq, toSq,
            originalPiece,
            targetPiece,
            promotePiece,

            castle,
            castlingRights,
            isEnPassantCapture,
            enPassantSquare,

            halfmoveClock,
            hash,

            gameCondition
        } = lastMove;

        const isWhite = this.isWhitePiece(originalPiece);
        const isCapture = !this.isEmptyPiece(targetPiece);

        // Restore piece positions
        const fbb = this.pieces[originalPiece];
        if (promotePiece) {
            this.zobrist.xorPiece(promotePiece, toSq);
            this.pieces[promotePiece].clearBit(toSq);
        } else {
            fbb.clearBit(toSq);
            this.zobrist.xorPiece(originalPiece, toSq);
        }

        fbb.setBit(fromSq);
        this.zobrist.xorPiece(originalPiece, fromSq);

        // Undo capture
        if (isCapture && !isEnPassantCapture) {
            this.zobrist.xorPiece(targetPiece, toSq);
            this.pieces[targetPiece].setBit(toSq)
        };

        // Undo castling
        if (castle === 1) { // King-side
            const rSq = fromSq + 1;
            const rprevSq = fromSq + 3;
            const rPiece = this.getPieceSq(rSq);

            this.zobrist.xorPiece(rPiece, rSq);

            this.pieces[rPiece].setBit(rprevSq);
            this.pieces[rPiece].clearBit(rSq);

            this.zobrist.xorPiece(rPiece, rprevSq);
        } else if (castle === 2) { // Queen-side
            const rSq = fromSq - 1;
            const rprevSq = fromSq - 4;
            const rPiece = this.getPieceSq(rSq);

            this.zobrist.xorPiece(rPiece, rSq);

            this.pieces[rPiece].setBit(rprevSq);
            this.pieces[rPiece].clearBit(rSq);

            this.zobrist.xorPiece(rPiece, rprevSq);
        }

        // Undo En-passant capture
        if (isEnPassantCapture) {
            const dir = (isWhite ? 1 : -1) * this.cols;
            const capSq = toSq - dir;
            const pawn = isWhite ? 'p' : 'P';

            this.zobrist.xorPiece(targetPiece, capSq);
            this.pieces[pawn].setBit(capSq);
            this.pieces[pawn].clearBit(toSq);
        }

        this.occupiedWhite = this.pieces.P.or(this.pieces.N).or(this.pieces.B).or(this.pieces.R).or(this.pieces.Q).or(this.pieces.K);
        this.occupiedBlack = this.pieces.p.or(this.pieces.n).or(this.pieces.b).or(this.pieces.r).or(this.pieces.q).or(this.pieces.k);
        this.occupied = this.occupiedWhite.or(this.occupiedBlack);

        // Restore castling rights
        this.zobrist.xorCastleRights(this.castlingRights);
        this.castlingRights.whiteKingSide = castlingRights.whiteKingSide;
        this.castlingRights.whiteQueenSide = castlingRights.whiteQueenSide;
        this.castlingRights.blackKingSide = castlingRights.blackKingSide;
        this.castlingRights.blackQueenSide = castlingRights.blackQueenSide;
        this.zobrist.xorCastleRights(castlingRights);

        // Restore En-passant square
        if (this.enPassantSquare > 0) this.zobrist.xorEP(this.enPassantSquare);
        this.enPassantSquare = -1;
        if (enPassantSquare) {
            this.enPassantSquare = enPassantSquare;
            this.zobrist.xorEP(enPassantSquare);
        }

        // Restore halfmove clock
        this.halfmoveClock = halfmoveClock;

        this.repetitionCount.set(hash, (this.repetitionCount.get(hash) || 1) - 1);

        // Restore game condition and turn
        const prevGameCondition = this.gameCondition;
        this.gameCondition = gameCondition;
        this.SwitchTurn(prevGameCondition !== 'PLAYING');

        // UI updates
        if (this.renderer) {
            const { r: fr, c: fc } = this.fromSq(fromSq);
            const { r: tr, c: tc } = this.fromSq(toSq);

            if (isCapture || isEnPassantCapture) {
                if (isWhite) {
                    this.renderer.whiteCaptures.splice(-1);
                    this.renderer.whitePoints -= this.piecePoints[targetPiece.toLowerCase()];
                } else {
                    this.renderer.blackCaptures.splice(-1);
                    this.renderer.blackPoints -= this.piecePoints[targetPiece.toLowerCase()];
                }
            }

            if (promotePiece) {
                if (isWhite) {
                    this.renderer.whitePoints -= this.piecePoints[promotePiece.toLowerCase()];
                } else {
                    this.renderer.blackPoints -= this.piecePoints[promotePiece.toLowerCase()];
                }
            }

            if (castle == 1) {
                this.renderer.UpdateSquare(tr, 7);
                this.renderer.UpdateSquare(tr, 5);
            } else if (castle == 2) {
                this.renderer.UpdateSquare(tr, 3);
                this.renderer.UpdateSquare(tr, 0);
            }

            if (isEnPassantCapture) {
                const capRow = isWhite ? tr + 1 : tr - 1;
                this.renderer.UpdateSquare(capRow, tc);
            }

            this.renderer.whiteKingChecked = this.isKingInCheck(true);
            this.renderer.blackKingChecked = this.isKingInCheck(false);

            console.log(this.zobrist.hash);
            this.renderer.UpdateSquare(fr, fc);
            this.renderer.UpdateSquare(tr, tc);
            this.renderer.UpdateGame();
            this.renderer.RemoveFromLog();

            if (promotePiece) this.renderer.PlaySound(3);
            else if (this.renderer.whiteKingChecked || this.renderer.blackKingChecked) this.renderer.PlaySound(2);
            else if (isCapture) this.renderer.PlaySound(1);
            else if (castle !== 0) this.renderer.PlaySound(4);
            else this.renderer.PlaySound(0);
        }

        return true;
    }

    makeNullMove() {
        if (this.enPassantSquare !== -1) this.zobrist.xorEP(this.enPassantSquare);
        this.enPassantSquare = -1;

        this.SwitchTurn();
    }

    undoNullMove(prevEp, prevHash) {
        this.zobrist.hash = prevHash;
        this.enPassantSquare = prevEp;
        this.SwitchTurn();
    }


    getLegalMoves(sq) {
        if (this.isEmpty(sq)) return [];

        const isWhite = this.isWhite(sq);

        let attacks;
        let moves = [];

        const ownOccupied = isWhite ? this.occupiedWhite : this.occupiedBlack;
        const enemyOccupied = isWhite ? this.occupiedBlack : this.occupiedWhite;

        const piece = this.getPieceSq(sq);
        switch (piece.toLowerCase()) {
            // Pawn
            case 'p':
                attacks = isWhite ? ChessEngine.pawnMovesWhite[sq].and(enemyOccupied)
                                  : ChessEngine.pawnMovesBlack[sq].and(enemyOccupied);

                // Diagonal captures
                for (const tsq of attacks.allSquares()) {
                    moves.push([ sq, tsq, null ]);
                }

                // Forward pushes
                const dir = (isWhite ? 1 : -1) * this.cols;
                const forward = sq + dir;
                if (forward >= 0 && forward < this.squares && this.isEmpty(forward)) {
                    moves.push([ sq, forward, null ]);

                    // Double push from starting rank
                    if (this.isNormal) {
                        const startRank = isWhite ? (sq >= 1 * this.rows && sq < 2 * this.rows) : (sq >= 6 * this.rows && sq < 7 * this.rows);

                        if (startRank) {
                            const doubleForward = forward + dir;
                            if (doubleForward >= 0 && doubleForward < this.squares && this.isEmpty(doubleForward)) {
                                moves.push([ sq, doubleForward, null ]);
                            }
                        }
                    }
                }

                // Promotion
                const promoStart = isWhite ? this.squares - this.cols : 0;
                const promoEnd   = isWhite ? this.squares : this.cols;
                for (let i = 0; i < moves.length; i++) {
                    const toSq = moves[i][1];

                    if (toSq >= promoStart && toSq < promoEnd && moves[i][2] == null) {
                        for (const promote of this.promoPieces) {
                            moves.push([ sq, moves[i][1], promote ]);
                        }

                        moves.splice(i, 1);
                        i--;
                    }
                }

                // En-passant captures
                if (this.isNormal) {
                    const epSq = this.enPassantSquare;
                    if (epSq !== null && epSq !== -1) {
                        if (epSq === sq + dir - 1 || epSq === sq + dir + 1) moves.push([ sq, epSq, null ]);
                    }
                }
                break;
            // Knight
            case 'n':
                attacks = ChessEngine.knightMoves[sq].and(ownOccupied.not());
                for (const tsq of attacks.allSquares()) {
                    moves.push([ sq, tsq, null ]);
                }
                break;
            // Rook
            case 'r':
            // Bishop
            case 'b':
            // Queen
            case 'q':
                attacks = this.getSlidingMoves(piece.toLowerCase(), sq).and(ownOccupied.not());
                for (const tsq of attacks.allSquares()) {
                    moves.push([ sq, tsq, null ]);
                }
                break;
            // King
            case 'k':
                attacks = ChessEngine.kingMoves[sq].and(ownOccupied.not());
                for (const tsq of attacks.allSquares()) {
                    if (this.isSquareAttacked(tsq, isWhite)) continue;

                    moves.push([ sq, tsq, null ]);
                }

                // Castling
                if (this.isNormal) {
                    const kingStartSq = isWhite ? 4 : 60;

                    if (sq === kingStartSq) {
                        const kingSide = isWhite ? this.castlingRights.whiteKingSide : this.castlingRights.blackKingSide;
                        const queenSide = isWhite ? this.castlingRights.whiteQueenSide : this.castlingRights.blackQueenSide;

                        // King-side
                        if (kingSide &&
                            this.isEmpty(kingStartSq + 1) &&
                            this.isEmpty(kingStartSq + 2) &&
                            !this.isSquareAttacked(kingStartSq, isWhite) &&
                            !this.isSquareAttacked(kingStartSq + 1, isWhite) &&
                            !this.isSquareAttacked(kingStartSq + 2, isWhite)
                        ) moves.push([ sq, kingStartSq + 2, null ]);

                        // Queen-side
                        if (queenSide &&
                            this.isEmpty(kingStartSq - 1) &&
                            this.isEmpty(kingStartSq - 2) &&
                            this.isEmpty(kingStartSq - 3) &&
                            !this.isSquareAttacked(kingStartSq, isWhite) &&
                            !this.isSquareAttacked(kingStartSq - 1, isWhite) &&
                            !this.isSquareAttacked(kingStartSq - 2, isWhite)
                        ) moves.push([ sq, kingStartSq - 2, null ]);
                    }
                }
                break;
        }

        moves = moves.filter(m => this.moveKeepsKingSafe(sq, m[1]));
        return moves;
    }

    getPlayerLegalMoves(isWhite) {
        const moves = [];

        let occupied = isWhite ? this.occupiedWhite : this.occupiedBlack;

        for (const sq of occupied.allSquares()) {
            moves.push(...this.getLegalMoves(sq));
        }

        return moves;
    }

    hasLegalMoves(isWhite) {
        const bb = isWhite 
            ? this.occupiedWhite.clone() 
            : this.occupiedBlack.clone();

        // While any piece exists
        while (bb.lo !== 0 || bb.hi !== 0) {
            const sq = bb.popLSB();
            const { r, c } = this.fromSq(sq);
            
            // getLegalMoves already filters legal & pins & check states
            if (this.getLegalMoves(sq).length > 0)
                return true;
        }
        return false;
    }

    isSquareAttacked(sq, isWhite) {
        const byWhite = !isWhite;

        // Enemy piece bitboards
        const P = this.pieces[ byWhite ? 'P' : 'p' ];
        const N = this.pieces[ byWhite ? 'N' : 'n' ];
        const B = this.pieces[ byWhite ? 'B' : 'b' ];
        const R = this.pieces[ byWhite ? 'R' : 'r' ];
        const Q = this.pieces[ byWhite ? 'Q' : 'q' ];
        const K = this.pieces[ byWhite ? 'K' : 'k' ];

        // Pawns
        const pawnBB = byWhite
            ? ChessEngine.pawnMovesBlack[sq]
            : ChessEngine.pawnMovesWhite[sq];

        if (!pawnBB.and(P).isZero()) return true;

        // Knights
        if (!ChessEngine.knightMoves[sq].and(N).isZero()) return true;

        // King
        if (!ChessEngine.kingMoves[sq].and(K).isZero()) return true;

        // Sliding pieces
        const rookAtk   = this.getSlidingMoves('r', sq);
        const bishopAtk = this.getSlidingMoves('b', sq);

        if (!rookAtk.and(R.or(Q)).isZero())   return true;
        if (!bishopAtk.and(B.or(Q)).isZero()) return true;

        return false;
    }

    isKingInCheck(isWhite) {
        const king = this.getKing(isWhite);
            if (!king) return true;

        return this.isSquareAttacked(king, isWhite);
    }

    moveKeepsKingSafe(fromSq, toSq, oppKing = false) {
        if (this.isEmpty(fromSq)) return false;
        const movingPiece = this.getPieceSq(fromSq);

        const isWhite = this.isWhite(fromSq);

        // ---- QUICK SNAPSHOTS (CHEAP AND FAST) ---- //
        const pieceBB         = this.pieces[movingPiece];
        const capturedPiece   = this.getPieceSq(toSq);
        const capturedBB      = capturedPiece ? this.pieces[capturedPiece] : null;

        // Save occupancy before change
        const occW = this.occupiedWhite;
        const occB = this.occupiedBlack;

        // ---- APPLY TEMP MOVE ---- //

        // Remove from origin
        pieceBB.clearBit(fromSq);

        // Remove captured
        if (capturedBB) capturedBB.clearBit(toSq);

        // Move to target
        pieceBB.setBit(toSq);

        // Update occupancy (delta only, no OR spam)
        if (isWhite) {
            this.occupiedWhite = occW.clone();
            this.occupiedWhite.clearBit(fromSq);
            this.occupiedWhite.setBit(toSq);

            if (capturedBB) {
                this.occupiedBlack = occB.clone();
                this.occupiedBlack.clearBit(toSq);
            }
        } else {
            this.occupiedBlack = occB.clone();
            this.occupiedBlack.clearBit(fromSq);
            this.occupiedBlack.setBit(toSq);

            if (capturedBB) {
                this.occupiedWhite = occW.clone();
                this.occupiedWhite.clearBit(toSq);
            }
        }
        this.occupied = this.occupiedWhite.or(this.occupiedBlack);

        // ---- CHECK KING SAFETY ---- //
        const safe = !this.isKingInCheck(isWhite !== oppKing);

        // ---- UNDO MOVE (REVERT EXACTLY) ---- //
        pieceBB.clearBit(toSq);
        pieceBB.setBit(fromSq);
        if (capturedBB) capturedBB.setBit(toSq);

        this.occupiedWhite = occW;
        this.occupiedBlack = occB;
        this.occupied      = occW.or(occB);

        return safe;
    }


    evaluateEndConditions() {
        const whiteTurn = this.turn === 0;

        if (!this.hasLegalMoves(!whiteTurn)) {
            if (this.isKingInCheck(!whiteTurn)) {
                return !whiteTurn ? 'BLACK_WINS_CHECKMATE' : 'WHITE_WINS_CHECKMATE';
            } else {
                return 'DRAW_STALEMATE';
            }
        }

        if (this.insufficientMaterial(true) && this.insufficientMaterial(false)) return 'DRAW_DEAD_POSITION';

        if (this.halfmoveClock >= 100) return 'DRAW_50-MOVE_RULE';

        const historyHash = this.zobrist.hash;
        if (this.repetitionCount.get(historyHash) >= 3) return 'DRAW_THREEFOLD_REPETITION';

        return null;
    }

    insufficientMaterial(isWhite) {
        const P = !isWhite ? this.pieces.P : this.pieces.p;
        const N = !isWhite ? this.pieces.N : this.pieces.n;
        const B = !isWhite ? this.pieces.B : this.pieces.b;
        const R = !isWhite ? this.pieces.R : this.pieces.r;
        const Q = !isWhite ? this.pieces.Q : this.pieces.q;

        // Any pawn/rook/queen = always mating potential
        if (!P.isZero() || !R.isZero() || !Q.isZero()) return false;

        const knights = N.popcount();
        const bishops = B.popcount();

        // King only
        if (knights === 0 && bishops === 0) return true;

        // Single minor piece (B or N)
        if ((knights === 1 && bishops === 0) || (knights === 0 && bishops === 1))
            return true;

        // Two knights cannot force mate
        if (knights === 2 && bishops === 0) return true;

        // Bishop vs Bishop but same colour = dead
        if (bishops === 2 && knights === 0) {
            // extract square colors for both bishops
            const squares = B.allSquares();
            const c1 = (squares[0] + Math.floor(squares[0] / 8)) % 2;
            const c2 = (squares[1] + Math.floor(squares[1] / 8)) % 2;
            if (c1 === c2) return true;
        }

        return false;
    }

    hasNonPawnMaterial(isWhite) {
        const occBB = isWhite ? this.occupiedWhite : this.occupiedBlack;
        const pawnsBB = isWhite ? this.pieces.P : this.pieces.p;
        const kingBB = isWhite ? this.pieces.K : this.pieces.k;

        return !occBB.and(pawnsBB.not()).and(kingBB.not()).isZero();
    }


    SwitchTurn(callPlay = false) {
        if (!callPlay) {
            this.turn = 1 - this.turn;
            this.zobrist.xorTurn();
        }

        if (this.turn == 0 && this.whiteAI && this.renderer) this.whiteAI?.Play();
        if (this.turn == 1 && this.blackAI && this.renderer) this.blackAI?.Play();
    }


    getKing(isWhite) {
        const kingChar = isWhite ? 'K' : 'k';
        const kingBB = this.pieces[kingChar];

        const sq = kingBB.bitIndex();
            if (sq === -1) return null;

        return sq;
    }

    getPieceSq(sq) {
        // Fast exit
        if (!this.occupied.has(sq)) return '.';

        const isWhite = this.occupiedWhite.has(sq);

        if (isWhite) {
            if (this.pieces.P.has(sq)) return 'P';
            if (this.pieces.N.has(sq)) return 'N';
            if (this.pieces.B.has(sq)) return 'B';
            if (this.pieces.R.has(sq)) return 'R';
            if (this.pieces.Q.has(sq)) return 'Q';
            if (this.pieces.K.has(sq)) return 'K';
        } else {
            if (this.pieces.p.has(sq)) return 'p';
            if (this.pieces.n.has(sq)) return 'n';
            if (this.pieces.b.has(sq)) return 'b';
            if (this.pieces.r.has(sq)) return 'r';
            if (this.pieces.q.has(sq)) return 'q';
            if (this.pieces.k.has(sq)) return 'k';
        }

        return '.';
    }

    getPiece(r, c) {
        const sq = this.toSq(r, c);

        return this.getPieceSq(sq);
    }

    squareToNotation(sq) {
        const { r, c } = this.fromSq(sq);

        const file = String.fromCharCode('a'.charCodeAt(0) + c);
        const rank = (this.rows - r).toString();
        return file + rank;
    }

    notationToSquare(notation) {
        const file = notation.charCodeAt(0) - 'a'.charCodeAt(0);
        const rank = parseInt(notation[1]) - 1;

        return rank * this.rows + file;
    }

    getMoveNotation(fullMove) {
        if (!fullMove) return;

        const {
            fromSq, toSq,
            originalPiece,
            targetPiece,
            promotePiece,

            castle,
            isEnPassantCapture
        } = fullMove;

        const { r: fr, c: fc } = this.fromSq(fromSq);

        let notation = '';

        // Handle castling first
        if (castle === 1) {
            // King-side castling
            notation = 'O-O';
        } else if (castle === 2) {
            // Queen-side castling
            notation = 'O-O-O';
        } else {
            const squareName = (r, c) => {
                const file = String.fromCharCode('a'.charCodeAt(0) + c);
                const rank = (this.rows - r).toString();
                return file + rank;
            }

            let pieceLetter = originalPiece.toLowerCase() === 'p' ? '' : originalPiece.toUpperCase();

            const isCapture = !this.isEmptyPiece(targetPiece);

            // Build notation
            if (pieceLetter) notation += pieceLetter;

            // Pawn captures show file of origin
            if (!pieceLetter && isCapture) {
                const file = String.fromCharCode('a'.charCodeAt(0) + fc);
                notation += file;
            }

            if (isCapture) notation += 'x';

            notation += this.squareToNotation(toSq);

            // Promotion
            if (promotePiece) {
                notation += '=' + promotePiece.toUpperCase();
            }

            // En-Passant
            if (isEnPassantCapture) {
                notation += ' e.p.';
            }

            // Check / mate
            const whiteToMove = this.gameCondition === 'PLAYING' ? !(this.turn === 0) : this.turn === 0;
            const opponentIsWhite = !whiteToMove;

            const oppInCheck = opponentIsWhite ? this.renderer.whiteKingChecked : this.renderer.blackKingChecked;
            const oppLegalMoves = this.hasLegalMoves(opponentIsWhite);

            if (oppInCheck && !oppLegalMoves) notation += '#';
            else if (oppInCheck && oppLegalMoves) notation += '+';
        }

        return notation;
    }

    getMoveUCI(move) { return `${this.squareToNotation(move[0])}${this.squareToNotation(move[1])}${move[2] ? move[2] : ''}` }

    toSq(r, c) { return (this.rows - 1 - r) * this.cols + c; }
    fromSq(sq) { return { r: this.rows - 1 - Math.floor(sq / this.rows), c: sq % this.cols } }

    isWhite(sq) { return this.occupiedWhite.has(sq); }
    isBlack(sq) { return this.occupiedBlack.has(sq); }
    isEmpty(sq) { return !this.occupied.has(sq); }

    isWhitePiece(p) { return p ? p !== '.' && p === p.toUpperCase() : null; }
    isBlackPiece(p) { return p ? p !== '.' && p === p.toLowerCase() : null; }
    isEmptyPiece(p) { return p ? p == '.' : null; }

    clone() {
        const clone = new ChessEngine();

        // Deep copy all piece bitboards
        clone.pieces = {};
        for (const [piece, bb] of Object.entries(this.pieces)) {
            clone.pieces[piece] = bb.clone();
        }

        clone.occupiedWhite = this.occupiedWhite.clone();
        clone.occupiedBlack = this.occupiedBlack.clone();
        clone.occupied = this.occupied.clone();

        clone.castlingRights = {
            whiteKingSide: this.castlingRights.whiteKingSide,
            whiteQueenSide: this.castlingRights.whiteQueenSide,
            blackKingSide: this.castlingRights.blackKingSide,
            blackQueenSide: this.castlingRights.blackQueenSide
        };
        clone.enPassantSquare = this.enPassantSquare;

        clone.zobrist = this.zobrist.clone();
        clone.repetitionCount = new Map(this.repetitionCount);

        clone.halfmoveClock = this.halfmoveClock;

        clone.turn = this.turn;
        clone.gameCondition = this.gameCondition;

        clone.totalPlies = this.totalPlies;

        return clone;
    }


    initMoveTables() {
        const add = (bb, sq) => bb.setBit(sq);
        const inBoard = (r,c) => r >= 0 && r < 8 && c >= 0 && c < 8;

        // Loop squares 0..63
        for (let sq = 0; sq < 64; sq++) {
            const { r, c } = this.fromSq(sq);

            // Pawn moves
            let wbb = new BitBoard(), bbb = new BitBoard();

            // white pawns move up
            if (inBoard(r - 1, c - 1)) add(wbb, this.toSq(r - 1, c - 1));
            if (inBoard(r - 1, c + 1)) add(wbb, this.toSq(r - 1, c + 1));
            ChessEngine.pawnMovesWhite[sq] = wbb;

            // black pawns move down
            if (inBoard(r + 1, c - 1)) add(bbb, this.toSq(r + 1, c - 1));
            if (inBoard(r + 1, c + 1)) add(bbb, this.toSq(r + 1, c + 1));
            ChessEngine.pawnMovesBlack[sq] = bbb;

            // Knight
            let nbb = new BitBoard();

            const knightMoves = [
                [r + 2, c + 1], [r + 2, c - 1], [r - 2, c + 1], [r - 2, c - 1],
                [r + 1, c + 2], [r + 1, c - 2], [r - 1, c + 2], [r - 1, c - 2],
            ];
            for (const [rr, cc] of knightMoves) if (inBoard(rr, cc)) add(nbb, this.toSq(rr, cc));
            ChessEngine.knightMoves[sq] = nbb;

            // Rook, Bishop and Queen
            // Directions for rook and bishop sliding
            const rookDirs   = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            const bishopDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

            let rookRays = [];
            let bishopRays = [];

            // Rook rays
            for (const [dr,dc] of rookDirs) {
                let raySquares = [];
                let rr = r+dr, cc = c+dc;
                while (inBoard(rr,cc)) {
                    raySquares.push(this.toSq(rr, cc));
                    rr += dr; cc += dc;
                }
                rookRays.push(raySquares);
            }

            // Bishop rays
            for (const [dr,dc] of bishopDirs) {
                let raySquares = [];
                let rr = r+dr, cc = c+dc;
                while (inBoard(rr,cc)) {
                    raySquares.push(this.toSq(rr, cc));
                    rr += dr; cc += dc;
                }
                bishopRays.push(raySquares);
            }

            ChessEngine.rookRays[sq] = rookRays;
            ChessEngine.bishopRays[sq] = bishopRays;

            // Queen = rook + bishop
            ChessEngine.queenRays[sq] = rookRays.concat(bishopRays);

            // King moves
            let kbb = new BitBoard();

            for (let dr =- 1; dr <= 1; dr++) for (let dc=- 1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                let rr = r + dr, cc = c + dc;
                if (inBoard(rr, cc)) add(kbb, this.toSq(rr, cc));
            }
            ChessEngine.kingMoves[sq] = kbb;


            // Square Color
            if ((sq % 2) == 1) {
                ChessEngine.lightSquares.setBit(sq);
            } else {
                ChessEngine.darkSquares.setBit(sq);
            }
        }

        // File masks
        for (let c = 0; c < 8; c++) {
            const bb = new BitBoard();
            for (let r = 0; r < this.rows; r++) {
                bb.setBit(this.toSq(r, c));
            }
            ChessEngine.fileMasks[c] = bb;
        }
    }

    getSlidingMoves(type, fromSq) {
        const occupied = this.occupied;

        let rays;
        switch(type) {
            case 'r': rays = ChessEngine.rookRays[fromSq]; break;
            case 'b': rays = ChessEngine.bishopRays[fromSq]; break;
            case 'q': rays = ChessEngine.queenRays[fromSq]; break;
        }

        let moves = new BitBoard();

        for (const ray of rays) {
            for (const targetSq of ray) {
                moves.setBit(targetSq);

                if (occupied.has(targetSq)) break;
            }
        }

        return moves;
    }
}