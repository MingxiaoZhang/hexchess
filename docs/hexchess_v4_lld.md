# Hexchess — V4 Low Level Design

## Status
Defined. Build after V3 is validated.

---

## Goal
Introduce account management using Supabase. Move session identity from in-memory to a persistent database. Give players a reason to return — their stats and history follow them.

## What V4 Is
- Supabase integration — auth + PostgreSQL database
- Discord OAuth as primary login method
- Google OAuth as secondary login method
- Anonymous guest login — full game functionality, no signup required
- Guest account upgrade path — link email or Discord to preserve stats
- Move reconnect tokens from in-memory to Supabase database
- Basic player profile — username, win/loss record
- Game history — completed games stored and tied to userId

## What V4 Is NOT
- No ranked matchmaking
- No leaderboards
- No spectator mode
- No detailed stats beyond win/loss record
- No friend system

---

## Supabase Setup

### Services Used
- **Supabase Auth** — player identity, OAuth providers, anonymous sessions
- **Supabase PostgreSQL** — reconnect tokens, game history, player profiles

### Auth Providers to Enable
- Discord OAuth — primary, fits gaming audience, one click for most players
- Google OAuth — secondary, broader coverage
- Anonymous sign-in — for guest players, no friction path to playing

### Environment Variables
All Supabase credentials stored in environment variables, never hardcoded:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, never exposed to client

---

## Database Schema

### players
```
id           uuid        primary key (matches Supabase auth userId)
username     text        unique, nullable (null for guests)
is_guest     boolean     default true
wins         integer     default 0
losses       integer     default 0
created_at   timestamp
last_seen    timestamp
```

### reconnect_tokens
```
token        uuid        primary key
user_id      uuid        references players.id
room_id      text
color        text        'white' | 'black'
created_at   timestamp
expires_at   timestamp
```

### games
```
id           uuid        primary key
white_id     uuid        references players.id
black_id     uuid        references players.id
winner_id    uuid        references players.id, nullable
end_reason   text        'checkmate' | 'timeout' | 'forfeit' | 'disconnect'
duration_ms  integer
created_at   timestamp
completed_at timestamp
```

---

## Auth Flows

### Guest Login
1. Player clicks "Play as Guest"
2. Client calls `supabase.auth.signInAnonymously()`
3. Supabase returns a real userId and session token
4. Client stores session in localStorage
5. Player gets a generated username — Guest#XXXX
6. Full game functionality available immediately
7. Stats tracked for the session but not persistent across devices

### Discord / Google OAuth
1. Player clicks "Login with Discord" or "Login with Google"
2. Client calls `supabase.auth.signInWithOAuth({ provider: 'discord' })`
3. Player authenticates with provider
4. Supabase returns userId and session
5. Player profile created in `players` table if first login
6. Username defaults to Discord/Google display name, editable later

### Guest Upgrade
1. Guest player clicks "Save my account"
2. Client calls `supabase.auth.linkIdentity({ provider: 'discord' })`
3. Anonymous account converts to full account
4. All existing stats and game history preserved — no migration needed
5. Supabase handles this natively

### Session Persistence
- Auth session stored in localStorage by Supabase client automatically
- On app load, client calls `supabase.auth.getSession()` to restore session
- If session expired, player is treated as logged out — prompted to login or continue as guest

---

## Reconnect Token Migration

### Current (V1-V3)
Reconnect tokens stored in server memory:
```
roomManager.reconnectTokens[token] = { socketId, roomId, color }
```

### V4 Migration
Reconnect tokens stored in Supabase `reconnect_tokens` table:
- On game join, server creates a reconnect token row tied to userId
- On reconnect, server validates (token, userId, roomId) against database
- Tokens expire after 30 seconds (matches existing reconnection window)
- Expired tokens cleaned up by a scheduled Supabase function

### Why This Matters
- Reconnect survives server restarts
- Multiple server instances can validate the same token
- Foundation for future persistent game state

---

## Player Profile

### What's Tracked in V4
- Username (editable once)
- Win/loss record
- Games played count
- Account type (guest or registered)

### What's Not Tracked Yet
- Per-piece mutation stats
- Ability usage history
- Trigger completion rates
- These come in a future version when stats become a feature

---

## Game History
At game completion, server writes a row to the `games` table:
- Both player userIds
- Winner userId
- End reason
- Duration
- Timestamp

Players can see their last 10 games on their profile. No detailed replay yet.

---

## UI Changes for V4

### Landing / Lobby Screen
Add auth options before entering lobby:
- "Play as Guest" — instant, no friction
- "Login with Discord" — primary CTA
- "Login with Google" — secondary option
- If already logged in — show username + win/loss record, proceed directly

### Profile Widget
Small persistent element in the game HUD showing:
- Username
- Win/loss record
- "Save account" prompt for guests

### Guest Upgrade Prompt
After a guest wins their first game:
- Non-intrusive prompt — "Want to save your stats? Link your Discord"
- Dismissable, never shown more than once per session

---

## Build Order
Build strictly in this sequence:

1. Supabase project setup — auth providers, database tables, environment variables
2. Client Supabase integration — install SDK, auth context, session restoration
3. Guest login flow — anonymous sign-in, guest username generation
4. Discord OAuth flow — login, profile creation, session persistence
5. Google OAuth flow — login, profile creation
6. Guest upgrade flow — link identity, account conversion
7. Reconnect token migration — move from in-memory to Supabase table
8. Game history writes — record completed games to database
9. Player profile UI — username, win/loss, last 10 games
10. Guest upgrade prompt — trigger after first win

---

## Key Design Questions V4 Must Answer
After shipping V4, answer before V5:

- What percentage of players sign up vs play as guest?
- Do guests upgrade after winning?
- Is Discord the right primary auth or do more players use Google?
- Are players returning to check their stats or ignoring the profile?

---

## V3 Feedback Template
Fill this in after playtesting V3 before starting V4 build:

**Did players discover ability combos naturally:**

**Which abilities were most/least used:**

**Did abilities feel like enhancements or replacements for chess:**

**Were positional costs understood intuitively:**

**AI feedback:**

**Anything to fix in V3 before starting V4:**

---

## Backlog — Deferred to V5+
- Leaderboards
- Ranked matchmaking
- Friend system
- Spectator mode
- Detailed per-piece stats
- Replay system
- Username customization beyond first edit