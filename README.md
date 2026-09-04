# CaloriBite

CaloriBite is a cross-platform nutrition diary built to make daily calorie and
macronutrient tracking focused and approachable. It runs on Android, iOS, and
the web from a shared React Native codebase.

The product is intended to help people record meals, understand daily progress,
and turn a small health profile into practical nutrition targets. CaloriBite is
under active development toward a commercial product.

## Current features

- Email/password account creation and sign-in with email-code verification
- Password recovery on web, Android, and iOS using single-use Supabase links
- Protected navigation for signed-in and signed-out experiences
- Optional health-profile onboarding with input validation and safety guidance
- Estimated basal metabolic rate, maintenance calories, and goal-adjusted
  calorie and macronutrient targets
- Editable nutrition targets with default restoration and profile-based
  recalculation
- Daily diary navigation for today and previous dates
- Calorie and macronutrient progress summaries
- Search across a bundled starter food catalogue
- Manual food entry and review before saving
- Meal grouping across breakfast, lunch, dinner, and snacks
- Removal of individual entries or all entries for a selected day
- Light and dark themes with responsive, safe-area-aware layouts

## Technology stack

- React Native 0.86 and React 19
- Expo SDK 57 and Expo Router
- TypeScript with strict type checking
- Supabase Auth, PostgREST, PostgreSQL, and row-level security
- AsyncStorage for device-local persistence

## Architecture overview

Expo Router screens live in `src/app`. Reusable interface components are in
`src/components`, while React contexts own authentication, food logs, health
profiles, and nutrition-target state. Domain calculations and synchronization
logic live under `src/services`; shared models and validation limits live in
`src/types`; and the application theme is centralized in `src/theme/theme.ts`.

The `supabase/migrations` directory contains the versioned database migration
for synchronized nutrition targets, including its access-control policy and
authenticated update function.

## Authentication and owner-isolated data

Supabase manages account sessions, password authentication, signup verification,
password recovery, and sign-out. App routes are protected according to session,
recovery, and onboarding state. During recovery, the temporary recovery session
is isolated from signed-in data providers until the password is updated and the
local session is ended.

Password recovery uses Supabase's PKCE flow. The callback is processed only by
the `/update-password` route; authorization codes are exchanged by the Supabase
client and are never stored. A short-lived, non-secret recovery marker supports
web refresh and native app resume without treating an ordinary signed-in
session as password-recovery authority.

Food logs and health profiles currently remain in AsyncStorage on the device.
Their storage keys are namespaced by the authenticated Supabase user ID, and
state is cleared and rehydrated when account ownership changes so one signed-in
user is not shown another user's local records.

Nutrition targets are also cached per user locally and are synchronized with
Supabase. The database enables row-level security and restricts reads and
updates to the authenticated owner identified by `auth.uid()`.

## Nutrition-target synchronization

Target edits are written to a per-user local cache and synchronized through an
authenticated PostgREST client. Each mutation carries an ID and base revision.
The database function applies updates serially, handles duplicate requests
idempotently, and rejects stale revisions. On a conflict, the client refreshes
the server version, rebases the pending local edit once, and retries it. Pending
changes remain available for a later retry after transport failures.

## Local development

Prerequisites:

- Node.js 22.13 or newer (the minimum documented for Expo SDK 57)
- npm
- A Supabase project with the included migration applied
- An Android emulator, iOS simulator on macOS, physical device, or web browser

Setup:

1. Install dependencies.

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and supply your own Supabase client
   configuration. Never use a Supabase service-role key in this client app.

3. Apply `supabase/migrations/20260729005627_create_nutrition_targets.sql` to
   the target Supabase project.

4. Start Expo.

   ```bash
   npx expo start
   ```

Use the Expo terminal shortcuts to select Android, iOS, or web.

### Password-recovery URL configuration

The app scheme is `caloribite`. In Supabase Authentication > URL Configuration,
allow these exact redirect URLs:

```text
http://localhost:8081/update-password
http://127.0.0.1:8081/update-password
caloribite://update-password
https://caloribite.com/update-password
```

Replace or extend the production web entry when the deployed domain changes.
The production site must serve Expo Router's `/update-password` route and return
the app shell on a direct request. Android and iOS builds must retain the
`caloribite` scheme from `app.json`; scheme changes require a new native build.
Test native recovery with a development or release build, not Expo Go, so the
custom scheme and callback ownership match production behavior.

Use the Supabase **Reset password** email template and preserve the generated
recovery link (normally `{{ .ConfirmationURL }}`). If a custom template builds
its own URL, it must carry the template's `{{ .RedirectTo }}` and `{{ .TokenHash }}`
values correctly. Configure custom SMTP/Resend in the hosted Supabase project;
never place SMTP credentials in this repository or in Expo public variables.
The local Supabase mail server captures development messages instead of sending
them externally.

Before manual testing, apply the redirect allow-list and set the hosted
Supabase password minimum to 8 in Authentication settings. These hosted changes
are manual deployment steps and are not verified or changed by this repository.

## Environment variables

The app requires these Expo public variables:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Public API URL for the Supabase project |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable client key used with row-level security |

Variables prefixed with `EXPO_PUBLIC_` are included in the client bundle and
must not contain secrets. Real environment files are ignored by Git; only the
placeholder-only `.env.example` should be committed.

## Validation

```bash
npx expo install --check
npx expo-doctor
npx tsc --noEmit
npx expo export --platform web
git diff --check
npm audit
```

`npm audit` is for reporting. Review findings before making dependency changes.

## Development status

CaloriBite is an in-development product prototype. The flows listed under
Current features are implemented, but the app has not yet been presented here
as a production release. Food logs and health profiles are device-local;
nutrition targets are the only app records currently synchronized to Supabase.

## Planned features

The following items are planned and are not implemented in this repository:

- A broader food data source and barcode-assisted lookup
- Cross-device synchronization for food logs and health profiles
- Deeper progress insights and reporting
- Production release, monitoring, and account-management workflows

## Privacy and security

- Health profiles and food logs are stored locally on the user's device and
  scoped to the authenticated account ID.
- Nutrition-target rows are owner-isolated with Supabase row-level security.
- The app uses a publishable Supabase client key; service-role credentials must
  never be embedded in the application or committed to the repository.
- Health-based estimates are informational and are not medical advice.
- Do not use real account or health data in screenshots, demos, or bug reports.

## Author

Created by **Eliya Babu**.

- GitHub: [Eliyababu7](https://github.com/Eliyababu7)
- Website: [caloribite.com](https://caloribite.com)

## Usage notice

This repository is provided for portfolio and evaluation purposes only.
CaloriBite is intended to become a commercial product. No licence is granted
to copy, modify, distribute, sublicense, or commercially use the original
CaloriBite source code or assets. Third-party components remain subject to
their respective licences; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
