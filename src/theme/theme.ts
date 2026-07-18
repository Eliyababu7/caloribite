import { useColorScheme } from "react-native";

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  brand: string;
  onBrand: string;
  accent: string;
  accentMuted: string;
  border: string;
  progressTrack: string;
  danger: string;
  placeholder: string;
  disabled: string;
  disabledText: string;
  onAccent: string;
};

export type AppTheme = {
  isDark: boolean;
  colors: ThemeColors;
};

export const lightTheme: AppTheme = {
  isDark: false,

  colors: {
    background: "#FFF7F2",
    surface: "#FFFFFF",
    surfaceMuted: "#FAF3EF",
    text: "#143D3C",
    textSecondary: "#425756",
    brand: "#143D3C",
    onBrand: "#FFFFFF",
    accent: "#FF6B4A",
    accentMuted: "#FFF0E9",
    border: "#E6DCD6",
    progressTrack: "#F0E3DC",
    danger: "#C0392B",
    placeholder: "#82908F",
    disabled: "#E6DCD6",
    disabledText: "#82908F",
    onAccent: "#FFFFFF",
  },
};

export const darkTheme: AppTheme = {
  isDark: true,

  colors: {
    background: "#081C1B",
    surface: "#12302F",
    surfaceMuted: "#193A38",
    text: "#F4FAF9",
    textSecondary: "#B7C9C7",
    brand: "#69C0B8",
    onBrand: "#071716",
    accent: "#FF8266",
    accentMuted: "#422A25",
    border: "#31504D",
    progressTrack: "#294744",
    danger: "#FF8A80",
    placeholder: "#8FA5A2",
    disabled: "#29413F",
    disabledText: "#78908D",
    onAccent: "#071716",
  },
};

export function useAppTheme(): AppTheme {
  const colorScheme = useColorScheme();

  return colorScheme === "dark" ? darkTheme : lightTheme;
}
