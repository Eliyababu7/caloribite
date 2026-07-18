import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { FoodLogProvider } from "../context/FoodLogContext";
import { useAppTheme } from "../theme/theme";

export default function RootLayout() {
  const theme = useAppTheme();

  return (
    <SafeAreaProvider>
      <FoodLogProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: theme.colors.background,
            },
          }}
        />

        <StatusBar style={theme.isDark ? "light" : "dark"} />
      </FoodLogProvider>
    </SafeAreaProvider>
  );
}
