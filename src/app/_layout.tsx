import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "../context/AuthContext";
import {
  FoodLogProvider,
  useFoodLogs,
} from "../context/FoodLogContext";
import {
  HealthProfileProvider,
  useHealthProfile,
} from "../context/HealthProfileContext";
import { NutritionTargetsProvider } from "../context/NutritionTargetsContext";
import { useAppTheme } from "../theme/theme";

function LoadingScreen({ accessibilityLabel }: { accessibilityLabel: string }) {
  const theme = useAppTheme();

  return (
    <>
      <SafeAreaView
        style={[
          styles.stateContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator
          size="large"
          color={theme.colors.accent}
          accessibilityRole="progressbar"
          accessibilityLabel={accessibilityLabel}
        />
      </SafeAreaView>

      <StatusBar style={theme.isDark ? "light" : "dark"} />
    </>
  );
}

function AppNavigator() {
  const { session, isLoading } = useAuth();
  const {
    foodStorageHydrationState,
    foodStorageError,
    retryFoodStorageHydration,
  } = useFoodLogs();
  const {
    onboardingStatus,
    hydrationState: healthHydrationState,
    hydrationError: healthHydrationError,
    retryHydration: retryHealthHydration,
  } = useHealthProfile();
  const theme = useAppTheme();

  if (isLoading) {
    return <LoadingScreen accessibilityLabel="Loading authentication" />;
  }

  if (
    session &&
    (healthHydrationState === "loading" ||
      foodStorageHydrationState === "loading")
  ) {
    return (
      <LoadingScreen
        accessibilityLabel={
          healthHydrationState === "loading"
            ? "Loading health profile"
            : "Loading food logs"
        }
      />
    );
  }

  const hydrationError =
    healthHydrationState === "error"
      ? healthHydrationError
      : foodStorageHydrationState === "error"
        ? foodStorageError
        : null;
  const retryHydration =
    healthHydrationState === "error"
      ? retryHealthHydration
      : retryFoodStorageHydration;

  if (session && hydrationError) {
    return (
      <>
        <SafeAreaView
          style={[
            styles.stateContainer,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            style={[styles.errorText, { color: theme.colors.text }]}
          >
            {hydrationError}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading account data"
            onPress={retryHydration}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: theme.colors.accent },
              pressed && styles.retryButtonPressed,
            ]}
          >
            <Text
              style={[styles.retryButtonText, { color: theme.colors.onAccent }]}
            >
              Retry
            </Text>
          </Pressable>
        </SafeAreaView>

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
          <Stack.Screen name="verify-email" />
        </Stack.Protected>

        <Stack.Protected guard={Boolean(session)}>
          <Stack.Protected guard={onboardingStatus !== "required"}>
            <Stack.Screen name="dashboard" />
            <Stack.Screen name="search-food" />
            <Stack.Screen name="add-food" />
            <Stack.Screen name="confirm-food" />
            <Stack.Screen name="nutrition-targets" />
          </Stack.Protected>
          <Stack.Screen name="health-profile" />
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
        <HealthProfileProvider>
          <NutritionTargetsProvider>
            <FoodLogProvider>
              <AppNavigator />
            </FoodLogProvider>
          </NutritionTargetsProvider>
        </HealthProfileProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  stateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 20,
  },
  errorText: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 48,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonPressed: {
    opacity: 0.8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
