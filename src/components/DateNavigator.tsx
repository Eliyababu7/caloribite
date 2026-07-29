import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AppTheme } from "../theme/theme";
import { useAppTheme } from "../theme/theme";
import { formatDiaryDate } from "../utils/date";

type DateNavigatorProps = {
  selectedDateKey: string;
  todayDateKey: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
};

export function DateNavigator({
  selectedDateKey,
  todayDateKey,
  onPrevious,
  onNext,
  onToday,
}: DateNavigatorProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const isToday = selectedDateKey === todayDateKey;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.arrowButton}
        onPress={onPrevious}
        accessibilityRole="button"
        accessibilityLabel="View previous day"
      >
        <Text style={styles.arrowText}>‹</Text>
      </Pressable>

      <View style={styles.dateDetails}>
        <Text style={styles.label}>Diary date</Text>

        <Text
          style={styles.dateText}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          numberOfLines={2}
        >
          {formatDiaryDate(selectedDateKey)}
        </Text>

        {!isToday && (
          <Pressable
            onPress={onToday}
            accessibilityRole="button"
            accessibilityLabel="Return to today"
            hitSlop={8}
            style={styles.todayButton}
          >
            <Text style={styles.todayText}>Go to today</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={[styles.arrowButton, isToday && styles.arrowButtonDisabled]}
        onPress={onNext}
        disabled={isToday}
        accessibilityRole="button"
        accessibilityLabel="View next day"
        accessibilityState={{ disabled: isToday }}
      >
        <Text style={[styles.arrowText, isToday && styles.arrowTextDisabled]}>
          ›
        </Text>
      </Pressable>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const { colors } = theme;

  return StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 22,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    arrowButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.brand,
      alignItems: "center",
      justifyContent: "center",
    },

    arrowButtonDisabled: {
      backgroundColor: colors.disabled,
    },

    arrowText: {
      color: colors.onBrand,
      fontSize: 34,
      lineHeight: 36,
      fontWeight: "700",
    },

    arrowTextDisabled: {
      color: colors.disabledText,
    },

    dateDetails: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      paddingHorizontal: 12,
    },

    label: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 2,
    },

    dateText: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.text,
      textAlign: "center",
    },

    todayButton: {
      minWidth: 48,
      minHeight: 48,
      marginTop: 3,
      paddingHorizontal: 8,
      alignItems: "center",
      justifyContent: "center",
    },

    todayText: {
      color: colors.accent,
      fontSize: 13,
      fontWeight: "700",
    },
  });
}
