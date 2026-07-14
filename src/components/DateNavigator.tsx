import { Pressable, StyleSheet, Text, View } from "react-native";

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

        <Text style={styles.dateText} accessibilityRole="header">
          {formatDiaryDate(selectedDateKey)}
        </Text>

        {!isToday && (
          <Pressable
            onPress={onToday}
            accessibilityRole="button"
            accessibilityLabel="Return to today"
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E6DCD6",
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
    backgroundColor: "#143D3C",
    alignItems: "center",
    justifyContent: "center",
  },

  arrowButtonDisabled: {
    backgroundColor: "#E6DCD6",
  },

  arrowText: {
    color: "#FFFFFF",
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "700",
  },

  arrowTextDisabled: {
    color: "#9AA7A6",
  },

  dateDetails: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 12,
  },

  label: {
    fontSize: 12,
    color: "#7A8A89",
    marginBottom: 2,
  },

  dateText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#143D3C",
  },

  todayText: {
    color: "#FF6B4A",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
});
