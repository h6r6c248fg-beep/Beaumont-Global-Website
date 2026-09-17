# Meridian

Your private command center — calendar, inbox, AI assistant, steroid/peptide
cycle tracking, nutrition, training and your own apps (OrgView, TraderPro),
all in one place. Sign in once, and your data follows you to every device.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend**: [Supabase](https://supabase.com) — Postgres database, Auth, and
  Edge Functions (Deno) for anything that needs a server (OAuth token
  exchange, talking to Google/Microsoft/Anthropic APIs)
- **Data layer**: TanStack Query on top of the Supabase JS client
- Every table is protected by row-level security scoped to `auth.uid()`, so
  your data is private to your account and syncs automatically across every
  device you sign into — that's just Postgres, no extra sync code needed.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. In **Project Settings → API**, copy the **Project URL** and **anon public
   key**.
3. Copy `.env.example` to `.env.local` in this folder and fill them in:

   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

## 2. Run the database migrations

Either paste the contents of `supabase/migrations/0001_init.sql` and then
`supabase/migrations/0002_seed_library.sql` into the Supabase dashboard's
**SQL Editor** and run them in order, or, if you have the
[Supabase CLI](https://supabase.com/docs/guides/cli) installed and linked to
your project:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

This creates every table (profiles, calendar, email, cycles, nutrition,
workouts, integrations, the AI assistant's conversation history, …), turns on
row-level security, and seeds shared libraries of common exercises,
compounds and whole foods you can log against immediately.

## 3. Run the app locally

```bash
npm install
npm run dev
```

Create an account from the sign-in screen (or use the magic-link option) —
that's it, the dashboard, cycles, nutrition and workout tracker all work
immediately with no further setup.

## 4. Connect the bits that need your own credentials

A few features talk to third-party services on your behalf. Because they act
as *your* app, they need *your* API credentials — we can't ship shared ones.
Everything below is optional and the app works fine without it; each
connect screen explains what's missing if you skip a step.

Add secrets to Supabase under **Project Settings → Edge Functions → Secrets**
(or `supabase secrets set KEY=value` via the CLI), then deploy the functions:

```bash
supabase functions deploy calendar-google-oauth calendar-microsoft-oauth calendar-caldav-sync \
  email-google-oauth email-microsoft-oauth email-imap-sync ai-assistant
```

### AI Assistant

- Add `ANTHROPIC_API_KEY` (from [console.anthropic.com](https://console.anthropic.com)).
- Optional: `ANTHROPIC_MODEL` to override the default model.
- The assistant reads your own calendar, macros, active cycle and recent
  workouts (via your logged-in session, respecting the same row-level
  security as everything else) to answer questions about your day.

### Google Calendar & Gmail

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com).
2. Enable the **Google Calendar API** and **Gmail API**.
3. Create an OAuth 2.0 Client ID (type: Web application). Add this redirect
   URI: `https://your-project-ref.supabase.co/functions/v1/calendar-google-oauth`
   (and the equivalent `email-google-oauth` URI for mail).
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as Supabase secrets.

### Outlook Calendar & Mail (Microsoft 365 / Outlook.com)

1. Register an app in the [Azure Portal](https://portal.azure.com) → App
   registrations.
2. Add redirect URIs for `calendar-microsoft-oauth` and `email-microsoft-oauth`
   under your functions URL, same pattern as above.
3. Add API permissions: `Calendars.Read`, `Mail.Read`, `User.Read`,
   `offline_access`.
4. Add `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` as Supabase
   secrets.

### Apple Calendar (iCloud) & iCloud Mail

Apple doesn't offer a public OAuth API for third-party calendar/mail access,
so these connect directly from the app using an **app-specific password**:

1. Go to [appleid.apple.com](https://appleid.apple.com) → Sign-In and
   Security → App-Specific Passwords → generate one.
2. In Meridian, use your iCloud email + that app-specific password when
   connecting Apple Calendar or iCloud Mail. Never use your real Apple ID
   password here.

No extra secrets are required for this path — it's called directly with
your credentials, stored on your own account's rows (protected by the same
row-level security as everything else).

### Your own apps: OrgView & TraderPro

The Finance page has connector cards ready for both. Since neither has a
public API yet, you can paste in a base URL + API key now (stored, ready for
when you wire up real sync) and log snapshots manually in the meantime so
the numbers are still useful today.

## 5. Deploy

Any static host works for the frontend (Vercel, Netlify, Cloudflare Pages —
`npm run build` outputs to `dist/`). Point its environment variables at the
same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. The Edge Functions live
on Supabase itself via `supabase functions deploy`, nothing else to host.

## 6. iOS app (TestFlight)

The `ios/` folder is a [Capacitor](https://capacitorjs.com) wrapper around
the same web app — a real native shell (app icon, launch screen, status bar
theming) with the web build loaded inside. It uses Swift Package Manager,
not CocoaPods, so there's no `pod install` step. You'll need a Mac with
Xcode and an active Apple Developer Program membership.

**Every time you want a new build** (first time, or after any code change):

```bash
cd app
npm install
npm run build
npx cap sync ios
npx cap open ios      # opens the project in Xcode
```

**In Xcode, one-time setup:**

1. Select the **App** target → **Signing & Capabilities**.
2. Check **Automatically manage signing** and pick your **Team**.
3. The bundle identifier is `com.beaumontglobal.meridian` (set in
   `capacitor.config.ts`'s `appId`) — change it there (then re-run
   `npx cap sync ios`) if you'd rather use your own, and register whichever
   ID you use as a new App ID / App Store Connect app first.

**Archive and upload:**

1. Top bar destination selector → **Any iOS Device (arm64)** (not a
   simulator — Archive is greyed out on a simulator target).
2. **Product → Archive**. When it finishes, the Organizer window opens.
3. Select the archive → **Distribute App → App Store Connect → Upload** →
   accept the defaults (automatic signing) → **Upload**.
4. Apple takes a few minutes to process the build (you'll get an email).

**Getting it onto your phone via TestFlight:**

- **Internal testers** (you, or anyone already added as a user on your
  App Store Connect team): App Store Connect → your app → **TestFlight**
  tab → add the processed build to the **App Store Connect Users**
  internal group. No review, available within minutes of processing.
- **External testers** (anyone by email, or a public link): needs a short
  Apple **Beta App Review** first (usually well under 48h for a first
  build, faster after). Set this up under the **External Testing** group
  in the same TestFlight tab.

**One known limitation:** the Google/Microsoft calendar and email
"Connect" buttons redirect out to the provider's consent screen and back —
inside the native WebView that round trip needs proper URL-scheme/Universal
Link handling to land back in the app, which isn't wired up yet. Apple
Calendar (CalDAV) and iCloud Mail connect via a plain in-app form, so those
aren't affected. Everything else (login, dashboard, calendar, nutrition,
cycles, workouts, AI assistant, finance) works the same as the web app,
since it's all just HTTPS calls to Supabase.

### Voice assistant

The mic button in Assistant calls a first-party native plugin
(`ios/App/App/SpeechPlugin.swift`) that wraps Apple's on-device Speech
framework directly — no third-party dependency, so nothing extra to
install. It needs Xcode's Signing & Capabilities to actually prompt for
microphone/speech permission on first use; if it doesn't, check that
`NSMicrophoneUsageDescription` / `NSSpeechRecognitionUsageDescription`
are still present in `Info.plist` (they should already be, this is just
a note in case something gets reset).

### Home Screen widget

There's a second target in the Xcode project, **MeridianWidgets** — a
WidgetKit extension showing today's tasks with a tap-to-complete checkbox,
built without ever running Xcode (this repo's whole iOS setup was, so this
part in particular is worth a sanity check the first time you open it):

- It shares data with the main app via an **App Group**
  (`group.com.beaumontglobal.meridian`) — the app writes a snapshot of
  today's/overdue tasks plus your Supabase URL, anon key and current
  session token into that shared storage (`SharedStorePlugin.swift`)
  whenever your tasks change; the widget reads it with no network call of
  its own (`MeridianWidgets/SharedTaskStore.swift`), and ticking a task in
  the widget (`ToggleTaskIntent.swift`, iOS 17+ interactive widgets) both
  updates that shared copy immediately and PATCHes Supabase directly to
  persist it.
- **If Xcode complains about signing** the first time you build ("App
  Groups capability" or similar): open the **App** target's Signing &
  Capabilities tab, and separately the **MeridianWidgets** target's — both
  need **App Groups** checked with `group.com.beaumontglobal.meridian`
  selected. The entitlements files already declare this; Xcode's
  automatic-signing UI just sometimes wants you to confirm it once per
  target the first time.
- Tapping the widget body (outside the checkbox) opens the app to Tasks
  via a `meridianapp://tasks` URL scheme, already registered in
  `Info.plist` and handled in `src/App.tsx`.
- **Simplification worth knowing about:** the Supabase session token used
  by the widget's tap-to-complete lives in the same App Group
  `UserDefaults` suite as the task snapshot — fine for this scope, but a
  production app should move that specifically into a shared **Keychain
  access group** instead, which is better protected at rest.
- Add a second widget for a feature covered elsewhere (calendar, cars,
  etc.) the same way: another `Widget` conforming struct added to
  `MeridianWidgetsBundle`'s `body`, reading from its own key in the same
  shared store.

## Project structure

```
app/
  src/
    features/        one folder per module (auth, dashboard, calendar,
                      email, assistant, cycles, nutrition, workouts,
                      integrations, settings)
    components/       shared layout (sidebar/topbar) + design-system UI
    lib/              supabase client, react-query client, utilities
    types/database.ts hand-written mirror of the SQL schema
  supabase/
    migrations/       SQL schema + seed data
    functions/        Deno edge functions (OAuth exchanges, CalDAV/IMAP
                      sync, the AI assistant)
```
