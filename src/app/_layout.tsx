import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "../context/AuthContext";
import { FoodLogProvider } from "../context/FoodLogContext";
import { useAppTheme } from "../theme/theme";

function AppNavigator() {
  const { session, isLoading } = useAuth();
  const theme = useAppTheme();

  if (isLoading) {
    return (
      <>
        <View
          style={[
            styles.loadingContainer,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <ActivityIndicator
            size="large"
            color={theme.colors.accent}
            accessibilityRole="progressbar"
            accessibilityLabel="Loading authentication"
          />
        </View>

        <StatusBar style={theme.isDark ? "light" : "dark"} />
      </>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
        }}
      >
        <Stack.Protected guard={!session}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
        </Stack.Protected>

        <Stack.Protected guard={Boolean(session)}>
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="search-food" />
          <Stack.Screen name="add-food" />
          <Stack.Screen name="confirm-food" />
        </Stack.Protected>
      </Stack>

      <StatusBar style={theme.isDark ? "light" : "dark"} />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <FoodLogProvider>
          <AppNavigator />
        </FoodLogProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
