import { StyleSheet, Text, View } from "react-native";

import { ProgressBar } from "./ProgressBar";

type MacroCardProps = {
  label: string;
  current: number;
  target: number;
  unit?: string;
  fillColor?: string;
};

function calculateProgress(current: number, target: number): number {
  if (target <= 0) {
    return 0;
  }

  return Math.min(Math.round((current / target) * 100), 100);
}

export function MacroCard({
  label,
  current,
  target,
  unit = "g",
  fillColor = "#143D3C",
}: MacroCardProps) {
  const progress = calculateProgress(current, target);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.label}>{label}</Text>

        <Text style={styles.value}>
          {current}
          {unit} / {target}
          {unit}
        </Text>
      </View>

      <ProgressBar
        value={current}
        max={target}
        height={10}
        trackColor="#F0E3DC"
        fillColor={fillColor}
        style={styles.progressBar}
      />

      <Text style={styles.hint}>{progress}% of daily target</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
  },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  label: {
    fontSize: 16,
    fontWeight: "800",
    color: "#143D3C",
  },

  value: {
    fontSize: 15,
    fontWeight: "700",
    color: "#425756",
  },

  progressBar: {
    marginBottom: 6,
  },

  hint: {
    fontSize: 13,
    color: "#425756",
  },
});
