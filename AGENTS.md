# Expo SDK 57 guidance

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Project Instructions

- Stack: React Native, Expo, TypeScript, and Expo Router.
- Keep the app compatible with Android, iOS, and web.
- Use the existing `src/theme/theme.ts` system. Do not hardcode screen colours.
- Use safe-area insets instead of fixed top padding.
- Prefer reusable components, shared types, utilities, and services over duplicated logic.
- Preserve existing user changes and do not modify unrelated files.
- Do not run destructive Git commands.
- Do not commit automatically unless explicitly requested.
- Use `npx expo install` when installing Expo-compatible packages.
- After TypeScript changes, run `npx tsc --noEmit`.
- Maintain accessibility labels, suitable touch targets, keyboard handling, and responsive layouts.
- Explain significant architecture changes before implementing them.
- Never edit `node_modules` or generated build files.
