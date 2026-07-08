import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { FoodLogProvider } from "../context/FoodLogContext";

export default function RootLayout() {
  return (
    <FoodLogProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
      <StatusBar style="dark" />
    </FoodLogProvider>
  );
}
