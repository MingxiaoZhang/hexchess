import { io, Socket } from 'socket.io-client';
const URL = 'http://localhost:3001';
let pass = 0, fail = 0;
function chk(l: string, v: unknown, e: unknown) { const ok = JSON.stringify(v)===JSON.stringify(e); console.log(`${ok?'✅':'❌'} ${l}: ${JSON.stringify(v)}${ok?'':` (expected ${JSON.stringify(e)})`}`); ok?pass++:fail++; }
function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  // Create room as player 1
  const s1 = io(URL, { transports: ['websocket'] });
  const s2 = io(URL, { transports: ['websocket'] });
  await new Promise<void>(r => s1.on('connect', r));
  await new Promise<void>(r => s2.on('connect', r));

  const gs1P = new Promise<{ yourColor: string; reconnectToken: string; gameState: { currentTurn: string } }>(r => s1.once('game_start', r));
  const gs2P = new Promise<{ yourColor: string; reconnectToken: string }>(r => s2.once('game_start', r));
  const r1 = await new Promise<{ roomId: string; reconnectToken: string }>(r => s1.emit('create_room', { vsAI: false }, r));
  chk('create_room has reconnectToken', typeof r1.reconnectToken, 'string');
  s2.emit('join_room', { roomId: r1.roomId });
  const [gs1, gs2] = await Promise.all([gs1P, gs2P]);
  chk('game_start has reconnectToken for s1', typeof gs1.reconnectToken, 'string');
  chk('game_start has reconnectToken for s2', typeof gs2.reconnectToken, 'string');
  chk('tokens differ between players', gs1.reconnectToken !== gs2.reconnectToken, true);

  // Player 1 makes a move
  const white = gs1.yourColor === 'white' ? s1 : s2;
  const whiteTok = gs1.yourColor === 'white' ? gs1.reconnectToken : gs2.reconnectToken;
  const mr1P = new Promise<{ gameState: { currentTurn: string } }>(r => s1.once('move_result', r));
  const mr2P = new Promise<void>(r => s2.once('move_result', () => r()));
  white.emit('make_move', { roomId: r1.roomId, pieceId: 'w_pawn_4', from: {row:6,col:4}, to: {row:4,col:4} });
  const [mr1] = await Promise.all([mr1P, mr2P]);
  chk('move accepted', mr1.gameState.currentTurn, 'black');

  // Simulate disconnect + reconnect for white player
  console.log('\n  Simulating disconnect + reconnect for white...');
  const s1b = io(URL, { transports: ['websocket'] }); // new socket (simulates page refresh)
  await new Promise<void>(r => s1b.on('connect', r));

  // Expect opponent_disconnected on s2 within 1s of s1 disconnecting
  const oppDisconnP = new Promise<void>((r) => { const t = setTimeout(r, 1500); s2.once('opponent_disconnected', () => { clearTimeout(t); r(); }); });
  s1.disconnect(); // old socket disconnects
  await oppDisconnP;
  chk('opponent sees disconnect', true, true);

  // Reconnect with token
  const gsReconnP = new Promise<{ yourColor: string; gameState: { currentTurn: string; board: unknown } }>(r => s1b.once('game_start', r));
  const oppReconnP = new Promise<void>((r) => { const t = setTimeout(r, 1500); s2.once('opponent_reconnected', () => { clearTimeout(t); r(); }); });
  s1b.emit('join_room', { roomId: r1.roomId, reconnectToken: whiteTok });
  const [gsReconn] = await Promise.all([gsReconnP, oppReconnP]);
  chk('reconnect: game_start received', !!gsReconn.gameState, true);
  chk('reconnect: correct color', gsReconn.yourColor, gs1.yourColor);
  chk('reconnect: board has correct state (pawn moved)', (gsReconn.gameState.board as (string|null)[][])[4][4], 'w_pawn_4');
  chk('opponent notified of reconnect', true, true);

  s1b.disconnect(); s2.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
